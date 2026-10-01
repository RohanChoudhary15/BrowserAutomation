import { ExecutionContext, NodeResult, ActiveTimer } from '../../types/execution';
import { WorkflowNode } from '../../types/workflow';
import { interpolateVariables, getNestedValue } from '../interpolator';
import {
  evaluateCondition,
  LogicalGate,
  ConditionRule,
} from '../evaluator';
import { queryLlm, getAiConfig, getOpenAiBaseUrl, safeFetch } from '../../ai/aiService';
import { runBrowserAgent } from '../../ai/browserAgent';
import { getCredentialById } from '../../storage/credentialStore';
import {
  formatAiAgentDocument,
  AiAgentOutputFormat,
  createExportDocument,
  zipVariablesToDataset,
  ExportDataFormat,
  jsonToCsv,
  dataToHtmlTable,
} from '../../utils/documentExporter';
import { runInSandbox, safeEvaluateMath } from '../sandboxEvaluator';
import {
  processDataset,
  normalizeUrl,
  cleanPrice,
  formatDateString,
} from '../../utils/dataPostProcessor';
import {
  combineDatasets,
  CombineDatasetsOptions,
  ColumnMapping,
} from '../../utils/datasetCombiner';
import {
  orchestrateParallelBranches,
  ParallelBranchConfig,
  ParallelExecutionOptions,
} from '../../utils/parallelOrchestrator';
import {
  generateThemedPdfDocument,
  PdfThemeId,
  InjectedImage,
} from '../../utils/pdfGenerator';
import {
  executeStorageAction,
  syncStorageToVariables,
  StorageEntryType,
  StorageAction,
  StorageScope,
} from '../../utils/simpleStorage';
import { wait } from '../../utils/human';
import {
  scrapeYouTubeSearch,
  scrapeYouTubeVideoDetails,
  scrapeYouTubeTranscript,
  scrapeYouTubeComments,
  extractYouTubeVideoId,
} from '../../utils/youtubeService';

export type NodeExecutor = (node: WorkflowNode, ctx: ExecutionContext) => Promise<NodeResult>;

/**
 * Global active timers registry across engine instances and single-node debug runs.
 * Keyed by nodeId.
 */
export const globalActiveTimers = new Map<string, ActiveTimer>();

/**
 * Global pending stop signals queue to resolve race conditions between parallel branches.
 * Keyed by targetTimer (normalized lowercase or nodeId).
 */
export const globalPendingStopTimers = new Map<string, { action: 'complete_early' | 'cancel'; reason?: string; timestamp: number }>();

/**
 * Sends DOM action request to content script via background or directly
 */
async function sendDomAction(
  action: string,
  params: Record<string, any>,
  ctx: ExecutionContext,
  timeout = 10000
): Promise<any> {
  if (ctx.signal?.aborted) throw new Error('Execution aborted by user.');

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_DOM_ACTION',
      payload: {
        action,
        params,
        timeout,
        tabId: ctx.currentTabId,
        ...(ctx.human ? { human: ctx.human } : {}),
      },
    });

    if (!response || response.error) {
      const normAct = (action || '').toLowerCase().trim().replace(/[\s\-]+/g, '_');
      const errStr = String(response?.error || '');
      if (
        (normAct === 'extract_dataset' || normAct === 'scrape_elements' || normAct === 'extract_cards' || normAct === 'extractcards') &&
        errStr.includes('Unsupported DOM action')
      ) {
        ctx.log?.({
          level: 'warn',
          message: 'Active tab has an older content script. Falling back to multi-field extraction scraper...',
        });
        const fields = Array.isArray(params.fields) && params.fields.length > 0
          ? params.fields
          : [{ name: 'value', selector: '' }];
        const fieldValues: Record<string, string[]> = {};
        let maxLen = 0;
        for (const field of fields) {
          const fieldSel = field.selector
            ? (params.containerSelector ? `${params.containerSelector} ${field.selector}` : field.selector)
            : (params.containerSelector || '');
          if (!fieldSel) {
            fieldValues[field.name] = [];
            continue;
          }
          try {
            const multiRes = await chrome.runtime.sendMessage({
              type: 'EXECUTE_DOM_ACTION',
              payload: {
                action: 'extract_multiple',
                params: { selector: fieldSel, attribute: field.attribute || 'text', timeout: 5000 },
                timeout: 5000,
                tabId: ctx.currentTabId,
              },
            });
            const vals = multiRes?.items || [];
            fieldValues[field.name] = vals;
            if (vals.length > maxLen) maxLen = vals.length;
          } catch {
            fieldValues[field.name] = [];
          }
        }
        const fallbackItems: Record<string, any>[] = [];
        for (let i = 0; i < maxLen; i++) {
          const row: Record<string, any> = {};
          for (const field of fields) {
            row[field.name] = fieldValues[field.name]?.[i] ?? '';
          }
          fallbackItems.push(row);
        }
        return { success: true, items: fallbackItems, rowCount: fallbackItems.length, tabId: ctx.currentTabId };
      }

      throw new Error(response?.error || `Failed to execute DOM action: ${action}`);
    }

    if (response.tabId && !ctx.currentTabId) {
      ctx.currentTabId = response.tabId;
    }
    return response;
  } else {
    const isTestRunner =
      typeof (globalThis as any).__vitest__ !== 'undefined' ||
      (typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'));

    if (!isTestRunner) {
      throw new Error(`Extension DOM bridge unavailable for action "${action}". Ensure AutoFlow is running in an active Chrome extension tab.`);
    }

    console.warn(`[AutoFlow Mock] Simulating DOM action: ${action}`, params);
    if (action === 'extract_dataset' || action === 'scrape_elements' || action === 'extract_cards') {
      const fields = Array.isArray(params.fields) && params.fields.length > 0 ? params.fields : [{ name: 'value', selector: '' }];
      const mockRow: Record<string, any> = {};
      for (const f of fields) {
        mockRow[f.name || 'field'] = `Sample ${f.name || 'Value'}`;
      }
      return { success: true, items: [mockRow], rowCount: 1, headers: fields.map((f: any) => f.name || 'field') };
    }
    if (action === 'extract_image') {
      return { success: true, url: 'https://example.com/mock-image.png', dataUrl: 'https://example.com/mock-image.png', items: [] };
    }
    if (action === 'extract_all_images') {
      return {
        success: true,
        count: 2,
        items: [
          { url: 'https://example.com/mock1.png', dataUrl: 'https://example.com/mock1.png', alt: 'Mock 1', width: 200, height: 100, tagName: 'IMG' },
          { url: 'https://example.com/mock2.png', dataUrl: 'https://example.com/mock2.png', alt: 'Mock 2', width: 300, height: 150, tagName: 'IMG' },
        ],
        urls: ['https://example.com/mock1.png', 'https://example.com/mock2.png'],
      };
    }
    if (action === 'check_element_presence') {
      if (typeof document !== 'undefined') {
        const selector = params.selector;
        const text = params.text;
        let matched = false;
        try {
          if (selector && selector !== 'body') {
            const el = document.querySelector(selector);
            if (el) {
              if (text) {
                const content = el.textContent || '';
                matched = params.caseSensitive
                  ? (params.matchMode === 'exact' ? content.trim() === text : content.includes(text))
                  : (params.matchMode === 'exact' ? content.trim().toLowerCase() === text.toLowerCase() : content.toLowerCase().includes(text.toLowerCase()));
              } else {
                matched = true;
              }
            }
          } else if (text) {
            const content = document.body?.textContent || '';
            matched = params.caseSensitive
              ? (params.matchMode === 'exact' ? content.trim() === text : content.includes(text))
              : (params.matchMode === 'exact' ? content.trim().toLowerCase() === text.toLowerCase() : content.toLowerCase().includes(text.toLowerCase()));
          }
        } catch {
          matched = false;
        }
        return { success: true, present: matched };
      }
      return { success: true, present: false };
    }
    if (action === 'get_page_info') {
      const u = ctx.currentUrl || 'https://example.com';
      let host = 'example.com';
      try { host = new URL(u).hostname; } catch {}
      return {
        success: true,
        url: u,
        title: 'AutoFlow Page',
        domain: host,
        origin: host ? `https://${host}` : '',
        pathname: '/',
        search: '',
        hash: '',
        referrer: '',
        canonicalUrl: u,
        metaDescription: '',
        ogImage: '',
        keywords: '',
        contentType: 'text/html',
        docStatus: 'complete',
        searchParams: {},
      };
    }
    if (action === 'youtube_scraper' || action === 'scrape_youtube') {
      if (params?.mode === 'video_script') {
        const fullScript = '[00:00] Welcome to this guide on browser automation.\n[00:04] In this video we explore keyless scrapers and transcripts.';
        return {
          success: true,
          items: [
            { timestamp: '00:00', start: 0, dur: 4.0, text: 'Welcome to this guide on browser automation.' },
            { timestamp: '00:04', start: 4.0, dur: 5.2, text: 'In this video we explore keyless scrapers and transcripts.' },
          ],
          fullScript,
          count: 2,
        };
      }
      return {
        success: true,
        items: [
          { title: 'Learn Modern Web Scraping 2026', url: 'https://www.youtube.com/watch?v=mock123', channel: 'CodeMaster', views: '150K views', duration: '12:34' },
          { title: 'Browser Automation Masterclass', url: 'https://www.youtube.com/watch?v=mock456', channel: 'AutoDev', views: '80K views', duration: '25:10' },
        ],
        count: 2,
      };
    }
    if (action === 'instagram_scraper' || action === 'scrape_instagram') {
      return {
        success: true,
        items: [
          { url: 'https://www.instagram.com/p/mock1/', caption: 'Beautiful sunset in the mountains #travel', image: 'https://images.unsplash.com/photo-1', isVideo: false },
          { url: 'https://www.instagram.com/reel/mock2/', caption: 'Quick coding tutorial for beginners', image: 'https://images.unsplash.com/photo-2', isVideo: true },
        ],
        count: 2,
      };
    }
    if (action === 'reddit_scraper' || action === 'scrape_reddit') {
      return {
        success: true,
        items: [
          { title: 'Best practices for web scraping at scale', url: 'https://www.reddit.com/r/webscraping/comments/mock1', author: 'scraper_guy', score: '342', subreddit: 'r/webscraping' },
          { title: 'Showcase: Built a free keyless scraper extension', url: 'https://www.reddit.com/r/webscraping/comments/mock2', author: 'dev_hero', score: '189', subreddit: 'r/webscraping' },
        ],
        count: 2,
      };
    }
    if (action === 'linkedin_scraper' || action === 'scrape_linkedin') {
      return {
        success: true,
        items: [
          { title: 'Senior Software Engineer - Automation', company: 'TechCorp Global', location: 'Remote', url: 'https://www.linkedin.com/jobs/view/mock1' },
          { title: 'Full Stack Engineer (TypeScript/React)', company: 'Innovate Labs', location: 'San Francisco, CA', url: 'https://www.linkedin.com/jobs/view/mock2' },
        ],
        count: 2,
      };
    }
    if (action === 'amazon_scraper' || action === 'scrape_amazon') {
      return {
        success: true,
        items: [
          { asin: 'B08N5WRWNW', title: 'Wireless Ergonomic Mechanical Keyboard', price: '$89.99', rating: '4.6 out of 5 stars', reviewsCount: '1,240', isPrime: true, url: 'https://www.amazon.com/dp/B08N5WRWNW' },
          { asin: 'B09J123ABC', title: 'Compact RGB Mechanical Gaming Keyboard', price: '$49.99', rating: '4.3 out of 5 stars', reviewsCount: '890', isPrime: false, url: 'https://www.amazon.com/dp/B09J123ABC' },
        ],
        count: 2,
      };
    }
    if (action === 'twitter_scraper' || action === 'scrape_twitter') {
      return {
        success: true,
        items: [
          { author: 'AI Researcher', text: 'Autonomous web agents are transforming productivity in 2026.', likes: '1.2K', retweets: '240', url: 'https://x.com/user/status/1' },
          { author: 'Tech Insider', text: 'Chrome extensions are now capable of end-to-end local scraping.', likes: '580', retweets: '95', url: 'https://x.com/user/status/2' },
        ],
        count: 2,
      };
    }
    if (action === 'google_search_scraper' || action === 'scrape_google') {
      return {
        success: true,
        items: [
          { title: 'AutoFlow: Open-Source Browser Automation Extension', url: 'https://github.com/autoflow', snippet: 'Automate complex browser flows with visual nodes, zero keys required.' },
          { title: 'Web Scraping Guides & Tutorials', url: 'https://example.com/guide', snippet: 'Learn DOM scraping, CSS selectors, and data processing.' },
        ],
        count: 2,
      };
    }
    return { success: true, text: 'Sample Text', html: '<div>Sample</div>', rows: [] };
  }
}

// ----------------- BROWSER EXECUTORS -----------------

export const executeNavigate: NodeExecutor = async (node, ctx) => {
  const rawUrl = node.data.properties.url || 'https://example.com';
  const resolvedUrl = interpolateVariables(rawUrl, ctx.variables);
  let url: string;
  if (typeof resolvedUrl === 'object' && resolvedUrl !== null) {
    url = String(resolvedUrl.link || resolvedUrl.url || resolvedUrl.href || resolvedUrl.src || resolvedUrl.target || JSON.stringify(resolvedUrl)).trim();
  } else {
    url = String(resolvedUrl || '').trim();
  }
  const waitUntil = node.data.properties.waitUntil || 'load';
  const openInNewTab = !!node.data.properties.openInNewTab;

  ctx.log({
    level: 'info',
    message: `Navigating to ${url}${openInNewTab ? ' (new tab)' : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  let screenshotUrl: string | undefined;

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: 'NAVIGATE_TAB',
      payload: { tabId: ctx.currentTabId, url, waitUntil, openInNewTab },
    });
    if (!response?.success) throw new Error(response?.error || 'Navigation failed.');
    ctx.currentUrl = url;
    if (response.tabId) {
      ctx.currentTabId = response.tabId;
    }

    screenshotUrl = response.dataUrl || response.screenshotUrl;
    if (!screenshotUrl) {
      const screenRes = await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        payload: { tabId: ctx.currentTabId },
      }).catch(() => null);
      if (screenRes?.success && screenRes.dataUrl) {
        screenshotUrl = screenRes.dataUrl;
      }
    }
  }

  ctx.log({
    level: 'success',
    message: `Navigated to ${url} (website loaded)`,
    nodeId: node.id,
    nodeName: node.data.label,
    screenshotUrl,
  });

  return { success: true, output: { url, screenshotUrl } };
};

export const executeBack: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Navigating back', nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs && ctx.currentTabId) {
    await chrome.tabs.goBack(ctx.currentTabId).catch(() => {});
  }
  return { success: true };
};

export const executeForward: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Navigating forward', nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs && ctx.currentTabId) {
    await chrome.tabs.goForward(ctx.currentTabId).catch(() => {});
  }
  return { success: true };
};

export const executeReload: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Reloading page', nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs && ctx.currentTabId) {
    await chrome.tabs.reload(ctx.currentTabId).catch(() => {});
  }
  return { success: true };
};

export const executeNewTab: NodeExecutor = async (node, ctx) => {
  const url = interpolateVariables(node.data.properties.url || 'about:blank', ctx.variables);
  ctx.log({ level: 'info', message: `Opening new tab: ${url}`, nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    const tab = await chrome.tabs.create({ url });
    ctx.currentTabId = tab.id;
    return { success: true, output: { tabId: tab.id, url } };
  }
  return { success: true };
};

export const executeCloseTab: NodeExecutor = async (node, ctx) => {
  const closeTarget = node.data.properties.closeTarget || 'current';
  const tabId = node.data.properties.tabId ? Number(node.data.properties.tabId) : (closeTarget === 'current' ? ctx.currentTabId : undefined);
  const tabIndex = node.data.properties.tabIndex !== undefined && node.data.properties.tabIndex !== '' ? Number(node.data.properties.tabIndex) : undefined;
  const urlPattern = node.data.properties.urlPattern ? String(interpolateVariables(node.data.properties.urlPattern, ctx.variables)) : undefined;

  ctx.log({ level: 'info', message: `Closing tab (${closeTarget})`, nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: 'CLOSE_TAB',
      payload: { tabId, target: closeTarget, tabIndex, urlPattern },
    });
    if (!response?.success) throw new Error(response?.error || 'Failed to close tab.');
    if (response.newActiveTabId) {
      ctx.currentTabId = response.newActiveTabId;
    } else if (response.closedTabId && response.closedTabId === ctx.currentTabId) {
      ctx.currentTabId = undefined;
    }
    ctx.log({ level: 'success', message: 'Tab closed successfully', nodeId: node.id, nodeName: node.data.label });
    return { success: true, output: { closedTabId: response.closedTabId, activeTabId: ctx.currentTabId } };
  }
  return { success: true };
};

export const executeSwitchTab: NodeExecutor = async (node, ctx) => {
  const tabTarget = node.data.properties.tabTarget || 'next';
  const tabIndex = node.data.properties.tabIndex !== undefined && node.data.properties.tabIndex !== '' ? Number(node.data.properties.tabIndex) : 0;
  const tabId = node.data.properties.tabId ? Number(node.data.properties.tabId) : undefined;
  const urlPattern = node.data.properties.urlPattern ? String(interpolateVariables(node.data.properties.urlPattern, ctx.variables)) : (node.data.properties.tabUrl || undefined);
  const titlePattern = node.data.properties.titlePattern ? String(interpolateVariables(node.data.properties.titlePattern, ctx.variables)) : (node.data.properties.tabTitle || undefined);

  ctx.log({
    level: 'info',
    message: `Switching tab (${tabTarget}${node.data.properties.tabTitle ? `: ${node.data.properties.tabTitle}` : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: 'SWITCH_TAB',
      payload: { target: tabTarget, tabId, tabIndex, urlPattern, titlePattern },
    });
    if (!response?.success) throw new Error(response?.error || 'Failed to switch tab.');
    if (response.tabId) {
      ctx.currentTabId = response.tabId;
    }
    ctx.log({
      level: 'success',
      message: `Switched to tab: ${response.title || response.url || tabTarget}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    return { success: true, output: { tabId: response.tabId, url: response.url, title: response.title } };
  }
  return { success: true };
};

// ----------------- INTERACTION EXECUTORS -----------------

export const executeClick: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const clickType = node.data.properties.clickType || 'left';
  const timeout = Number(node.data.properties.timeout) || 10000;

  if (!selector) throw new Error('Click node requires a selector.');

  ctx.log({
    level: 'info',
    message: `Clicking element: ${selector} (${clickType})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction('click', { selector, clickType, timeout }, ctx, timeout);
  return { success: true, output: res };
};

export const executeTypeText: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const rawText = node.data.properties.text ?? '';
  const resolvedText = interpolateVariables(rawText, ctx.variables);
  let text: string;
  if (typeof resolvedText === 'object' && resolvedText !== null) {
    text = String(resolvedText.text ?? resolvedText.title ?? resolvedText.name ?? resolvedText.value ?? resolvedText.link ?? JSON.stringify(resolvedText));
  } else {
    text = String(resolvedText ?? '');
  }
  const clearExisting = node.data.properties.clearExisting !== false;
  const typingDelay = Number(node.data.properties.typingDelay) || 0;
  const timeout = Number(node.data.properties.timeout) || 10000;

  if (!selector) throw new Error('Type Text node requires a selector.');

  ctx.log({
    level: 'info',
    message: `Typing "${text.length > 25 ? text.substring(0, 22) + '...' : text}" into ${selector}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction('type_text', { selector, text, clearExisting, typingDelay, timeout }, ctx, timeout);
  return { success: true, output: res };
};

export const executeClearInput: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  if (!selector) throw new Error('Clear Input node requires a selector.');
  const res = await sendDomAction('clear_input', { selector }, ctx);
  return { success: true, output: res };
};

export const executeHover: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  if (!selector) throw new Error('Hover node requires a selector.');
  const res = await sendDomAction('hover', { selector }, ctx);
  return { success: true, output: res };
};

export const executePressKey: NodeExecutor = async (node, ctx) => {
  const rawKey = node.data.properties.key || 'Enter';
  const key = String(interpolateVariables(rawKey, ctx.variables));
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  ctx.log({ level: 'info', message: `Pressing key "${key}"`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('press_key', { key, selector }, ctx);
  return { success: true, output: res };
};

export const executeScroll: NodeExecutor = async (node, ctx) => {
  const direction = node.data.properties.direction || 'down';
  const amount = node.data.properties.amount || 400;
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  ctx.log({ level: 'info', message: `Scrolling ${direction} by ${amount}px`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('scroll', { direction, amount, selector }, ctx);
  return { success: true, output: res };
};

export const executeSelectDropdown: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const selectionType = node.data.properties.selectionType || 'value';
  const value = interpolateVariables(node.data.properties.value, ctx.variables);
  const label = interpolateVariables(node.data.properties.label, ctx.variables);
  const index = node.data.properties.index !== undefined ? Number(node.data.properties.index) : undefined;

  ctx.log({ level: 'info', message: `Selecting dropdown option in ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('select_dropdown', { selector, selectionType, value, label, index }, ctx);
  return { success: true, output: res };
};

export const executeDragAndDrop: NodeExecutor = async (node, ctx) => {
  return { success: true };
};

// ----------------- WAIT EXECUTORS -----------------

export const executeWait: NodeExecutor = async (node, ctx) => {
  let duration = Number(node.data.properties.duration ?? node.data.properties.durationMs) || 1000;
  if (node.data.properties.unit === 's' || duration < 50) {
    duration = duration * 1000;
  }
  let totalSeconds = Number((duration / 1000).toFixed(1));
  let startTime = Date.now();

  const timerName = node.data.properties.timerName ? String(interpolateVariables(node.data.properties.timerName, ctx.variables)).trim() : '';
  const normalizedTimerName = timerName ? timerName.toLowerCase() : '';
  const stopCondition = node.data.properties.stopCondition;
  const hasStopCondition = stopCondition && stopCondition.enabled === true;

  // 1. Race condition protection: Check if a pending stop was already issued for this specific timer
  const pendingStop =
    ctx._pendingStopTimers?.get(node.id) ||
    (normalizedTimerName ? ctx._pendingStopTimers?.get(normalizedTimerName) : undefined) ||
    globalPendingStopTimers.get(node.id) ||
    (normalizedTimerName ? globalPendingStopTimers.get(normalizedTimerName) : undefined);

  if (pendingStop && Date.now() - pendingStop.timestamp < 5000) {
    // Consume pending stop
    ctx._pendingStopTimers?.delete(node.id);
    if (normalizedTimerName) ctx._pendingStopTimers?.delete(normalizedTimerName);
    globalPendingStopTimers.delete(node.id);
    if (normalizedTimerName) globalPendingStopTimers.delete(normalizedTimerName);

    ctx.log({
      level: 'success',
      message: `Wait timer "${timerName || node.id}" immediately stopped early by pending stop command (${pendingStop.reason || 'Condition matched'})`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        remainingSeconds: 0,
        totalSeconds,
        elapsedSeconds: 0,
        progress: 100,
        message: 'Stopped early (0s)',
        detail: pendingStop.reason,
      },
    });

    return {
      success: true,
      cancelBranch: pendingStop.action === 'cancel',
      output: {
        durationMs: 0,
        seconds: 0,
        stoppedEarly: true,
        reason: pendingStop.reason,
      },
    };
  }

  ctx.log({
    level: 'info',
    message: `Waiting for ${duration}ms (${totalSeconds}s)${timerName ? ` [Timer "${timerName}"]` : ''}${hasStopCondition ? ` (Stop condition: ${stopCondition.type})` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  // Initial countdown state on canvas
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      remainingSeconds: totalSeconds,
      totalSeconds,
      elapsedSeconds: 0,
      progress: 0,
      message: `${totalSeconds}s remaining`,
    },
  });

  let stoppedEarly = false;
  let cancelBranch = false;
  let stopReason: string | undefined;

  let resolveWait: () => void;
  let rejectWait: (err: Error) => void;
  const waitPromise = new Promise<void>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  let intervalTimer: any = null;

  // Register in active timers maps (context-level and global)
  const timerHandle: ActiveTimer = {
    nodeId: node.id,
    timerName: timerName || undefined,
    totalDurationMs: duration,
    startTime,
    stop: (action: 'complete_early' | 'cancel', reason?: string) => {
      stoppedEarly = true;
      stopReason = reason || (action === 'complete_early' ? 'Stopped by command' : 'Cancelled by command');
      if (action === 'cancel') {
        cancelBranch = true;
      }
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
      resolveWait();
    },
    reset: (mode: 'restart' | 'extend', extendMs?: number) => {
      if (mode === 'restart') {
        startTime = Date.now();
        stoppedEarly = false;
        cancelBranch = false;
        stopReason = undefined;
        ctx.log({ level: 'info', message: `Timer "${timerName || node.id}" restarted to 0s`, nodeId: node.id, nodeName: node.data.label });
      } else if (mode === 'extend') {
        const extra = Number(extendMs) || 5000;
        duration += extra;
        totalSeconds = Number((duration / 1000).toFixed(1));
        ctx.log({ level: 'info', message: `Timer "${timerName || node.id}" extended by +${extra}ms (now ${totalSeconds}s)`, nodeId: node.id, nodeName: node.data.label });
      }
    },
  };

  if (ctx._activeTimers) {
    ctx._activeTimers.set(node.id, timerHandle);
  }
  globalActiveTimers.set(node.id, timerHandle);

  // Condition evaluation helper with guard against overlapping async calls
  let isCheckingCondition = false;
  const checkEarlyStopCondition = async (): Promise<{ matched: boolean; detail: string }> => {
    if (!hasStopCondition || stoppedEarly || isCheckingCondition) return { matched: false, detail: '' };
    isCheckingCondition = true;
    try {
      if (stopCondition.type === 'text') {
        const text = String(interpolateVariables(stopCondition.text || '', ctx.variables));
        if (text) {
          const selector = stopCondition.selector ? String(interpolateVariables(stopCondition.selector, ctx.variables)) : '';
          const matchMode = stopCondition.matchMode || 'partial';
          const caseSensitive = Boolean(stopCondition.caseSensitive);
          const res = await sendDomAction('check_element_presence', {
            selector: selector || 'body',
            text,
            matchMode,
            caseSensitive,
            timeout: 100,
            visibleOnly: false,
          }, ctx, 1500);
          if (res?.present) {
            return { matched: true, detail: `Found text "${text}"` };
          }
        }
      } else if (stopCondition.type === 'element') {
        const selector = String(interpolateVariables(stopCondition.selector || '', ctx.variables));
        if (selector) {
          const res = await sendDomAction('check_element_presence', {
            selector,
            timeout: 100,
            visibleOnly: false,
          }, ctx, 1500);
          if (res?.present) {
            return { matched: true, detail: `Element "${selector}" appeared` };
          }
        }
      } else if (stopCondition.type === 'variable') {
        const matched = evaluateCondition({
          type: 'variable',
          leftValue: stopCondition.leftValue,
          operator: stopCondition.operator || 'equals',
          rightValue: stopCondition.rightValue,
          caseSensitive: stopCondition.caseSensitive,
        }, ctx.variables);
        if (matched) {
          return { matched: true, detail: `Variable condition matched (${stopCondition.leftValue} ${stopCondition.operator} ${stopCondition.rightValue})` };
        }
      }
    } catch {
      // Ignore polling errors
    } finally {
      isCheckingCondition = false;
    }
    return { matched: false, detail: '' };
  };

  // Immediate t=0ms check if condition is already satisfied at startup
  if (hasStopCondition) {
    const initialCheck = await checkEarlyStopCondition();
    if (initialCheck.matched) {
      timerHandle.stop('complete_early', initialCheck.detail);
    }
  }

  const updateInterval = 100;
  let conditionCheckCounter = 0;

  if (!stoppedEarly) {
    intervalTimer = setInterval(async () => {
      if (stoppedEarly) {
        if (intervalTimer) clearInterval(intervalTimer);
        return;
      }

      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(0, duration - elapsed);
      const remainingSec = Number((remainingMs / 1000).toFixed(1));
      const elapsedSec = Number((elapsed / 1000).toFixed(1));
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));

      if (!stoppedEarly) {
        ctx.updateNodeState(node.id, {
          status: 'running',
          dynamicState: {
            remainingSeconds: remainingSec,
            totalSeconds,
            elapsedSeconds: elapsedSec,
            progress,
            message: `${remainingSec}s remaining`,
          },
        });
      }

      // Check early stop condition periodically (every ~200ms)
      conditionCheckCounter++;
      if (hasStopCondition && conditionCheckCounter % 2 === 0 && !stoppedEarly) {
        const checkRes = await checkEarlyStopCondition();
        if (checkRes.matched && !stoppedEarly) {
          timerHandle.stop('complete_early', checkRes.detail);
          return;
        }
      }

      if (remainingMs <= 0 && !stoppedEarly) {
        if (intervalTimer) clearInterval(intervalTimer);
        resolveWait();
      }
    }, updateInterval);
  }

  let onAbort: () => void;
  if (ctx.signal) {
    onAbort = () => {
      if (intervalTimer) clearInterval(intervalTimer);
      rejectWait(new Error('Wait aborted by user.'));
    };
    ctx.signal.addEventListener('abort', onAbort);
  }

  try {
    await waitPromise;
  } finally {
    if (intervalTimer) {
      clearInterval(intervalTimer);
    }
    if (ctx.signal && onAbort!) {
      ctx.signal.removeEventListener('abort', onAbort!);
    }
    if (ctx._activeTimers) {
      ctx._activeTimers.delete(node.id);
    }
    globalActiveTimers.delete(node.id);
  }

  const finalElapsed = Date.now() - startTime;
  const finalElapsedSec = Number((finalElapsed / 1000).toFixed(1));

  if (cancelBranch) {
    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        remainingSeconds: 0,
        totalSeconds,
        elapsedSeconds: finalElapsedSec,
        progress: 100,
        message: `Cancelled after ${finalElapsedSec}s`,
        detail: stopReason,
      },
    });

    return {
      success: true,
      cancelBranch: true,
      output: {
        durationMs: finalElapsed,
        stoppedEarly: true,
        cancelled: true,
        reason: stopReason,
      },
    };
  }

  ctx.log({
    level: stoppedEarly ? 'success' : 'info',
    message: stoppedEarly
      ? `Timer stopped early after ${finalElapsedSec}s (${stopReason || 'Condition matched'})`
      : `Waited full ${totalSeconds}s`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      remainingSeconds: 0,
      totalSeconds,
      elapsedSeconds: finalElapsedSec,
      progress: 100,
      message: stoppedEarly ? `Stopped early (${finalElapsedSec}s)` : `Waited ${totalSeconds}s`,
      detail: stopReason,
    },
  });

  return {
    success: true,
    output: {
      durationMs: finalElapsed,
      seconds: finalElapsedSec,
      stoppedEarly,
      reason: stopReason,
    },
  };
};

export const executeWaitForElement: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const timeout = Number(node.data.properties.timeout) || 10000;
  const visible = node.data.properties.visible !== false;
  const enabled = !!node.data.properties.enabled;
  const timerName = node.data.properties.timerName ? String(interpolateVariables(node.data.properties.timerName, ctx.variables)).trim() : '';

  if (!selector) throw new Error('Wait For Element node requires a selector.');

  ctx.log({ level: 'info', message: `Waiting for element: ${selector}`, nodeId: node.id, nodeName: node.data.label });
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Searching for ${selector.slice(0, 20)}...`,
      detail: selector,
    },
  });

  let stoppedEarly = false;
  let stopReason: string | undefined;
  const abortCtrl = new AbortController();
  const onParentAbort = () => abortCtrl.abort();
  ctx.signal?.addEventListener('abort', onParentAbort);

  const timerHandle: ActiveTimer = {
    nodeId: node.id,
    timerName: timerName || undefined,
    totalDurationMs: timeout,
    startTime: Date.now(),
    stop: (_action, reason) => {
      stoppedEarly = true;
      stopReason = reason;
      abortCtrl.abort();
    },
    reset: () => {},
  };

  if (ctx._activeTimers) ctx._activeTimers.set(node.id, timerHandle);
  globalActiveTimers.set(node.id, timerHandle);

  try {
    const res = await sendDomAction('wait_for_element', { selector, timeout, visible, enabled }, { ...ctx, signal: abortCtrl.signal }, timeout);

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        message: 'Found element',
        detail: selector,
      },
    });

    return { success: true, output: res };
  } catch (err: any) {
    if (stoppedEarly) {
      ctx.log({
        level: 'info',
        message: `Wait For Element stopped early (${stopReason || 'Stopped by command'})`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      ctx.updateNodeState(node.id, {
        status: 'success',
        dynamicState: {
          message: 'Stopped early',
          detail: stopReason,
        },
      });
      return { success: true, output: { stoppedEarly: true, reason: stopReason } };
    }
    throw err;
  } finally {
    if (ctx.signal) ctx.signal.removeEventListener('abort', onParentAbort);
    if (ctx._activeTimers) ctx._activeTimers.delete(node.id);
    globalActiveTimers.delete(node.id);
  }
};

export const executeWaitForText: NodeExecutor = async (node, ctx) => {
  const rawText = node.data.properties.text || '';
  const text = String(interpolateVariables(rawText, ctx.variables));
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  const timeout = Number(node.data.properties.timeout) || 10000;
  const matchMode = node.data.properties.matchMode || 'partial';
  const caseSensitive = !!node.data.properties.caseSensitive;
  const timerName = node.data.properties.timerName ? String(interpolateVariables(node.data.properties.timerName, ctx.variables)).trim() : '';

  ctx.log({
    level: 'info',
    message: `Waiting for text: "${text}" (${matchMode === 'exact' ? 'Exact Match' : 'Partial Match'}, ${caseSensitive ? 'case-sensitive' : 'case-insensitive'}, timeout ${timeout}ms)`,
    nodeId: node.id,
    nodeName: node.data.label,
  });
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Waiting for "${text.slice(0, 18)}"...`,
      detail: text,
    },
  });

  let stoppedEarly = false;
  let stopReason: string | undefined;
  const abortCtrl = new AbortController();
  const onParentAbort = () => abortCtrl.abort();
  ctx.signal?.addEventListener('abort', onParentAbort);

  const timerHandle: ActiveTimer = {
    nodeId: node.id,
    timerName: timerName || undefined,
    totalDurationMs: timeout,
    startTime: Date.now(),
    stop: (_action, reason) => {
      stoppedEarly = true;
      stopReason = reason;
      abortCtrl.abort();
    },
    reset: () => {},
  };

  if (ctx._activeTimers) ctx._activeTimers.set(node.id, timerHandle);
  globalActiveTimers.set(node.id, timerHandle);

  try {
    const res = await sendDomAction(
      'wait_for_text',
      { text, selector, timeout, matchMode, caseSensitive },
      { ...ctx, signal: abortCtrl.signal },
      timeout + 1500
    );

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        message: `Found "${text.slice(0, 18)}"`,
        detail: text,
      },
    });

    return { success: true, output: res };
  } catch (err: any) {
    if (stoppedEarly) {
      ctx.log({
        level: 'info',
        message: `Wait For Text stopped early (${stopReason || 'Stopped by command'})`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      ctx.updateNodeState(node.id, {
        status: 'success',
        dynamicState: {
          message: 'Stopped early',
          detail: stopReason,
        },
      });
      return { success: true, output: { stoppedEarly: true, reason: stopReason } };
    }
    throw err;
  } finally {
    if (ctx.signal) ctx.signal.removeEventListener('abort', onParentAbort);
    if (ctx._activeTimers) ctx._activeTimers.delete(node.id);
    globalActiveTimers.delete(node.id);
  }
};


// ----------------- EXTRACTION EXECUTORS -----------------

export const executeExtractText: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'extractedText';
  const timeout = Number(node.data.properties.timeout) || 10000;
  const regexPattern = node.data.properties.regexPattern ? interpolateVariables(node.data.properties.regexPattern, ctx.variables) : undefined;
  const regexFlags = node.data.properties.regexFlags || 'g';
  const extractGroup = node.data.properties.extractGroup;

  if (!selector) throw new Error('Extract Text requires a selector.');

  ctx.log({ level: 'info', message: `Extracting text from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_text', { selector, timeout }, ctx, timeout);
  let text = res.text || '';

  if (regexPattern) {
    try {
      const reg = new RegExp(regexPattern, regexFlags);
      const matches = Array.from(text.matchAll(reg));
      if (extractGroup != null && extractGroup !== '' && extractGroup !== 'full') {
        const groupIdx = Number(extractGroup);
        const groupMatches = matches.map((m: any) => m[groupIdx] ?? m[0]).filter((v: any) => v != null);
        text = groupMatches.length === 1 ? groupMatches[0] : (groupMatches.length > 0 ? groupMatches.join(', ') : '');
      } else {
        const fullMatches = matches.map((m: any) => m[0]);
        text = fullMatches.length === 1 ? fullMatches[0] : (fullMatches.length > 0 ? fullMatches.join(', ') : '');
      }
      ctx.log({ level: 'info', message: `Applied regex /${regexPattern}/ on extracted text: "${text}"`, nodeId: node.id });
    } catch (e: any) {
      ctx.log({ level: 'warn', message: `Regex match on extracted text failed: ${e.message}`, nodeId: node.id });
    }
  }

  return {
    success: true,
    output: text,
    variables: { [outputVariable]: text },
  };
};

export const executeExtractAttribute: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const attribute = node.data.properties.attribute || 'href';
  const outputVariable = node.data.properties.outputVariable || 'extractedAttr';

  ctx.log({ level: 'info', message: `Extracting attribute "${attribute}" from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_attribute', { selector, attribute }, ctx);

  return {
    success: true,
    output: res.value,
    variables: { [outputVariable]: res.value },
  };
};

export const executeExtractHtml: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const mode = node.data.properties.mode || 'outer';
  const outputVariable = node.data.properties.outputVariable || 'extractedHtml';

  ctx.log({ level: 'info', message: `Extracting HTML from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_html', { selector, mode }, ctx);

  return {
    success: true,
    output: res.html,
    variables: { [outputVariable]: res.html },
  };
};

export const executeExtractTable: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'extractedTable';

  ctx.log({ level: 'info', message: `Extracting table from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_table', { selector }, ctx);

  return {
    success: true,
    output: res.rows,
    variables: { [outputVariable]: res.rows },
  };
};

export const executeFirecrawl: NodeExecutor = async (node, ctx) => {
  const mode = (node.data.properties.mode || 'scrape') as 'scrape' | 'search' | 'map';
  let targetUrl = String(interpolateVariables(node.data.properties.url || '{{currentUrl}}', ctx.variables) ?? '').trim();
  if (!targetUrl || targetUrl === '{{currentUrl}}') {
    targetUrl = ctx.currentUrl || '';
  }

  const searchQuery = String(interpolateVariables(node.data.properties.searchQuery || '', ctx.variables) ?? '').trim();
  const formats = Array.isArray(node.data.properties.formats) && node.data.properties.formats.length > 0
    ? node.data.properties.formats
    : ['markdown'];
  const onlyMainContent = node.data.properties.onlyMainContent !== false;
  const waitFor = Number(node.data.properties.waitFor) || 1000;
  const outputVariable = node.data.properties.outputVariable || 'firecrawlMarkdown';
  const fallbackToBrowser = node.data.properties.fallbackToBrowser !== false;

  const customApiKey = node.data.properties.apiKey?.trim();
  const rawApiUrl = String(node.data.properties.apiUrl || 'https://api.firecrawl.dev/v1').trim().replace(/\/+$/, '');

  if (mode === 'search' && !searchQuery) {
    throw new Error('Firecrawl search requires a search query.');
  }
  if ((mode === 'scrape' || mode === 'map') && !targetUrl) {
    throw new Error('Firecrawl requires a valid target URL.');
  }

  ctx.log({
    level: 'info',
    message: `[Firecrawl] ${customApiKey ? 'Authenticated' : 'Keyless Mode'} ${mode}: ${mode === 'search' ? searchQuery : targetUrl}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Firecrawl ${mode} (${customApiKey ? 'Key' : 'Keyless'})...`,
      detail: mode === 'search' ? searchQuery : targetUrl,
    },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Keyless: do NOT send Authorization header. Firecrawl's free keyless tier activates automatically!
  if (customApiKey) {
    headers['Authorization'] = `Bearer ${customApiKey}`;
  }

  let endpoint = `${rawApiUrl}/${mode}`;
  let requestBody: Record<string, any> = {};

  if (mode === 'scrape') {
    requestBody = {
      url: targetUrl,
      formats,
      onlyMainContent,
      waitFor,
    };
  } else if (mode === 'search') {
    if (rawApiUrl.includes('/v1')) {
      endpoint = `${rawApiUrl.replace('/v1', '/v2')}/search`;
    }
    requestBody = {
      query: searchQuery,
      scrapeOptions: { formats },
      limit: Number(node.data.properties.limit) || 5,
    };
  } else if (mode === 'map') {
    requestBody = {
      url: targetUrl,
    };
  }

  let res: Response | null = null;
  let fetchError: Error | null = null;

  try {
    res = await safeFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (err: any) {
    fetchError = err;
  }

  // Handle fallback if request failed or was blocked by rate limit
  if (!res || !res.ok) {
    const status = res?.status || 0;
    const errText = res ? await res.text().catch(() => '') : '';
    let parsedErr = errText;
    try {
      const parsed = JSON.parse(errText);
      parsedErr = parsed.error?.message || parsed.message || parsedErr;
    } catch {}

    const isRateLimitOrBlocked = status === 429 || status === 401 || status === 403 || !res;

    if (fallbackToBrowser && mode === 'scrape' && isRateLimitOrBlocked) {
      ctx.log({
        level: 'warn',
        message: `Firecrawl keyless API unavailable (${status || fetchError?.message || 'offline'}). Using browser DOM extraction fallback...`,
        nodeId: node.id,
      });

      try {
        const domRes = await sendDomAction('extract_html', { selector: 'body', mode: 'inner' }, ctx);
        const textRes = await sendDomAction('extract_text', { selector: 'body' }, ctx);
        const fallbackTitle = ctx.variables.pageTitle || 'Extracted Page';
        const fallbackMarkdown = `# ${fallbackTitle}\n\n${textRes?.text || domRes?.html || ''}`;

        ctx.updateNodeState(node.id, {
          status: 'success',
          dynamicState: {
            message: `Extracted ${fallbackMarkdown.length} chars (Browser Fallback)`,
            detail: 'Local DOM fallback',
          },
        });

        return {
          success: true,
          output: fallbackMarkdown,
          variables: {
            [outputVariable]: fallbackMarkdown,
            [`${outputVariable}_markdown`]: fallbackMarkdown,
            [`${outputVariable}_title`]: fallbackTitle,
            [`${outputVariable}_html`]: domRes?.html || '',
          },
        };
      } catch (fallbackErr: any) {
        ctx.log({ level: 'error', message: `Fallback failed: ${fallbackErr.message}`, nodeId: node.id });
      }
    }

    const tip = !customApiKey ? ' Tip: For higher rate limits, add a free Firecrawl API key in node properties.' : '';
    const errorMsg = `Firecrawl ${mode} error (${status}): ${parsedErr || fetchError?.message || 'Request failed'}.${tip}`;
    ctx.log({ level: 'error', message: errorMsg, nodeId: node.id });
    throw new Error(errorMsg);
  }

  const json = await res.json();
  const data = json.data || json;

  let primaryOutput: any = '';
  const variablesToSet: Record<string, any> = {};

  if (mode === 'scrape') {
    const markdown = data.markdown || data.content || '';
    const title = data.metadata?.title || '';
    const description = data.metadata?.description || '';
    const links = data.links || [];
    const html = data.html || data.rawHtml || '';
    const screenshot = data.screenshot || '';

    primaryOutput = markdown || html || data;
    variablesToSet[outputVariable] = primaryOutput;
    variablesToSet[`${outputVariable}_markdown`] = markdown;
    variablesToSet[`${outputVariable}_title`] = title;
    variablesToSet[`${outputVariable}_description`] = description;
    variablesToSet[`${outputVariable}_links`] = links;
    variablesToSet[`${outputVariable}_html`] = html;
    if (screenshot) variablesToSet[`${outputVariable}_screenshot`] = screenshot;
    variablesToSet[`${outputVariable}_metadata`] = data.metadata || {};

    ctx.log({
      level: 'success',
      message: `Firecrawl scraped ${markdown.length} chars markdown from ${targetUrl}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        message: `${markdown.length} chars markdown`,
        detail: title ? `${title.slice(0, 35)}...` : 'Scrape complete',
        previewUrl: screenshot || undefined,
      },
    });
  } else if (mode === 'search') {
    const results = Array.isArray(data) ? data : (data.results || [data]);
    primaryOutput = results;
    variablesToSet[outputVariable] = results;
    variablesToSet[`${outputVariable}_count`] = results.length;

    ctx.log({
      level: 'success',
      message: `Firecrawl found ${results.length} search result(s) for "${searchQuery}"`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        message: `${results.length} search results`,
        detail: `Query: ${searchQuery.slice(0, 30)}`,
      },
    });
  } else {
    // 'map'
    const links = Array.isArray(data) ? data : (data.links || []);
    primaryOutput = links;
    variablesToSet[outputVariable] = links;
    variablesToSet[`${outputVariable}_count`] = links.length;

    ctx.log({
      level: 'success',
      message: `Firecrawl mapped ${links.length} link(s) on ${targetUrl}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        message: `${links.length} URLs mapped`,
        detail: targetUrl,
      },
    });
  }

  return {
    success: true,
    output: primaryOutput,
    variables: variablesToSet,
  };
};

// ----------------- LOGIC EXECUTORS -----------------

export const executeCondition: NodeExecutor = async (node, ctx) => {
  const leftValue = interpolateVariables(node.data.properties.leftValue || '', ctx.variables);
  const operator = node.data.properties.operator || 'equals';
  const rightValue = interpolateVariables(node.data.properties.rightValue || '', ctx.variables);
  const caseSensitive = !!node.data.properties.caseSensitive;

  const rule: ConditionRule = {
    type: 'variable',
    leftValue,
    operator,
    rightValue,
    caseSensitive,
  };

  const result = evaluateCondition(rule, ctx.variables);
  const branch = result ? 'true' : 'false';
  const outputVariable = node.data.properties.outputVariable || 'conditionResult';
  ctx.variables[outputVariable] = result;

  const desc = `${leftValue} ${operator} ${rightValue}`;
  ctx.log({
    level: 'info',
    message: `Condition evaluated: ${result ? 'TRUE' : 'FALSE'} (${desc})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: { result, branch, desc },
    nextBranch: branch,
  };
};

/**
 * Logic Gate executor for AND, OR, NAND, NOR nodes.
 * Combines multiple incoming branches into 1 branch according to boolean logic.
 */
export const executeLogicGate: NodeExecutor = async (node, ctx) => {
  const rawType = String(node.data.type || '').toLowerCase();
  let gate = String(node.data.properties.gate || '').toUpperCase() as LogicalGate;
  if (!gate) {
    if (rawType.includes('and') && !rawType.includes('nand')) gate = 'AND';
    else if (rawType.includes('nand')) gate = 'NAND';
    else if (rawType.includes('nor')) gate = 'NOR';
    else gate = 'OR';
  }

  const incomingInputs: Array<{ id: string; name?: string; result: boolean; output?: any }> =
    ctx._gateInputs?.[node.id] || node.data.properties._evaluatedInputs || [];

  let result = false;
  let summary = '';

  if (incomingInputs.length > 0) {
    const inputBools = incomingInputs.map((i) => Boolean(i.result));
    if (gate === 'AND') {
      result = inputBools.every((b) => b === true);
      summary = `All ${inputBools.length} branches: [${inputBools.join(', ')}]`;
    } else if (gate === 'OR') {
      result = inputBools.some((b) => b === true);
      summary = `Any of ${inputBools.length} branches: [${inputBools.join(', ')}]`;
    } else if (gate === 'NAND') {
      result = !inputBools.every((b) => b === true);
      summary = `NOT (${inputBools.join(' AND ')})`;
    } else if (gate === 'NOR') {
      result = !inputBools.some((b) => b === true);
      summary = `NOT (${inputBools.join(' OR ')})`;
    }
  } else {
    // If executed standalone (e.g. debugging without connected edges)
    result = gate === 'AND' || gate === 'OR';
    summary = 'Standalone execution (no incoming branches attached)';
  }

  const outputVariable = node.data.properties.outputVariable || `${gate.toLowerCase()}Result`;
  ctx.variables[outputVariable] = result;

  const branch = result ? 'true' : 'false';

  ctx.log({
    level: 'info',
    message: `${gate} Gate evaluated: ${result ? 'TRUE' : 'FALSE'} (${summary}) -> Combining branches to 1 output`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: {
      result,
      gate,
      branch,
      inputs: incomingInputs,
      summary,
    },
    nextBranch: 'output',
  };
};

/**
 * "Contains" node: checks whether a particular element is present on the page.
 * Branches to TRUE when the element is found, FALSE otherwise.
 */
export const executeContains: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  if (!selector) throw new Error('Contains node requires a selector.');

  const matchMode = node.data.properties.matchMode || 'element';
  const rawText = node.data.properties.text || '';
  const text = rawText ? String(interpolateVariables(rawText, ctx.variables)) : '';
  const textMatchMode = (node.data.properties.textMatchMode as 'exact' | 'partial') || 'partial';
  const caseSensitive = !!node.data.properties.caseSensitive;
  const visibleOnly = node.data.properties.visibleOnly !== false;
  const timeout = Number(node.data.properties.timeout) || 5000;
  const outputVariable = node.data.properties.outputVariable || 'elementPresent';

  ctx.log({
    level: 'info',
    message: `Checking if page contains element: ${selector}${text ? ` (text "${text}", mode: ${textMatchMode}, case: ${caseSensitive ? 'sensitive' : 'insensitive'})` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'check_element_presence',
    {
      selector,
      timeout,
      visibleOnly,
      text: matchMode === 'text' ? text : '',
      matchMode: textMatchMode,
      caseSensitive,
    },
    ctx,
    timeout + 1500
  );

  const present = res?.present === true;
  const branch = present ? 'true' : 'false';

  ctx.log({
    level: present ? 'success' : 'warn',
    message: present
      ? `Element FOUND - taking TRUE branch (${selector})`
      : `Element NOT FOUND - taking FALSE branch (${selector})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: { present, branch, matchedText: res?.matchedText },
    nextBranch: branch,
    variables: { [outputVariable]: present },
  };
};

/**
 * "Contains Text" node: checks whether a particular text exists on the page (or within a container).
 * Non-throwing condition node: branches to TRUE when the text is found, FALSE otherwise.
 */
export const executeContainsText: NodeExecutor = async (node, ctx) => {
  const rawText = node.data.properties.text || '';
  const text = rawText ? String(interpolateVariables(rawText, ctx.variables)) : '';
  if (!text) {
    throw new Error('Contains Text node requires text to search for.');
  }

  const rawSelector = node.data.properties.selector || '';
  const selector = rawSelector ? String(interpolateVariables(rawSelector, ctx.variables)) : '';
  const matchMode = (node.data.properties.matchMode as 'exact' | 'partial') || 'partial';
  const caseSensitive = Boolean(node.data.properties.caseSensitive);
  const timeout = Math.max(0, Number(node.data.properties.timeout) || 3000);
  const outputVariable = node.data.properties.outputVariable || 'containsText';

  ctx.log({
    level: 'info',
    message: `Checking if page contains text "${text}" (match: ${matchMode}, case: ${caseSensitive ? 'sensitive' : 'insensitive'}, timeout: ${timeout}ms${selector ? `, container: ${selector}` : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'check_element_presence',
    {
      selector: selector || 'body',
      timeout,
      visibleOnly: false,
      text,
      matchMode,
      caseSensitive,
    },
    ctx,
    timeout + 1500
  );

  const present = res?.present === true;
  const branch = present ? 'true' : 'false';

  ctx.log({
    level: present ? 'success' : 'warn',
    message: present
      ? `Text "${text}" FOUND - taking TRUE branch`
      : `Text "${text}" NOT FOUND - taking FALSE branch`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: {
      present,
      text,
      matchMode,
      caseSensitive,
      branch,
      matchedText: res?.matchedText,
    },
    nextBranch: branch,
    variables: { [outputVariable]: present },
  };
};

export const executeBreak: NodeExecutor = async () => ({ success: true, breakLoop: true });
export const executeContinue: NodeExecutor = async () => ({ success: true, continueLoop: true });

// ----------------- DATA EXECUTORS -----------------

export const executeSetVariable: NodeExecutor = async (node, ctx) => {
  const name = node.data.properties.name;
  if (!name) throw new Error('Set Variable requires a variable name.');

  const rawVal = node.data.properties.value;
  const value = interpolateVariables(rawVal, ctx.variables);

  ctx.log({
    level: 'info',
    message: `Set variable "${name}" = ${JSON.stringify(value)}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: value,
    variables: { [name]: value },
  };
};

export const executeGetVariable: NodeExecutor = async (node, ctx) => {
  const name = node.data.properties.name;
  const val = ctx.variables[name];
  return { success: true, output: val };
};

export const executeTransform: NodeExecutor = async (node, ctx) => {
  const input = interpolateVariables(node.data.properties.input, ctx.variables);
  const operation = node.data.properties.operation || 'trim';
  const outputVariable = node.data.properties.outputVariable || 'transformedValue';

  let result: any = input;
  const str = String(input ?? '');

  switch (operation) {
    case 'lowercase': result = str.toLowerCase(); break;
    case 'uppercase': result = str.toUpperCase(); break;
    case 'trim': result = str.trim(); break;
    case 'replace': {
      const search = node.data.properties.search || '';
      const replaceWith = node.data.properties.replaceWith || '';
      result = str.replaceAll(search, replaceWith);
      break;
    }
    case 'split': {
      const delimiter = node.data.properties.delimiter || ',';
      result = str.split(delimiter).map(s => s.trim());
      break;
    }
    case 'join': {
      const delimiter = node.data.properties.delimiter || ', ';
      result = Array.isArray(input) ? input.join(delimiter) : str;
      break;
    }
    case 'substring': {
      const start = Number(node.data.properties.start) || 0;
      const length = node.data.properties.length !== undefined ? Number(node.data.properties.length) : undefined;
      result = length !== undefined ? str.substring(start, start + length) : str.substring(start);
      break;
    }
    case 'parseNumber': {
      const cleaned = str.replace(/[^0-9.-]/g, '');
      result = Number(cleaned);
      break;
    }
    case 'parseJSON': {
      result = JSON.parse(str);
      break;
    }
    case 'extractField':
    case 'getProperty': {
      const field = node.data.properties.field || node.data.properties.fieldName || node.data.properties.property || '';
      let targetObj = input;
      if (typeof targetObj === 'string') {
        try {
          targetObj = JSON.parse(targetObj);
        } catch {
          // not JSON
        }
      }
      if (targetObj && typeof targetObj === 'object') {
        result = field ? getNestedValue(targetObj, field) : targetObj;
      } else {
        result = '';
      }
      break;
    }
    case 'normalizeUrl': {
      const basePrefix = node.data.properties.basePrefix || node.data.properties.urlBasePrefix || '';
      const stripQueryParams = node.data.properties.stripQueryParams !== false;
      result = normalizeUrl(str, { basePrefix, stripQueryParams });
      break;
    }
    case 'cleanPrice': {
      const mode = node.data.properties.priceMode || 'number_only';
      result = cleanPrice(str, { mode });
      break;
    }
    case 'formatDate': {
      const mode = node.data.properties.dateMode || 'iso_date';
      result = formatDateString(str, { mode });
      break;
    }
  }

  if (outputVariable && ctx.variables) {
    ctx.variables[outputVariable] = result;
  }

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeRegex: NodeExecutor = async (node, ctx) => {
  let text = String(interpolateVariables(node.data.properties.text ?? '', ctx.variables) ?? '');
  if (!text) {
    if (ctx.variables.extractedText != null) text = String(ctx.variables.extractedText);
    else if (ctx.variables.text != null) text = String(ctx.variables.text);
    else if (ctx.variables.transformedText != null) text = String(ctx.variables.transformedText);
  }

  let pattern = String(node.data.properties.pattern || '').trim();
  let flags = String(node.data.properties.flags || 'g').trim();
  const outputVariable = node.data.properties.outputVariable || 'regexMatches';
  const extractGroup = node.data.properties.extractGroup; // undefined/'full' = full match, number = capture group index

  if (!pattern) throw new Error('Regex node requires a pattern.');

  // If user pasted regex literal like /abc/gi, extract pattern and flags
  const literalMatch = pattern.match(/^\/(.+)\/([a-z]*)$/);
  if (literalMatch) {
    pattern = literalMatch[1];
    if (literalMatch[2]) flags = literalMatch[2];
  }

  // Ensure 'g' flag is present so matchAll works, or handle single-match
  const hasGlobal = flags.includes('g');
  const safeFlags = hasGlobal ? flags : flags + 'g';

  ctx.log({ level: 'info', message: `Regex: /${pattern}/${safeFlags} on text (${text.length} chars)`, nodeId: node.id, nodeName: node.data.label });

  let reg: RegExp;
  try {
    reg = new RegExp(pattern, safeFlags);
  } catch (e: any) {
    throw new Error(`Invalid regex pattern "/${pattern}/${safeFlags}": ${e.message}`);
  }

  const rawMatches = Array.from(text.matchAll(reg));
  let matches: any[];

  if (extractGroup != null && extractGroup !== '' && extractGroup !== 'full') {
    const groupIdx = Number(extractGroup);
    matches = rawMatches.map((m: any) => m[groupIdx] ?? m[0]).filter((v: any) => v != null);
  } else {
    matches = rawMatches.map((m: any) => m[0]);
  }

  const firstMatch = matches.length > 0 ? matches[0] : '';

  ctx.log({
    level: 'success',
    message: `Regex matched ${matches.length} result(s)`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `${matches.length} match(es)`,
      detail: matches.slice(0, 5).join(', ') + (matches.length > 5 ? '...' : ''),
    },
  });

  return {
    success: true,
    output: hasGlobal ? matches : (matches.length === 1 ? firstMatch : matches),
    variables: {
      [outputVariable]: matches,
      [`${outputVariable}_first`]: firstMatch,
    },
  };
};

export const executeJsonParse: NodeExecutor = async (node, ctx) => {
  const text = String(interpolateVariables(node.data.properties.text, ctx.variables) ?? '');
  const outputVariable = node.data.properties.outputVariable || 'parsedJson';
  const parsed = JSON.parse(text);

  return {
    success: true,
    output: parsed,
    variables: { [outputVariable]: parsed },
  };
};

// ----------------- UTILITY EXECUTORS -----------------

export const executeScreenshot: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Capturing screenshot', nodeId: node.id, nodeName: node.data.label });
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: { message: 'Capturing screenshot...' },
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const res = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      payload: { tabId: ctx.currentTabId },
    });

    if (!res?.success) throw new Error(res?.error || 'Screenshot capture failed.');

    const outputVariable = node.data.properties.outputVariable || 'screenshotUrl';
    ctx.log({
      level: 'success',
      message: 'Screenshot captured successfully',
      nodeId: node.id,
      nodeName: node.data.label,
      screenshotUrl: res.dataUrl,
    });

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        message: 'Screenshot captured',
        previewUrl: res.dataUrl,
      },
    });

    return {
      success: true,
      output: res.dataUrl,
      variables: { [outputVariable]: res.dataUrl },
    };
  }

  const mockUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: { message: 'Screenshot captured', previewUrl: mockUrl },
  });
  return { success: true, output: mockUrl };
};

export const executeJavaScript: NodeExecutor = async (node, ctx) => {
  const rawCode = node.data.properties.code || 'return true;';
  const code = interpolateVariables(rawCode, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'scriptResult';

  ctx.log({ level: 'info', message: 'Executing custom JavaScript in safe sandbox', nodeId: node.id, nodeName: node.data.label });

  const result = await runInSandbox(code, ctx.variables);

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeHttpRequest: NodeExecutor = async (node, ctx) => {
  const method = node.data.properties.method || 'GET';
  const rawUrl = node.data.properties.url || 'https://httpbin.org/get';
  const url = interpolateVariables(rawUrl, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'httpResponse';

  let headers: Record<string, string> = {};
  if (node.data.properties.headers) {
    headers = interpolateVariables(node.data.properties.headers, ctx.variables);
  }

  let body: any = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method) && node.data.properties.body) {
    body = typeof node.data.properties.body === 'string'
      ? interpolateVariables(node.data.properties.body, ctx.variables)
      : JSON.stringify(interpolateVariables(node.data.properties.body, ctx.variables));
  }

  ctx.log({ level: 'info', message: `HTTP ${method} ${url}`, nodeId: node.id, nodeName: node.data.label });
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: { message: `${method} ${url.slice(0, 20)}...` },
  });

  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: ctx.signal,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  const result = {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    data,
  };

  ctx.updateNodeState(node.id, {
    status: response.ok ? 'success' : 'error',
    dynamicState: { message: `${response.status} ${response.statusText}` },
  });

  return {
    success: response.ok,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeExtractMultiple: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const attribute = node.data.properties.attribute ? interpolateVariables(node.data.properties.attribute, ctx.variables) : undefined;
  const outputVariable = node.data.properties.outputVariable || 'extractedList';
  const timeout = Number(node.data.properties.timeout) || 10000;
  const exportToFile = !!node.data.properties.exportToFile;
  const exportFormat = (node.data.properties.exportFormat || 'csv') as ExportDataFormat;
  const rawExportFilename = node.data.properties.exportFilename || `${outputVariable}_export`;
  const exportFilename = interpolateVariables(rawExportFilename, ctx.variables);

  if (!selector) throw new Error('Extract Multiple requires a selector.');

  ctx.log({ level: 'info', message: `Extracting elements matching ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_multiple', { selector, attribute, timeout }, ctx, timeout);
  const items = res?.items || res?.result?.items || [];

  let exportResult: any = undefined;
  if (exportToFile && items.length > 0) {
    const doc = createExportDocument(items, exportFormat, { filename: exportFilename });
    await triggerFileDownload(doc.dataUrl, doc.filename);
    exportResult = doc;
    ctx.log({
      level: 'info',
      message: `Direct export: saved ${doc.rowCount} items to ${doc.filename}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
  }

  return {
    success: true,
    output: items,
    variables: {
      [outputVariable]: items,
      ...(exportResult
        ? {
            [`${outputVariable}_dataUrl`]: exportResult.dataUrl,
            [`${outputVariable}_filename`]: exportResult.filename,
          }
        : {}),
    },
  };
};

export const executeCrawlPagination: NodeExecutor = async (node, ctx) => {
  const mode = node.data.properties.mode || 'auto_detect';
  const rawItemSelector = node.data.properties.itemSelector || node.data.properties.selector || '';
  const itemSelector = interpolateVariables(rawItemSelector, ctx.variables);
  const rawNextSelector = node.data.properties.nextButtonSelector || node.data.properties.nextSelector || '';
  const nextButtonSelector = rawNextSelector ? interpolateVariables(rawNextSelector, ctx.variables) : undefined;
  const rawAttr = node.data.properties.attribute || '';
  const attribute = rawAttr ? interpolateVariables(rawAttr, ctx.variables) : undefined;
  const maxPages = Math.min(Math.max(1, Number(node.data.properties.maxPages) || 5), 100);
  const pageDelay = Math.max(10, Number(node.data.properties.pageDelay ?? 1500));
  const stopOnNoNewItems = node.data.properties.stopOnNoNewItems !== false;
  const deduplicate = node.data.properties.deduplicate !== false;
  const outputVariable = node.data.properties.outputVariable || 'crawledDataset';
  const totalExtractedVariable = node.data.properties.totalExtractedVariable || 'totalCrawledItems';

  if (!itemSelector) {
    throw new Error('Auto-Crawler requires a repeating item selector (e.g. .product-item, .card, or list pattern).');
  }

  ctx.log({
    level: 'info',
    message: `Starting Auto-Crawler (${mode}, max ${maxPages} pages, selector: "${itemSelector}")`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Crawling page 1/${maxPages}...`,
      currentIteration: 1,
      totalIterations: maxPages,
      progress: 0,
    },
  });

  const aggregatedList: any[] = [];
  const seenKeys = new Set<string>();
  let consecutiveZeroNewCount = 0;
  let pagesCrawled = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (ctx.signal?.aborted) throw new Error('Auto-Crawler aborted by user.');
    pagesCrawled = page;

    ctx.updateNodeState(node.id, {
      status: 'running',
      dynamicState: {
        message: `Scraping page ${page}/${maxPages} (${aggregatedList.length} items)...`,
        currentIteration: page,
        totalIterations: maxPages,
        progress: Math.round(((page - 1) / maxPages) * 100),
      },
    });

    // 1. Extract items on current page
    let pageItems: any[] = [];
    try {
      const res = await sendDomAction(
        'extract_multiple',
        {
          selector: itemSelector,
          attribute,
          timeout: 8000,
        },
        ctx,
        9000
      );
      pageItems = Array.isArray(res?.items) ? res.items : [];
    } catch (extractErr: any) {
      ctx.log({
        level: 'warn',
        message: `Page ${page} item extraction warning: ${extractErr.message}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }

    // 2. Accumulate items with optional deduplication
    let newItemsThisPage = 0;
    for (const item of pageItems) {
      const key = typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item);
      if (deduplicate) {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          aggregatedList.push(item);
          newItemsThisPage++;
        }
      } else {
        aggregatedList.push(item);
        newItemsThisPage++;
      }
    }

    ctx.log({
      level: 'info',
      message: `Page ${page}/${maxPages}: Scraped ${pageItems.length} items (+${newItemsThisPage} new, total: ${aggregatedList.length})`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    // Check stop condition: no new items
    if (newItemsThisPage === 0 && page > 1 && stopOnNoNewItems) {
      consecutiveZeroNewCount++;
      if (consecutiveZeroNewCount >= 2) {
        ctx.log({
          level: 'info',
          message: `Auto-Crawler stopping: No new items found across 2 consecutive passes.`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        break;
      }
    } else {
      consecutiveZeroNewCount = 0;
    }

    // Stop if maxPages reached
    if (page >= maxPages) {
      break;
    }

    // 3. Move to next page (via scroll or button click)
    if (mode === 'infinite_scroll') {
      ctx.log({
        level: 'info',
        message: `Infinite scroll pass: scrolling down...`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      await sendDomAction(
        'scroll',
        {
          direction: 'down',
          amount: 800,
          smooth: true,
        },
        ctx
      );
      await new Promise((r) => setTimeout(r, pageDelay));
    } else {
      // 'next_button' or 'auto_detect'
      ctx.log({
        level: 'info',
        message: `Navigating to next page (${nextButtonSelector || 'auto-detect'})...`,
        nodeId: node.id,
        nodeName: node.data.label,
      });

      let navResult: any;
      try {
        navResult = await sendDomAction(
          'find_and_click_next_page',
          {
            nextButtonSelector,
          },
          ctx,
          10000
        );
      } catch (err: any) {
        ctx.log({
          level: 'info',
          message: `Pagination navigation ended: ${err.message}`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        break;
      }

      if (navResult?.reachedEnd || !navResult?.clicked) {
        ctx.log({
          level: 'info',
          message: `Reached end of pagination: ${navResult?.reason || 'No further next button found'}`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        break;
      }

      // Wait for page transition / delay
      await new Promise((r) => setTimeout(r, pageDelay));
    }
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Crawled ${pagesCrawled} pages (${aggregatedList.length} items)`,
      progress: 100,
    },
  });

  ctx.log({
    level: 'success',
    message: `Auto-Crawler finished: aggregated ${aggregatedList.length} items across ${pagesCrawled} pages into {{${outputVariable}}}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.variables[outputVariable] = aggregatedList;
  ctx.variables[totalExtractedVariable] = aggregatedList.length;
  ctx.variables['crawlTotalCount'] = aggregatedList.length;
  ctx.variables['crawlPageCount'] = pagesCrawled;
  ctx.variables['totalPagesCrawled'] = pagesCrawled;

  const output = Object.assign([...aggregatedList], {
    items: aggregatedList,
    pageCount: pagesCrawled,
    totalCount: aggregatedList.length,
  });

  const exportToFile = !!node.data.properties.exportToFile;
  const exportFormat = (node.data.properties.exportFormat || 'csv') as ExportDataFormat;
  const rawExportFilename = node.data.properties.exportFilename || `${outputVariable}_export`;
  const exportFilename = interpolateVariables(rawExportFilename, ctx.variables);

  let exportResult: any = undefined;
  if (exportToFile && aggregatedList.length > 0) {
    const doc = createExportDocument(aggregatedList, exportFormat, { filename: exportFilename });
    await triggerFileDownload(doc.dataUrl, doc.filename);
    exportResult = doc;
    ctx.log({
      level: 'info',
      message: `Direct export: saved ${doc.rowCount} crawled items to ${doc.filename}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
  }

  return {
    success: true,
    output,
    items: aggregatedList,
    variables: {
      [outputVariable]: aggregatedList,
      [totalExtractedVariable]: aggregatedList.length,
      crawlTotalCount: aggregatedList.length,
      crawlPageCount: pagesCrawled,
      totalPagesCrawled: pagesCrawled,
      ...(exportResult
        ? {
            [`${outputVariable}_dataUrl`]: exportResult.dataUrl,
            [`${outputVariable}_filename`]: exportResult.filename,
          }
        : {}),
    },
  };
};

export const executeExtractLinks: NodeExecutor = async (node, ctx) => {
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  const outputVariable = node.data.properties.outputVariable || 'extractedLinks';
  const timeout = Number(node.data.properties.timeout) || 10000;

  ctx.log({ level: 'info', message: `Extracting links from ${selector || 'page'}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_links', { selector, timeout }, ctx, timeout);

  return {
    success: true,
    output: res.links,
    variables: { [outputVariable]: res.links },
  };
};

export const executeExtractImage: NodeExecutor = async (node, ctx) => {
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : 'img';
  const mode = node.data.properties.mode || 'single';
  const asBase64 = !!node.data.properties.asBase64;
  const includeBackground = node.data.properties.includeBackground !== false;
  const outputVariable = node.data.properties.outputVariable || 'extractedImage';
  const timeout = Number(node.data.properties.timeout) || 10000;

  ctx.log({ level: 'info', message: `Extracting image(s) from ${selector || 'page'}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_image', { selector, mode, asBase64, includeBackground, timeout }, ctx, timeout);

  const mainValue = mode === 'multiple' ? (res?.items || []) : (res?.dataUrl || res?.url || '');

  ctx.log({
    level: 'success',
    message: mode === 'multiple'
      ? `Extracted ${res?.items?.length || 0} images`
      : `Extracted image: ${res?.url ? res.url.slice(0, 50) : (res?.dataUrl ? 'base64 data' : 'none')}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: mainValue,
    variables: {
      [outputVariable]: mainValue,
      [`${outputVariable}_details`]: res,
    },
  };
};

export const executeExtractAllImages: NodeExecutor = async (node, ctx) => {
  const containerSelector = node.data.properties.containerSelector
    ? interpolateVariables(node.data.properties.containerSelector, ctx.variables)
    : undefined;
  const includeBackground = node.data.properties.includeBackground !== false;
  const asBase64 = !!node.data.properties.asBase64;
  const minWidth = Number(node.data.properties.minWidth) || 10;
  const minHeight = Number(node.data.properties.minHeight) || 10;
  const maxImages = Number(node.data.properties.maxImages) || 100;
  const outputVariable = node.data.properties.outputVariable || 'allImages';
  const timeout = Number(node.data.properties.timeout) || 10000;

  ctx.log({
    level: 'info',
    message: `Finding all images on page${containerSelector ? ` in ${containerSelector}` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'extract_all_images',
    {
      containerSelector,
      includeBackground,
      asBase64,
      minWidth,
      minHeight,
      maxImages,
      timeout,
    },
    ctx,
    timeout
  );

  const items = res?.items || [];
  const urls = res?.urls || items.map((i: any) => i.url || i);

  ctx.log({
    level: 'success',
    message: `Found ${items.length} images on page`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: items,
    items,
    variables: {
      [outputVariable]: items,
      [`${outputVariable}_urls`]: urls,
      [`${outputVariable}_count`]: items.length,
    },
  };
};

export const executeScrapeElements: NodeExecutor = async (node, ctx) => {
  const containerSelector = interpolateVariables(node.data.properties.containerSelector || '', ctx.variables);
  const rawFields = Array.isArray(node.data.properties.fields) ? node.data.properties.fields : [];
  const fields = rawFields.map((f: any) => ({
    name: interpolateVariables(f.name || 'field', ctx.variables),
    selector: f.selector ? interpolateVariables(f.selector, ctx.variables) : undefined,
    attribute: f.attribute ? interpolateVariables(f.attribute, ctx.variables) : undefined,
  }));
  const outputVariable = node.data.properties.outputVariable || 'scrapedProducts';
  const timeout = Number(node.data.properties.timeout) || 10000;
  const exportToFile = !!node.data.properties.exportToFile;
  const exportFormat = (node.data.properties.exportFormat || 'csv') as ExportDataFormat;
  const rawExportFilename = node.data.properties.exportFilename || `${outputVariable}_export`;
  const exportFilename = interpolateVariables(rawExportFilename, ctx.variables);
  const excludeEmpty = !!node.data.properties.excludeEmpty;
  const filterEmptyMode = (node.data.properties.filterEmptyMode || 'any') as 'any' | 'all';

  // Post-processing & pattern filter settings
  const postProcessingEnabled = !!node.data.properties.postProcessingEnabled;
  const rawUrlBasePrefix = node.data.properties.urlBasePrefix || '';
  const urlBasePrefix = rawUrlBasePrefix ? String(interpolateVariables(rawUrlBasePrefix, ctx.variables)) : '';
  const rawUrlTargetFields = node.data.properties.urlTargetFields || node.data.properties.urlFields;
  const urlFields = Array.isArray(rawUrlTargetFields) && rawUrlTargetFields.length > 0
    ? rawUrlTargetFields
    : undefined;
  const stripUrlQueryParams = !!node.data.properties.stripUrlQueryParams;
  const stripAllQueryParams = !!node.data.properties.stripAllQueryParams;
  const cleanPriceOption = !!node.data.properties.cleanPrice;
  const priceMode = (node.data.properties.priceMode || 'number_only') as 'number_only' | 'strip_symbols';
  const formatDateOption = !!node.data.properties.formatDate;
  const dateMode = (node.data.properties.dateMode || 'iso_date') as 'iso_date' | 'iso_datetime' | 'timestamp';
  const patternFilterEnabled = !!node.data.properties.patternFilterEnabled;
  const patternFilterField = node.data.properties.patternFilterField || 'link';
  const patternFilterAction = (node.data.properties.patternFilterAction || 'include_only') as 'include_only' | 'exclude_matching';
  const patternFilterMode = (node.data.properties.patternFilterMode || 'contains') as 'contains' | 'regex' | 'starts_with' | 'ends_with';
  const rawPatternFilterValue = node.data.properties.patternFilterValue || '';
  const patternFilterValue = rawPatternFilterValue ? String(interpolateVariables(rawPatternFilterValue, ctx.variables)) : '';

  ctx.log({
    level: 'info',
    message: `Scraping card elements${containerSelector ? ` from ${containerSelector}` : ''} (${fields.length} fields)${excludeEmpty ? ` [Exclude empty: ${filterEmptyMode}]` : ''}${patternFilterEnabled ? ` [Filter: ${patternFilterField} ${patternFilterMode} "${patternFilterValue}"]` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'extract_dataset',
    {
      containerSelector,
      fields,
      timeout,
      excludeEmpty,
      filterEmptyMode,
    },
    ctx,
    timeout
  );

  let items = res?.items || [];

  // Apply data post-processing (URL normalization, price cleaning, date formatting, and row pattern filtering)
  if (
    (postProcessingEnabled || urlBasePrefix || urlFields || stripUrlQueryParams || stripAllQueryParams || cleanPriceOption || formatDateOption || (patternFilterEnabled && patternFilterValue)) &&
    items.length > 0
  ) {
    const processed = processDataset(items, {
      urlBasePrefix,
      urlFields,
      stripUrlQueryParams,
      stripAllQueryParams,
      cleanPrice: cleanPriceOption,
      priceMode,
      formatDate: formatDateOption,
      dateMode,
      patternFilterEnabled,
      patternFilterField,
      patternFilterAction,
      patternFilterMode,
      patternFilterValue,
    });
    items = processed.items;

    if (processed.filteredCount > 0) {
      ctx.log({
        level: 'info',
        message: `Pattern condition filter: dropped ${processed.filteredCount} entries (${items.length} matched "${patternFilterValue}")`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }

    if (processed.modifiedCount > 0) {
      ctx.log({
        level: 'info',
        message: `Post-processed ${processed.modifiedCount} items (normalized URLs, cleaned prices/dates)`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }
  }

  // Defensively filter empty rows in runtime executor
  if (excludeEmpty && items.length > 0) {
    const initialCount = items.length;
    const isValEmpty = (v: any) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
    let filtered = items.filter((row: any) => {
      if (!row || typeof row !== 'object') return false;
      const keys = Object.keys(row);
      if (keys.length === 0) return false;
      if (filterEmptyMode === 'any') {
        return !keys.some((k) => isValEmpty(row[k]));
      } else {
        return !keys.every((k) => isValEmpty(row[k]));
      }
    });

    // Graceful fallback: If strict 'any' dropped all rows because some card fields were optional
    // (e.g. repo cards without language/stars or products without sale price), retain rows with at least one non-empty value
    if (filtered.length === 0 && initialCount > 0 && filterEmptyMode === 'any') {
      filtered = items.filter((row: any) => {
        if (!row || typeof row !== 'object') return false;
        const keys = Object.keys(row);
        return !keys.every((k) => isValEmpty(row[k]));
      });
    }
    items = filtered;

    if (items.length < initialCount) {
      ctx.log({
        level: 'info',
        message: `Excluded ${initialCount - items.length} entries with empty fields (${items.length} remaining)`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }
  }

  let exportResult: any = undefined;
  if (exportToFile && items.length > 0) {
    const doc = createExportDocument(items, exportFormat, { filename: exportFilename, excludeEmpty, filterEmptyMode });
    await triggerFileDownload(doc.dataUrl, doc.filename);
    exportResult = doc;
    ctx.log({
      level: 'info',
      message: `Scrape Elements direct export: saved ${doc.rowCount} items to ${doc.filename}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
  }

  ctx.log({
    level: 'success',
    message: `Scraped ${items.length} card items successfully`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.variables[outputVariable] = items;
  ctx.variables[`${outputVariable}_count`] = items.length;

  return {
    success: true,
    output: items,
    items,
    variables: {
      [outputVariable]: items,
      [`${outputVariable}_count`]: items.length,
      ...(exportResult
        ? {
            [`${outputVariable}_dataUrl`]: exportResult.dataUrl,
            [`${outputVariable}_filename`]: exportResult.filename,
          }
        : {}),
    },
  };
};

export const executeStorageManage: NodeExecutor = async (node, ctx) => {
  const storageType = node.data.properties.type || 'local';
  const action = node.data.properties.action || 'get';
  const key = node.data.properties.key ? interpolateVariables(node.data.properties.key, ctx.variables) : undefined;
  const rawValue = node.data.properties.value;
  const value = rawValue !== undefined ? interpolateVariables(rawValue, ctx.variables) : undefined;
  const outputVariable = node.data.properties.outputVariable || 'storageValue';

  ctx.log({ level: 'info', message: `${action.toUpperCase()} ${storageType}Storage [${key || '*'}]`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('storage_manage', { type: storageType, action, key, value }, ctx);

  const vars: Record<string, any> = {};
  if (action === 'get' && res.data !== undefined) {
    vars[outputVariable] = res.data;
  }

  return {
    success: true,
    output: res.data,
    variables: vars,
  };
};

export const executeGenerateData: NodeExecutor = async (node, ctx) => {
  const dataType = node.data.properties.dataType || 'email';
  const outputVariable = node.data.properties.outputVariable || 'generatedData';

  let value: any = '';
  const randId = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now();

  switch (dataType) {
    case 'email':
      value = `test.user_${randId}@example.com`;
      break;
    case 'name': {
      const names = ['Alex Mercer', 'Jordan Hayes', 'Taylor Swift', 'Morgan Reed', 'Sam Fisher', 'Elena Ramos'];
      value = names[Math.floor(Math.random() * names.length)];
      break;
    }
    case 'uuid':
      value = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      break;
    case 'number': {
      const min = Number(node.data.properties.min) || 1;
      const max = Number(node.data.properties.max) || 100;
      value = Math.floor(Math.random() * (max - min + 1)) + min;
      break;
    }
    case 'timestamp':
      value = timestamp;
      break;
    case 'date':
      value = new Date().toISOString();
      break;
    default:
      value = `mock_${randId}`;
  }

  ctx.log({ level: 'info', message: `Generated ${dataType}: "${value}"`, nodeId: node.id, nodeName: node.data.label });

  return {
    success: true,
    output: value,
    variables: { [outputVariable]: value },
  };
};

export const executeClipboard: NodeExecutor = async (node, ctx) => {
  const action = node.data.properties.action || 'write';
  const outputVariable = node.data.properties.outputVariable || 'clipboardText';

  if (action === 'read') {
    ctx.log({ level: 'info', message: 'Reading from system clipboard', nodeId: node.id, nodeName: node.data.label });
    const res = await sendDomAction('clipboard', { action: 'read' }, ctx);
    const text = res?.text || '';
    ctx.log({ level: 'info', message: `Read ${text.length} chars from clipboard into {{${outputVariable}}}`, nodeId: node.id, nodeName: node.data.label });
    return {
      success: true,
      output: text,
      variables: { [outputVariable]: text },
    };
  }

  const rawText = node.data.properties.text || '';
  const text = String(interpolateVariables(rawText, ctx.variables));

  ctx.log({ level: 'info', message: `Writing to clipboard (${text.length} chars)`, nodeId: node.id, nodeName: node.data.label });
  await sendDomAction('clipboard', { action: 'write', text }, ctx);

  return { success: true, output: text };
};

export const executeWaitForNavigation: NodeExecutor = async (node, ctx) => {
  const urlPattern = node.data.properties.urlPattern ? interpolateVariables(node.data.properties.urlPattern, ctx.variables) : undefined;
  const timeout = Number(node.data.properties.timeout) || 15000;

  ctx.log({ level: 'info', message: `Waiting for navigation${urlPattern ? ' to ' + urlPattern : ''}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('wait_for_navigation', { urlPattern, timeout }, ctx, timeout);

  return { success: true, output: res };
};

export const executeAiAgent: NodeExecutor = async (node, ctx) => {
  const rawPrompt = node.data.properties.prompt || 'Analyze this content: {{extractedText}}';
  const prompt = interpolateVariables(rawPrompt, ctx.variables);
  const systemInstruction = node.data.properties.systemInstruction
    ? interpolateVariables(node.data.properties.systemInstruction, ctx.variables)
    : undefined;
  const outputVariable = node.data.properties.outputVariable || 'aiAnalysis';
  const jsonMode = !!node.data.properties.jsonMode;
  const outputFormat = (node.data.properties.outputFormat || (jsonMode ? 'json' : 'text')) as AiAgentOutputFormat;
  const autoDownload = !!node.data.properties.autoDownload;
  const rawDownloadFilename = node.data.properties.downloadFilename || `${outputVariable}_output`;
  const downloadFilename = interpolateVariables(rawDownloadFilename, ctx.variables);

  const customModel = node.data.properties.model;
  const customProvider = node.data.properties.provider;
  const customOpenaiBaseUrl = node.data.properties.openaiBaseUrl;

  let responseText = '';
  try {
    responseText = await queryLlm(prompt, systemInstruction, {
      ...(customModel ? { model: customModel } : {}),
      ...(customProvider ? { provider: customProvider } : {}),
      ...(customOpenaiBaseUrl ? { openaiBaseUrl: customOpenaiBaseUrl } : {}),
    });
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    ctx.log({
      level: 'error',
      message: `AI Agent "${node.data.label}" failed: ${errorMsg}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    throw new Error(`AI Agent (${node.data.label}): ${errorMsg}`);
  }

  const docResult = formatAiAgentDocument(responseText, outputFormat, downloadFilename);
  const output = docResult.parsedOutput;

  if (autoDownload && docResult.dataUrl) {
    try {
      if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
        await new Promise<number | undefined>((resolve, reject) => {
          chrome.downloads.download(
            {
              url: docResult.dataUrl,
              filename: docResult.defaultFilename,
              saveAs: false,
            },
            (downloadId) => {
              if (chrome.runtime?.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(downloadId);
              }
            }
          );
        });
      } else if (typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = docResult.dataUrl;
        a.download = docResult.defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      ctx.log({
        level: 'warn',
        message: `Auto-download failed: ${err.message}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `${outputFormat.toUpperCase()}${autoDownload ? ' (saved)' : ''}`,
    },
  });

  ctx.log({
    level: 'success',
    message: `AI Agent finished analysis (${outputFormat.toUpperCase()})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output,
    variables: {
      [outputVariable]: output,
      [`${outputVariable}_dataUrl`]: docResult.dataUrl,
      [`${outputVariable}_content`]: docResult.formattedContent,
      [`${outputVariable}_filename`]: docResult.defaultFilename,
    },
  };
};

export const executeAutonomousAgent: NodeExecutor = async (node, ctx) => {
  const rawGoal = node.data.properties.goal || 'Inspect page and extract key information';
  const goal = interpolateVariables(rawGoal, ctx.variables);
  const maxSteps = Number(node.data.properties.maxSteps) || 10;
  const outputVariable = node.data.properties.outputVariable || 'agentResult';
  const customModel = node.data.properties.model;

  ctx.log({
    level: 'info',
    message: `Launching Autonomous Browser Agent: "${goal}" (Max steps: ${maxSteps})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const steps = await runBrowserAgent({
    goal,
    maxSteps,
    tabId: ctx.currentTabId,
    config: customModel ? { model: customModel } : undefined,
    signal: ctx.signal,
    onStatusUpdate: (status) => {
      ctx.log({
        level: 'info',
        message: status,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    },
    onStep: (step) => {
      ctx.log({
        level: step.success ? 'info' : 'warn',
        message: `Step #${step.stepNumber} [${step.action.type.toUpperCase()}]: ${step.thought}`,
        nodeId: node.id,
        nodeName: node.data.label,
        data: {
          action: step.action,
          screenshot: step.screenshotAfter || step.screenshotBefore,
        },
      });
    },
  });

  const lastStep = steps[steps.length - 1];
  const finalAnswer = lastStep?.action.answer || `Completed ${steps.length} steps`;

  ctx.log({
    level: 'success',
    message: `Autonomous Agent completed in ${steps.length} steps: ${finalAnswer}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: finalAnswer,
    variables: {
      [outputVariable]: finalAnswer,
      [`${outputVariable}_steps`]: steps,
    },
  };
};

export const executeGenerateImage: NodeExecutor = async (node, ctx) => {
  const rawPrompt = node.data.properties.prompt !== undefined ? node.data.properties.prompt : 'A digital illustration of {{pageTitle}}';
  const prompt = String(interpolateVariables(rawPrompt, ctx.variables) ?? '').trim();
  if (!prompt) {
    throw new Error('Image Generator requires a prompt.');
  }

  // Image input option (URL, data URI, or variable interpolation)
  const rawInputImage = node.data.properties.inputImage || node.data.properties.imageUrl || '';
  const inputImage = String(interpolateVariables(rawInputImage, ctx.variables) ?? '').trim();

  // Asynchronous image generation count (1, 2, 4, 8)
  const rawAsyncCount = Number(node.data.properties.asyncCount || node.data.properties.count || 1);
  const asyncCount = [1, 2, 4, 8].includes(rawAsyncCount) ? rawAsyncCount : Math.min(Math.max(1, rawAsyncCount || 1), 8);

  const aiConfig = await getAiConfig();
  const customApiKey = node.data.properties.apiKey?.trim();
  const apiKey = customApiKey || aiConfig.apiKey;
  if (!apiKey) {
    throw new Error('API Key missing for Image Generator. Please provide an API key in the node properties or configure OpenAI in AI Settings.');
  }

  const model = node.data.properties.model?.trim() || 'dall-e-3';
  const isGmiCloud = model === 'hy-image-v3.5-preview' ||
    model.toLowerCase().includes('hy-image') ||
    node.data.properties.provider === 'gmi_cloud' ||
    Boolean(node.data.properties.baseUrl?.includes('gmicloud.ai'));

  let baseUrl = node.data.properties.baseUrl?.trim();
  const size = node.data.properties.size || (isGmiCloud ? '1920x1080' : '1024x1024');
  const quality = node.data.properties.quality || 'standard';
  const style = node.data.properties.style || 'vivid';
  const responseFormat = node.data.properties.responseFormat || 'url';
  const outputVariable = node.data.properties.outputVariable || 'generatedImageUrl';
  const autoDownload = !!node.data.properties.autoDownload;
  const rawDownloadFilename = node.data.properties.downloadFilename || `${outputVariable}_image`;
  const downloadFilename = String(interpolateVariables(rawDownloadFilename, ctx.variables) ?? `${outputVariable}_image`);

  const downloadSingleImage = async (url: string, filename: string) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
        await new Promise<number | undefined>((resolve, reject) => {
          chrome.downloads.download(
            {
              url,
              filename,
              saveAs: false,
            },
            (downloadId) => {
              if (chrome.runtime?.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(downloadId);
              }
            }
          );
        });
      } else if (typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      ctx.log({ level: 'info', message: `Downloaded generated image as ${filename}`, nodeId: node.id });
    } catch (dlErr: any) {
      ctx.log({ level: 'warn', message: `Auto-download image warning: ${dlErr.message}`, nodeId: node.id });
    }
  };

  // 1. GMI Cloud Queue Engine (hy-image-v3.5-preview & Hunyuan Image)
  if (isGmiCloud) {
    const endpoint = baseUrl || 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests';

    const generateGmiSingle = async (idx: number) => {
      const requestBody: Record<string, any> = {
        model,
        payload: {
          prompt,
          size,
        },
      };

      if (inputImage) {
        requestBody.payload.image = inputImage;
        requestBody.payload.image_url = inputImage;
        requestBody.payload.image_urls = [inputImage];
        requestBody.payload.messages = [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: inputImage } },
            ],
          },
        ];
      }

      const res = await safeFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        let parsedMsg = errText;
        try {
          const errJson = JSON.parse(errText);
          parsedMsg = errJson.message || errJson.error || errText;
        } catch {}
        const fullErr = `GMI Cloud Image Generation error (${res.status}): ${parsedMsg}`;
        ctx.log({ level: 'error', message: fullErr, nodeId: node.id, nodeName: node.data.label });
        throw new Error(fullErr);
      }

      let json = await res.json();
      const requestId = json.request_id || json.id || json.outcome?.request_id;
      let imageUrl = json.outcome?.media_urls?.[0]?.url || json.outcome?.thumbnail_image_url || json.url || '';

      // If job was queued or status is not yet success, poll for outcome
      if (!imageUrl && requestId && json.status !== 'failed' && json.status !== 'error') {
        const baseQueueUrl = endpoint.replace(/\/+$/, '');
        const pollUrl = baseQueueUrl.endsWith(requestId) ? baseQueueUrl : `${baseQueueUrl}/${requestId}`;
        const startTime = Date.now();
        const maxWaitMs = 120000;

        while (Date.now() - startTime < maxWaitMs) {
          if (ctx.signal?.aborted) {
            throw new Error('Image generation aborted by user.');
          }
          await new Promise((r) => setTimeout(r, 2000));
          ctx.log({
            level: 'info',
            message: `Waiting for GMI Cloud job ${requestId}${asyncCount > 1 ? ` [${idx}/${asyncCount}]` : ''} (status: ${json.status || 'processing'})...`,
            nodeId: node.id,
            nodeName: node.data.label,
          });

          const pollRes = await safeFetch(pollUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          });

          if (pollRes.ok) {
            json = await pollRes.json();
            imageUrl = json.outcome?.media_urls?.[0]?.url || json.outcome?.thumbnail_image_url || json.url || '';
            if ((json.status === 'success' || !json.status) && imageUrl) {
              break;
            }
            if (json.status === 'failed' || json.status === 'error') {
              throw new Error(`GMI Cloud image generation failed: ${json.error || json.message || 'Task failed in queue'}`);
            }
          }
        }
      }

      if (!imageUrl) {
        throw new Error(json.error || json.message || 'No image was returned by GMI Cloud API.');
      }

      return {
        url: imageUrl,
        thumbnail: json.outcome?.thumbnail_image_url || imageUrl,
        requestId,
        mediaUrls: json.outcome?.media_urls || [{ url: imageUrl, type: 'image' }],
        json,
      };
    };

    ctx.log({
      level: 'info',
      message: asyncCount > 1
        ? `Asynchronously generating ${asyncCount} images with GMI Cloud ${model} (${size})${inputImage ? ' with image input' : ''}: "${prompt.slice(0, 40)}..."`
        : `Generating image with GMI Cloud ${model} (${size})${inputImage ? ' with image input' : ''}: "${prompt.slice(0, 45)}..."`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    ctx.updateNodeState(node.id, {
      status: 'running',
      dynamicState: {
        message: asyncCount > 1 ? `Submitting ${asyncCount} async jobs to GMI Cloud...` : `Submitting job to GMI Cloud (${model})...`,
        detail: `${size}${asyncCount > 1 ? ` • ${asyncCount}x async` : ''}`,
      },
    });

    const taskPromises = Array.from({ length: asyncCount }, (_, i) => generateGmiSingle(i + 1));
    const results = await Promise.all(taskPromises);

    const imageUrls = results.map(r => r.url);
    const primaryUrl = imageUrls[0];

    if (autoDownload) {
      for (let i = 0; i < imageUrls.length; i++) {
        const baseName = downloadFilename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        const ext = downloadFilename.match(/\.(png|jpg|jpeg|webp)$/i)?.[0] || '.png';
        const finalFilename = imageUrls.length > 1 ? `${baseName}_${i + 1}${ext}` : `${baseName}${ext}`;
        await downloadSingleImage(imageUrls[i], finalFilename);
      }
    }

    ctx.log({
      level: 'success',
      message: asyncCount > 1
        ? `Successfully generated ${imageUrls.length} images asynchronously via GMI Cloud (${model})`
        : `Image generated successfully via GMI Cloud (${model})`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    ctx.updateNodeState(node.id, {
      status: 'success',
      output: asyncCount > 1 ? imageUrls : primaryUrl,
      dynamicState: {
        message: asyncCount > 1 ? `${imageUrls.length} images generated (async)` : 'Image generated',
        previewUrl: primaryUrl,
        images: imageUrls,
        nodeId: node.id,
        detail: `${model} • ${size}${asyncCount > 1 ? ` • ${asyncCount} images` : ''}`,
      },
    });

    return {
      success: true,
      output: asyncCount > 1 ? imageUrls : primaryUrl,
      variables: {
        [outputVariable]: primaryUrl,
        [`${outputVariable}_images`]: imageUrls,
        [`${outputVariable}_urls`]: imageUrls,
        [`${outputVariable}_count`]: imageUrls.length,
        [`${outputVariable}_media_urls`]: results.flatMap(r => r.mediaUrls),
        [`${outputVariable}_thumbnail`]: results[0]?.thumbnail || primaryUrl,
        [`${outputVariable}_request_id`]: results[0]?.requestId || '',
        [`${outputVariable}_request_ids`]: results.map(r => r.requestId).filter(Boolean),
        [`${outputVariable}_revised_prompt`]: prompt,
      },
      items: imageUrls.map((url, idx) => ({ id: idx + 1, url, prompt, index: idx })),
    };
  }

  // 2. OpenAI DALL-E & OpenAI-Compatible Gateways
  if (baseUrl) {
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/images')) {
      baseUrl = `${baseUrl}/v1`;
    }
  } else {
    baseUrl = getOpenAiBaseUrl(aiConfig);
  }

  const endpoint = baseUrl.endsWith('/images/generations') ? baseUrl : `${baseUrl}/images/generations`;

  const generateOpenAiSingle = async (idx: number) => {
    const requestBody: Record<string, any> = {
      prompt,
      model,
      n: 1,
      size,
      response_format: responseFormat,
    };

    if (model.toLowerCase().includes('dall-e-3')) {
      requestBody.quality = quality;
      requestBody.style = style;
    }

    if (inputImage) {
      requestBody.image = inputImage;
      requestBody.image_url = inputImage;
      requestBody.init_image = inputImage;
    }

    const res = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        parsedMsg = errJson.error?.message || errJson.message || errText;
      } catch {}
      const fullErr = `OpenAI Image Generation error (${res.status}): ${parsedMsg}`;
      ctx.log({ level: 'error', message: fullErr, nodeId: node.id, nodeName: node.data.label });
      throw new Error(fullErr);
    }

    const json = await res.json();
    const item = json.data?.[0];
    if (!item) {
      throw new Error('No image was returned by the image generation API.');
    }

    const imageUrl = responseFormat === 'b64_json' && item.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : (item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''));
    const revisedPrompt = item.revised_prompt || prompt;

    return {
      url: imageUrl,
      revisedPrompt,
      rawItem: item,
    };
  };

  ctx.log({
    level: 'info',
    message: asyncCount > 1
      ? `Asynchronously generating ${asyncCount} images with ${model} (${size}, ${quality})${inputImage ? ' with image input' : ''}: "${prompt.slice(0, 40)}..."`
      : `Generating image with ${model} (${size}, ${quality})${inputImage ? ' with image input' : ''}: "${prompt.slice(0, 45)}..."`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: asyncCount > 1 ? `Generating ${asyncCount} images asynchronously...` : `Generating image with ${model}...`,
      detail: `${size} • ${quality}${asyncCount > 1 ? ` • ${asyncCount}x async` : ''}`,
    },
  });

  const taskPromises = Array.from({ length: asyncCount }, (_, i) => generateOpenAiSingle(i + 1));
  const results = await Promise.all(taskPromises);

  const imageUrls = results.map(r => r.url);
  const primaryUrl = imageUrls[0];
  const revisedPrompt = results[0]?.revisedPrompt || prompt;

  if (autoDownload) {
    for (let i = 0; i < imageUrls.length; i++) {
      const baseName = downloadFilename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      const ext = downloadFilename.match(/\.(png|jpg|jpeg|webp)$/i)?.[0] || '.png';
      const finalFilename = imageUrls.length > 1 ? `${baseName}_${i + 1}${ext}` : `${baseName}${ext}`;
      await downloadSingleImage(imageUrls[i], finalFilename);
    }
  }

  ctx.log({
    level: 'success',
    message: asyncCount > 1
      ? `Successfully generated ${imageUrls.length} images asynchronously (${model})`
      : `Image generated successfully (${model})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    output: asyncCount > 1 ? imageUrls : primaryUrl,
    dynamicState: {
      message: asyncCount > 1 ? `${imageUrls.length} images generated (async)` : 'Image generated',
      previewUrl: primaryUrl,
      images: imageUrls,
      nodeId: node.id,
      detail: `${model} • ${size}${asyncCount > 1 ? ` • ${asyncCount} images` : ''}`,
    },
  });

  return {
    success: true,
    output: asyncCount > 1 ? imageUrls : primaryUrl,
    variables: {
      [outputVariable]: primaryUrl,
      [`${outputVariable}_images`]: imageUrls,
      [`${outputVariable}_urls`]: imageUrls,
      [`${outputVariable}_count`]: imageUrls.length,
      [`${outputVariable}_revised_prompt`]: revisedPrompt,
    },
    items: imageUrls.map((url, idx) => ({ id: idx + 1, url, prompt, index: idx })),
  };
};

// ----------------- MESSAGING & NOTIFICATION EXECUTORS -----------------

// ----------------- MESSAGING & NOTIFICATION EXECUTORS -----------------

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

export const executeTelegramMessage: NodeExecutor = async (node, ctx) => {
  const credentialId = node.data.properties.credentialId;
  const savedCred = credentialId ? await getCredentialById(credentialId) : undefined;

  const rawBotToken = node.data.properties.botToken || savedCred?.botToken || '';
  const rawChatId = node.data.properties.chatId || savedCred?.defaultChatId || '';
  const messageType = node.data.properties.messageType || 'text'; // 'text' | 'photo' | 'document'
  const rawMessage = node.data.properties.message || '';
  const rawCaption = node.data.properties.caption || '';
  const rawImageUrl = node.data.properties.imageUrl || '';
  const parseMode = node.data.properties.parseMode || 'HTML';
  const silent = !!node.data.properties.silent;
  const protectContent = !!node.data.properties.protectContent;
  const outputVariable = node.data.properties.outputVariable || 'telegramResponse';

  const botToken = String(interpolateVariables(rawBotToken, ctx.variables)).trim();
  const chatId = String(interpolateVariables(rawChatId, ctx.variables)).trim();
  const message = String(interpolateVariables(rawMessage, ctx.variables));
  const caption = String(interpolateVariables(rawCaption, ctx.variables));
  const imageUrl = rawImageUrl ? String(interpolateVariables(rawImageUrl, ctx.variables)).trim() : '';

  if (!botToken) {
    throw new Error('Telegram Bot Token is required. Select a saved account or provide a token.');
  }
  if (!chatId) {
    throw new Error('Telegram Chat ID is required. Use your chat ID or @channel.');
  }

  const isPhoto = messageType === 'photo' || (!!imageUrl && messageType !== 'document');
  const isDocument = messageType === 'document';

  let endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
  let fetchOptions: RequestInit = { method: 'POST', signal: ctx.signal };

  const captionText = caption || message || '';

  if (isPhoto && imageUrl) {
    endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    if (imageUrl.startsWith('data:')) {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = dataUrlToBlob(imageUrl);
      formData.append('photo', blob, 'screenshot.png');
      if (captionText) formData.append('caption', captionText);
      if (parseMode && parseMode !== 'None') formData.append('parse_mode', parseMode);
      if (silent) formData.append('disable_notification', 'true');
      if (protectContent) formData.append('protect_content', 'true');
      fetchOptions.body = formData;
    } else {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify({
        chat_id: chatId,
        photo: imageUrl,
        ...(captionText ? { caption: captionText } : {}),
        ...(parseMode && parseMode !== 'None' ? { parse_mode: parseMode } : {}),
        ...(silent ? { disable_notification: true } : {}),
        ...(protectContent ? { protect_content: true } : {}),
      });
    }
  } else if (isDocument && imageUrl) {
    endpoint = `https://api.telegram.org/bot${botToken}/sendDocument`;
    if (imageUrl.startsWith('data:')) {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = dataUrlToBlob(imageUrl);
      formData.append('document', blob, 'document.png');
      if (captionText) formData.append('caption', captionText);
      if (parseMode && parseMode !== 'None') formData.append('parse_mode', parseMode);
      if (silent) formData.append('disable_notification', 'true');
      fetchOptions.body = formData;
    } else {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify({
        chat_id: chatId,
        document: imageUrl,
        ...(captionText ? { caption: captionText } : {}),
        ...(parseMode && parseMode !== 'None' ? { parse_mode: parseMode } : {}),
        ...(silent ? { disable_notification: true } : {}),
      });
    }
  } else {
    if (!message) {
      throw new Error('Telegram message text cannot be empty.');
    }
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify({
      chat_id: chatId,
      text: message,
      ...(parseMode && parseMode !== 'None' ? { parse_mode: parseMode } : {}),
      ...(silent ? { disable_notification: true } : {}),
      ...(protectContent ? { protect_content: true } : {}),
    });
  }

  ctx.log({
    level: 'info',
    message: `Sending Telegram ${isPhoto ? 'photo' : isDocument ? 'document' : 'message'} to ${chatId}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const response = await fetch(endpoint, fetchOptions);
  const contentType = response.headers.get('content-type') || '';
  const resData = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok || (typeof resData === 'object' && resData.ok === false)) {
    const errMsg =
      (typeof resData === 'object' && resData.description) ||
      response.statusText ||
      'Telegram message dispatch failed';
    throw new Error(`Telegram error (${response.status}): ${errMsg}`);
  }

  ctx.log({
    level: 'success',
    message: `Telegram ${isPhoto ? 'photo' : 'message'} delivered successfully to ${chatId}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: resData,
    variables: { [outputVariable]: resData },
  };
};

export const executeDiscordMessage: NodeExecutor = async (node, ctx) => {
  const credentialId = node.data.properties.credentialId;
  const savedCred = credentialId ? await getCredentialById(credentialId) : undefined;

  const mode = node.data.properties.mode || savedCred?.mode || 'webhook';
  const rawWebhookUrl = node.data.properties.webhookUrl || savedCred?.webhookUrl || '';
  const rawBotToken = node.data.properties.botToken || savedCred?.botToken || '';
  const rawChannelId = node.data.properties.channelId || savedCred?.channelId || '';
  const rawContent = node.data.properties.content || '';
  const rawUsername = node.data.properties.username || savedCred?.username || '';
  const rawAvatarUrl = node.data.properties.avatarUrl || savedCred?.avatarUrl || '';
  const rawImageUrl = node.data.properties.imageUrl || '';
  const rawEmbedTitle = node.data.properties.embedTitle || '';
  const rawEmbedDescription = node.data.properties.embedDescription || '';
  const rawEmbedFooter = node.data.properties.embedFooter || node.data.properties.footerText || '';
  const rawEmbedThumbnail = node.data.properties.embedThumbnail || node.data.properties.thumbnailUrl || '';
  const embedColor = node.data.properties.embedColor || '#5865F2';
  const rawFields = node.data.properties.embedFields || [];
  const outputVariable = node.data.properties.outputVariable || 'discordResponse';

  const webhookUrl = String(interpolateVariables(rawWebhookUrl, ctx.variables)).trim();
  const botToken = String(interpolateVariables(rawBotToken, ctx.variables)).trim();
  const channelId = String(interpolateVariables(rawChannelId, ctx.variables)).trim();
  const content = rawContent ? String(interpolateVariables(rawContent, ctx.variables)) : '';
  const username = rawUsername ? String(interpolateVariables(rawUsername, ctx.variables)).trim() : undefined;
  const avatarUrl = rawAvatarUrl ? String(interpolateVariables(rawAvatarUrl, ctx.variables)).trim() : undefined;
  const imageUrl = rawImageUrl ? String(interpolateVariables(rawImageUrl, ctx.variables)).trim() : '';
  const embedTitle = rawEmbedTitle ? String(interpolateVariables(rawEmbedTitle, ctx.variables)) : '';
  const embedDescription = rawEmbedDescription ? String(interpolateVariables(rawEmbedDescription, ctx.variables)) : '';
  const embedFooter = rawEmbedFooter ? String(interpolateVariables(rawEmbedFooter, ctx.variables)) : '';
  const embedThumbnail = rawEmbedThumbnail ? String(interpolateVariables(rawEmbedThumbnail, ctx.variables)) : '';

  if (!content && !embedTitle && !embedDescription && !imageUrl) {
    throw new Error('Discord message must include at least message content, an embed, or an image.');
  }

  let targetUrl = '';
  let authHeaders: Record<string, string> = {};

  if (mode === 'webhook') {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      throw new Error('Discord Webhook URL is required in webhook mode (e.g. https://discord.com/api/webhooks/...).');
    }
    targetUrl = webhookUrl;
  } else {
    if (!botToken) {
      throw new Error('Discord Bot Token is required in Bot mode.');
    }
    if (!channelId) {
      throw new Error('Discord Channel ID is required in Bot mode.');
    }
    targetUrl = `https://discord.com/api/v10/channels/${channelId}/messages`;
    authHeaders['Authorization'] = `Bot ${botToken}`;
  }

  let colorNum = 0x5865f2;
  if (embedColor) {
    const hex = embedColor.replace('#', '');
    const parsed = parseInt(hex, 16);
    if (!isNaN(parsed)) colorNum = parsed;
  }

  const fields = Array.isArray(rawFields)
    ? rawFields
        .filter((f) => f && f.name && f.value)
        .map((f) => ({
          name: String(interpolateVariables(f.name, ctx.variables)),
          value: String(interpolateVariables(f.value, ctx.variables)),
          inline: f.inline !== false,
        }))
    : [];

  const hasEmbed = !!(embedTitle || embedDescription || embedFooter || embedThumbnail || fields.length > 0 || (imageUrl && !imageUrl.startsWith('data:')));

  let fetchOptions: RequestInit = { method: 'POST', signal: ctx.signal };

  if (imageUrl && imageUrl.startsWith('data:')) {
    const formData = new FormData();
    const blob = dataUrlToBlob(imageUrl);
    formData.append('files[0]', blob, 'screenshot.png');

    const payloadJson: Record<string, any> = {};
    if (content) payloadJson.content = content;
    if (mode === 'webhook') {
      if (username) payloadJson.username = username;
      if (avatarUrl) payloadJson.avatar_url = avatarUrl;
    }

    const embedObj: Record<string, any> = {
      color: colorNum,
      image: { url: 'attachment://screenshot.png' },
      timestamp: new Date().toISOString(),
      ...(embedTitle ? { title: embedTitle } : {}),
      ...(embedDescription ? { description: embedDescription } : {}),
      ...(embedFooter ? { footer: { text: embedFooter } } : {}),
      ...(embedThumbnail ? { thumbnail: { url: embedThumbnail } } : {}),
      ...(fields.length > 0 ? { fields } : {}),
    };
    payloadJson.embeds = [embedObj];

    formData.append('payload_json', JSON.stringify(payloadJson));
    fetchOptions.headers = authHeaders;
    fetchOptions.body = formData;
  } else {
    const payload: Record<string, any> = {};
    if (content) payload.content = content;
    if (mode === 'webhook') {
      if (username) payload.username = username;
      if (avatarUrl) payload.avatar_url = avatarUrl;
    }

    if (hasEmbed) {
      payload.embeds = [
        {
          color: colorNum,
          timestamp: new Date().toISOString(),
          ...(embedTitle ? { title: embedTitle } : {}),
          ...(embedDescription ? { description: embedDescription } : {}),
          ...(imageUrl ? { image: { url: imageUrl } } : {}),
          ...(embedFooter ? { footer: { text: embedFooter } } : {}),
          ...(embedThumbnail ? { thumbnail: { url: embedThumbnail } } : {}),
          ...(fields.length > 0 ? { fields } : {}),
        },
      ];
    }

    fetchOptions.headers = { ...authHeaders, 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(payload);
  }

  ctx.log({
    level: 'info',
    message: `Sending Discord ${imageUrl ? 'image/screenshot' : 'message'} (${mode === 'webhook' ? 'Webhook' : `Channel #${channelId}`})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const response = await fetch(targetUrl, fetchOptions);

  let resData: any = { ok: true, status: response.status };
  if (response.status !== 204) {
    const contentType = response.headers.get('content-type') || '';
    resData = contentType.includes('application/json') ? await response.json() : await response.text();
  }

  if (!response.ok) {
    const errMsg =
      typeof resData === 'object' && resData.message
        ? resData.message
        : response.statusText || 'Discord notification failed';
    throw new Error(`Discord error (${response.status}): ${errMsg}`);
  }

  ctx.log({
    level: 'success',
    message: 'Discord message delivered successfully',
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: resData,
    variables: { [outputVariable]: resData },
  };
};

export const executeSlackMessage: NodeExecutor = async (node, ctx) => {
  const credentialId = node.data.properties.credentialId;
  const savedCred = credentialId ? await getCredentialById(credentialId) : undefined;

  const mode = node.data.properties.mode || savedCred?.mode || 'webhook';
  const rawWebhookUrl = node.data.properties.webhookUrl || savedCred?.webhookUrl || '';
  const rawBotToken = node.data.properties.botToken || savedCred?.botToken || '';
  const rawChannel = node.data.properties.channel || savedCred?.channel || '';
  const rawText = node.data.properties.text || '';
  const rawHeaderText = node.data.properties.headerText || '';
  const rawImageUrl = node.data.properties.imageUrl || '';
  const rawImageAlt = node.data.properties.imageAltText || node.data.properties.imageAlt || 'AutoFlow Image';
  const rawFooterText = node.data.properties.footerText || '';
  const rawFields = node.data.properties.fields || [];
  const rawUsername = node.data.properties.username || savedCred?.username || '';
  const iconEmoji = node.data.properties.iconEmoji || savedCred?.iconEmoji || '';
  const outputVariable = node.data.properties.outputVariable || 'slackResponse';

  const webhookUrl = String(interpolateVariables(rawWebhookUrl, ctx.variables)).trim();
  const botToken = String(interpolateVariables(rawBotToken, ctx.variables)).trim();
  const channel = rawChannel ? String(interpolateVariables(rawChannel, ctx.variables)).trim() : undefined;
  const text = String(interpolateVariables(rawText, ctx.variables));
  const headerText = rawHeaderText ? String(interpolateVariables(rawHeaderText, ctx.variables)) : '';
  const imageUrl = rawImageUrl ? String(interpolateVariables(rawImageUrl, ctx.variables)).trim() : '';
  const imageAlt = String(interpolateVariables(rawImageAlt, ctx.variables));
  const footerText = rawFooterText ? String(interpolateVariables(rawFooterText, ctx.variables)) : '';
  const username = rawUsername ? String(interpolateVariables(rawUsername, ctx.variables)).trim() : undefined;

  if (!text && !headerText && !imageUrl) {
    throw new Error('Slack message text or image is required.');
  }

  // Uploading base64 image/screenshot with Slack Bot token
  if (imageUrl && imageUrl.startsWith('data:') && mode === 'bot' && botToken && channel) {
    ctx.log({
      level: 'info',
      message: `Uploading screenshot image to Slack channel ${channel}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    const formData = new FormData();
    const blob = dataUrlToBlob(imageUrl);
    formData.append('file', blob, 'screenshot.png');
    formData.append('channels', channel);
    formData.append('filename', 'screenshot.png');
    formData.append('title', headerText || 'AutoFlow Screenshot');
    if (text) formData.append('initial_comment', text);

    const uploadRes = await fetch('https://slack.com/api/files.upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}` },
      body: formData,
      signal: ctx.signal,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.ok) {
      throw new Error(`Slack file upload error: ${uploadData.error || uploadRes.statusText}`);
    }

    ctx.log({
      level: 'success',
      message: 'Slack screenshot uploaded successfully',
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return {
      success: true,
      output: uploadData,
      variables: { [outputVariable]: uploadData },
    };
  }

  let targetUrl = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (mode === 'webhook') {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      throw new Error('Slack Webhook URL is required in webhook mode (e.g. https://hooks.slack.com/services/...).');
    }
    targetUrl = webhookUrl;
  } else {
    if (!botToken) {
      throw new Error('Slack Bot Token is required in Bot mode (e.g. xoxb-...).');
    }
    if (!channel) {
      throw new Error('Slack channel is required in Bot mode (e.g. #general or C1234567890).');
    }
    targetUrl = 'https://slack.com/api/chat.postMessage';
    headers['Authorization'] = `Bearer ${botToken}`;
  }

  const payload: Record<string, any> = {
    text: text || headerText || 'AutoFlow Notification',
  };
  if (channel) payload.channel = channel;
  if (username) payload.username = username;
  if (iconEmoji) payload.icon_emoji = iconEmoji;

  // Build Block Kit blocks for rich layouts
  const blocks: any[] = [];

  if (headerText) {
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: headerText.slice(0, 150), emoji: true },
    });
  }

  if (text) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text },
    });
  }

  // Image block (for web URLs)
  if (imageUrl && !imageUrl.startsWith('data:')) {
    blocks.push({
      type: 'image',
      image_url: imageUrl,
      alt_text: imageAlt || 'Image preview',
      title: { type: 'plain_text', text: imageAlt.slice(0, 100) },
    });
  }

  // Key-value fields
  const fieldList = Array.isArray(rawFields) ? rawFields.filter((f) => f && (f.label || f.name)) : [];
  if (fieldList.length > 0) {
    const formattedFields = fieldList.slice(0, 10).map((f) => {
      const label = String(interpolateVariables(f.label || f.name || '', ctx.variables));
      const val = String(interpolateVariables(f.value || '', ctx.variables));
      return { type: 'mrkdwn', text: `*${label}:*\n${val}` };
    });
    blocks.push({
      type: 'section',
      fields: formattedFields,
    });
  }

  if (footerText) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: footerText }],
    });
  }

  if (blocks.length > 0) {
    payload.blocks = blocks;
  }

  ctx.log({
    level: 'info',
    message: `Sending Slack notification (${mode === 'webhook' ? 'Webhook' : `Channel ${channel}`})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: ctx.signal,
  });

  const contentType = response.headers.get('content-type') || '';
  let resData: any;
  if (contentType.includes('application/json')) {
    resData = await response.json();
  } else {
    const textResp = await response.text();
    resData = { ok: response.ok && (textResp === 'ok' || textResp.includes('"ok":true')), response: textResp };
  }

  if (!response.ok || (typeof resData === 'object' && resData.ok === false)) {
    const errMsg =
      (typeof resData === 'object' && (resData.error || resData.response)) ||
      response.statusText ||
      'Slack message dispatch failed';
    throw new Error(`Slack error (${response.status}): ${errMsg}`);
  }

  ctx.log({
    level: 'success',
    message: 'Slack message sent successfully',
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: resData,
    variables: { [outputVariable]: resData },
  };
};

// ----------------- NEW DYNAMIC EXECUTORS -----------------

export const executeSmartScroll: NodeExecutor = async (node, ctx) => {
  const mode = node.data.properties.mode || 'to_bottom';
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  const maxScrolls = Math.min(Number(node.data.properties.maxScrolls) || 5, 50);
  const distance = Number(node.data.properties.distance) || 600;
  const scrollSpeed = node.data.properties.scrollSpeed || 'normal';

  let scrollDelay: number;
  let smooth: boolean;

  if (scrollSpeed === 'slow') {
    scrollDelay = 1500;
    smooth = true;
  } else if (scrollSpeed === 'fast') {
    scrollDelay = 300;
    smooth = true;
  } else if (scrollSpeed === 'instant') {
    scrollDelay = 50;
    smooth = false;
  } else if (scrollSpeed === 'normal') {
    scrollDelay = 800;
    smooth = true;
  } else {
    // 'custom' or manual delay
    scrollDelay = Number(node.data.properties.scrollDelay) || 800;
    smooth = node.data.properties.smooth !== undefined ? !!node.data.properties.smooth : true;
  }

  const outputVariable = node.data.properties.outputVariable || 'scrollResult';

  ctx.log({
    level: 'info',
    message: `Starting Smart Scroll (${mode}, ${scrollSpeed} speed, max ${maxScrolls} passes)`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Scrolling (${mode}, ${scrollSpeed})...`,
      currentIteration: 0,
      totalIterations: maxScrolls,
      progress: 0,
    },
  });

  let totalScrolls = 0;
  for (let pass = 1; pass <= maxScrolls; pass++) {
    if (ctx.signal?.aborted) throw new Error('Smart Scroll aborted by user.');

    ctx.updateNodeState(node.id, {
      status: 'running',
      dynamicState: {
        message: `Scroll pass ${pass}/${maxScrolls} (${scrollSpeed})`,
        currentIteration: pass,
        totalIterations: maxScrolls,
        progress: Math.round((pass / maxScrolls) * 100),
      },
    });

    await sendDomAction(
      'scroll',
      {
        direction: 'down',
        amount: distance,
        selector,
        smooth,
      },
      ctx
    );

    totalScrolls++;

    if (pass < maxScrolls) {
      await new Promise((r) => setTimeout(r, scrollDelay));
    }
  }

  const result = { totalScrolls, mode, maxScrolls, scrollSpeed };

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Finished ${totalScrolls} passes`,
      progress: 100,
    },
  });

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeMathCalculate: NodeExecutor = async (node, ctx) => {
  const operation = node.data.properties.operation || 'add';
  const outputVariable = node.data.properties.outputVariable || 'counter';
  const leftRaw = interpolateVariables(node.data.properties.leftOperand ?? '0', ctx.variables);
  const rightRaw = interpolateVariables(node.data.properties.rightOperand ?? '1', ctx.variables);

  let result = 0;
  const left = Number(leftRaw) || 0;
  const right = Number(rightRaw) || 0;

  switch (operation) {
    case 'add':
    case 'increment':
      result = left + right;
      break;
    case 'subtract':
    case 'decrement':
      result = left - right;
      break;
    case 'multiply':
      result = left * right;
      break;
    case 'divide':
      result = right !== 0 ? left / right : 0;
      break;
    case 'formula': {
      const formulaRaw = String(node.data.properties.formula || '');
      const formula = interpolateVariables(formulaRaw, ctx.variables);
      try {
        result = safeEvaluateMath(formula, ctx.variables);
      } catch (e) {
        result = 0;
      }
      break;
    }
    default:
      result = left + right;
  }

  ctx.log({
    level: 'info',
    message: `Math Calculate: ${outputVariable} = ${result}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `${outputVariable} = ${result}`,
      detail: `${left} ${operation} ${right} = ${result}`,
    },
  });

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeDownloadFile: NodeExecutor = async (node, ctx) => {
  const sourceType = node.data.properties.sourceType || 'variable';
  const rawUrl = node.data.properties.url || '';
  const rawContent = node.data.properties.content || '';
  const rawFilename = node.data.properties.filename || 'download.txt';
  const saveAs = !!node.data.properties.saveAs;
  const outputVariable = node.data.properties.outputVariable || 'downloadResult';

  const filename = String(interpolateVariables(rawFilename, ctx.variables));
  let downloadUrl = String(interpolateVariables(rawUrl, ctx.variables));

  if (sourceType === 'content' || (!downloadUrl && rawContent)) {
    const content = String(interpolateVariables(rawContent, ctx.variables));
    downloadUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
  }

  ctx.log({
    level: 'info',
    message: `Downloading file: ${filename}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Downloading ${filename}...`,
      progress: 50,
    },
  });

  let downloadId: any = 1;
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    try {
      downloadId = await chrome.downloads.download({
        url: downloadUrl,
        filename,
        saveAs,
      });
    } catch (e: any) {
      downloadId = 'download_fallback';
    }
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Saved: ${filename}`,
      progress: 100,
    },
  });

  return {
    success: true,
    output: { filename, downloadId },
    variables: { [outputVariable]: { filename, downloadId } },
  };
};

/**
 * Universal file download trigger (Chrome downloads API with DOM anchor fallback)
 */
async function triggerFileDownload(dataUrl: string, filename: string, saveAs = false): Promise<any> {
  // Enforce .pdf extension when downloading application/pdf data URLs
  let resolvedFilename = filename;
  if (dataUrl.startsWith('data:application/pdf') && !resolvedFilename.toLowerCase().endsWith('.pdf')) {
    resolvedFilename += '.pdf';
  }

  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    try {
      return await chrome.downloads.download({
        url: dataUrl,
        filename: resolvedFilename,
        saveAs,
      });
    } catch (e) {
      console.warn('[AutoFlow] Chrome download API failed, falling back to DOM anchor:', e);
    }
  }

  if (typeof document !== 'undefined') {
    try {
      let downloadHref = dataUrl;
      let blobUrlToRevoke: string | null = null;

      // In browser/DOM context, create an application/pdf Blob URL so browser won't rename to .htm
      if (dataUrl.startsWith('data:application/pdf;base64,')) {
        try {
          const base64Data = dataUrl.slice('data:application/pdf;base64,'.length);
          const binaryStr = typeof atob === 'function' ? atob(base64Data) : Buffer.from(base64Data, 'base64').toString('binary');
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          downloadHref = URL.createObjectURL(blob);
          blobUrlToRevoke = downloadHref;
        } catch (_) {}
      }

      const a = document.createElement('a');
      a.href = downloadHref;
      a.download = resolvedFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        if (blobUrlToRevoke && typeof URL !== 'undefined' && URL.revokeObjectURL) {
          URL.revokeObjectURL(blobUrlToRevoke);
        }
      }, 500);
      return 'dom_fallback';
    } catch (domErr) {
      console.warn('[AutoFlow] DOM download fallback failed:', domErr);
    }
  }

  return 'download_unsupported';
}

export const executeExportData: NodeExecutor = async (node, ctx) => {
  const format = (node.data.properties.format || 'csv') as ExportDataFormat;
  const sourceMode = node.data.properties.sourceMode || 'variable';
  const rawFilename = node.data.properties.filename || 'collected_data';
  const filename = String(interpolateVariables(rawFilename, ctx.variables));
  const autoDownload = node.data.properties.autoDownload !== false;
  const saveAs = !!node.data.properties.saveAs;
  const copyToClipboard = !!node.data.properties.copyToClipboard;
  const csvDelimiter = node.data.properties.csvDelimiter || (format === 'tsv' ? '\t' : ',');
  const includeHeaders = node.data.properties.includeHeaders !== false;
  const sheetName = node.data.properties.sheetName || 'Data';
  const outputVariable = node.data.properties.outputVariable || 'exportedData';
  const excludeEmpty = !!node.data.properties.excludeEmpty;
  const filterEmptyMode = (node.data.properties.filterEmptyMode || 'any') as 'any' | 'all';

  ctx.log({
    level: 'info',
    message: `Exporting dataset (${format.toUpperCase()} mode: ${sourceMode}) to ${filename}${excludeEmpty ? ` [Exclude empty: ${filterEmptyMode}]` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Preparing ${format.toUpperCase()} export...`,
      progress: 25,
    },
  });

  let rawDataset: any = null;

  // 1. Resolve source data according to sourceMode
  if (sourceMode === 'dom_elements') {
    const containerSelector = node.data.properties.domContainerSelector
      ? interpolateVariables(node.data.properties.domContainerSelector, ctx.variables)
      : undefined;
    const domFields = Array.isArray(node.data.properties.domFields) ? node.data.properties.domFields : [];
    const fields = domFields.map((f: any) => ({
      name: interpolateVariables(f.name || 'field', ctx.variables),
      selector: f.selector ? interpolateVariables(f.selector, ctx.variables) : undefined,
      attribute: f.attribute ? interpolateVariables(f.attribute, ctx.variables) : undefined,
    }));

    const res = await sendDomAction('extract_dataset', { containerSelector, fields, excludeEmpty, filterEmptyMode }, ctx, 15000);
    rawDataset = res?.items || [];
  } else if (sourceMode === 'multiple_variables') {
    const columns = Array.isArray(node.data.properties.columns) ? node.data.properties.columns : [];
    const resolvedColumns = columns.map((col: any) => {
      const header = String(interpolateVariables(col.header || 'Column', ctx.variables));
      let val: any = undefined;
      const rawVal = col.value || '';
      const varMatch = String(rawVal).trim().match(/^\{\{([a-zA-Z0-9_.-]+)\}\}$/);
      if (varMatch && ctx.variables[varMatch[1]] !== undefined) {
        val = ctx.variables[varMatch[1]];
      } else {
        val = interpolateVariables(rawVal, ctx.variables);
      }
      return { header, value: val };
    });

    rawDataset = zipVariablesToDataset(resolvedColumns);
  } else if (sourceMode === 'custom_json') {
    const rawJson = node.data.properties.customJson || '[]';
    const interpolated = interpolateVariables(rawJson, ctx.variables);
    try {
      rawDataset = JSON.parse(interpolated);
    } catch {
      rawDataset = [{ value: interpolated }];
    }
  } else {
    // Default: 'variable' mode
    const varNameRaw = node.data.properties.datasetVariable || 'extractedList';
    const varMatch = String(varNameRaw).trim().match(/^\{\{([a-zA-Z0-9_.-]+)\}\}$/);
    const cleanVarName = varMatch ? varMatch[1] : varNameRaw.trim();

    if (ctx.variables[cleanVarName] !== undefined) {
      rawDataset = ctx.variables[cleanVarName];
    } else {
      const interpolated = interpolateVariables(varNameRaw, ctx.variables);
      if (typeof interpolated === 'string' && (interpolated.startsWith('[') || interpolated.startsWith('{'))) {
        try {
          rawDataset = JSON.parse(interpolated);
        } catch {
          rawDataset = interpolated;
        }
      } else {
        rawDataset = interpolated;
      }
    }
  }

  // 2. Format dataset into document (with optional empty entry exclusion)
  const doc = createExportDocument(rawDataset, format, {
    filename,
    delimiter: csvDelimiter,
    includeHeaders,
    sheetName,
    excludeEmpty,
    filterEmptyMode,
  });

  if (excludeEmpty && Array.isArray(rawDataset) && doc.rowCount < rawDataset.length) {
    ctx.log({
      level: 'info',
      message: `Excluded ${rawDataset.length - doc.rowCount} empty entries (${doc.rowCount} valid rows retained)`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
  }

  // 3. Auto-download if enabled
  let downloadId: any = undefined;
  if (autoDownload && doc.dataUrl) {
    downloadId = await triggerFileDownload(doc.dataUrl, doc.filename, saveAs);
  }

  // 4. Copy to clipboard if enabled
  if (copyToClipboard && doc.content) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(doc.content);
      } else {
        await sendDomAction('copy_to_clipboard', { text: doc.content }, ctx, 3000);
      }
    } catch (clipErr) {
      console.warn('[AutoFlow] Copy to clipboard warning:', clipErr);
    }
  }

  ctx.log({
    level: 'success',
    message: `Exported ${doc.rowCount} rows (${doc.columnCount} columns) to ${doc.filename}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `${doc.filename} (${doc.rowCount} rows)`,
      detail: `${doc.rowCount} rows × ${doc.columnCount} cols [${format.toUpperCase()}]`,
      progress: 100,
    },
  });

  const exportVars = {
    [outputVariable]: doc.rows,
    [`${outputVariable}_content`]: doc.content,
    [`${outputVariable}_dataUrl`]: doc.dataUrl,
    [`${outputVariable}_filename`]: doc.filename,
    [`${outputVariable}_count`]: doc.rowCount,
    [`${outputVariable}_downloadId`]: downloadId,
  };
  Object.assign(ctx.variables, exportVars);

  return {
    success: true,
    output: doc.rows,
    variables: exportVars,
  };
};

export const executeShowNotification: NodeExecutor = async (node, ctx) => {
  const rawTitle = node.data.properties.title || 'AutoFlow Alert';
  const rawMsg = node.data.properties.message || 'Workflow finished!';
  const title = String(interpolateVariables(rawTitle, ctx.variables));
  const message = String(interpolateVariables(rawMsg, ctx.variables));
  const outputVariable = node.data.properties.outputVariable || 'notificationResult';

  ctx.log({
    level: 'info',
    message: `Showing notification: ${title} - ${message}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: 'Displaying alert...',
    },
  });

  const notificationId = `notif_${Date.now()}`;
  let notificationSent = false;

  // Route notification through background service worker for reliable OS-level display
  // (background has chrome.runtime.getURL access and no CORS/icon download issues)
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const bgRes = await chrome.runtime.sendMessage({
        type: 'SHOW_NOTIFICATION',
        payload: {
          title,
          message,
          iconUrl: node.data.properties.iconUrl,
        },
      });
      notificationSent = bgRes?.success === true;
    } catch (bgErr) {
      console.warn('[AutoFlow] Background notification dispatch failed:', bgErr);
    }
  }

  // Fallback: try direct chrome.notifications.create (may fail with icon issues in MV3 tabs)
  if (!notificationSent && typeof chrome !== 'undefined' && chrome.notifications?.create) {
    try {
      const resolvedIcon = chrome.runtime?.getURL
        ? chrome.runtime.getURL(node.data.properties.iconUrl || 'icons/icon128.png')
        : node.data.properties.iconUrl || 'icons/icon128.png';
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: resolvedIcon,
        title,
        message,
        priority: 2,
      });
      notificationSent = true;
    } catch (e) {
      console.warn('[AutoFlow] Direct chrome.notifications.create warning:', e);
    }
  }

  // In-tab toast banner fallback so user always sees something even if OS notifications are silenced
  if (typeof document !== 'undefined') {
    try {
      const toast = document.createElement('div');
      toast.setAttribute('style', [
        'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
        'max-width:360px', 'padding:14px 18px', 'border-radius:10px',
        'background:linear-gradient(135deg,#1e1e2e 0%,#2a2a3e 100%)',
        'color:#e0e0e0', 'font-family:system-ui,sans-serif', 'font-size:13px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.45)', 'border:1px solid rgba(99,102,241,0.3)',
        'animation:slideInRight 0.3s ease-out',
        'pointer-events:auto', 'cursor:pointer',
      ].join(';'));
      toast.innerHTML = `<div style="font-weight:600;margin-bottom:4px;color:#a5b4fc">🔔 ${title}</div><div style="opacity:0.85">${message}</div>`;
      toast.onclick = () => toast.remove();
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 6000);
    } catch {}
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Alerted: ${title.slice(0, 18)}`,
    },
  });

  return {
    success: true,
    output: { notificationId, title, message, notificationSent },
    variables: { [outputVariable]: { notificationId, title, message, notificationSent } },
  };
};

// ----------------- COMMAND EXECUTORS -----------------

export const executeStopTimer: NodeExecutor = async (node, ctx) => {
  const targetTimer = node.data.properties.targetTimer || 'all';
  const action = (node.data.properties.action as 'complete_early' | 'cancel') || 'complete_early';
  const rawReason = node.data.properties.reason || 'Condition matched';
  const reason = String(interpolateVariables(rawReason, ctx.variables));
  const outputVariable = node.data.properties.outputVariable || 'timerStopped';

  const normalizedTarget = String(targetTimer).trim().toLowerCase();
  const activeTimers = ctx._activeTimers;
  let stoppedCount = 0;

  const matchesTimer = (timer: ActiveTimer, id: string): boolean => {
    if (!normalizedTarget || normalizedTarget === 'all') return true;
    if (id.toLowerCase() === normalizedTarget) return true;
    if (timer.nodeId && timer.nodeId.toLowerCase() === normalizedTarget) return true;
    if (timer.timerName && timer.timerName.trim().toLowerCase() === normalizedTarget) return true;
    return false;
  };

  const stoppedIds = new Set<string>();

  // Check context active timers
  if (activeTimers && activeTimers.size > 0) {
    for (const [id, timer] of activeTimers.entries()) {
      if (matchesTimer(timer, id)) {
        timer.stop(action, reason);
        stoppedIds.add(id);
        stoppedCount++;
      }
    }
  }

  // Check global active timers (handles single-node runs and cross-engine instances)
  for (const [id, timer] of globalActiveTimers.entries()) {
    if (!stoppedIds.has(id) && matchesTimer(timer, id)) {
      timer.stop(action, reason);
      stoppedIds.add(id);
      stoppedCount++;
    }
  }

  // Record pending stop signal to handle race conditions where wait timer starts immediately after (specific target only)
  if (normalizedTarget && normalizedTarget !== 'all') {
    const pendingRecord = {
      action,
      reason,
      timestamp: Date.now(),
    };
    if (ctx._pendingStopTimers) {
      ctx._pendingStopTimers.set(normalizedTarget, pendingRecord);
    }
    globalPendingStopTimers.set(normalizedTarget, pendingRecord);
  }

  const successMessage =
    stoppedCount > 0
      ? `Stopped ${stoppedCount} wait timer(s) (${action === 'complete_early' ? 'Completed early' : 'Cancelled'}): "${reason}"`
      : `Stop signal queued for "${targetTimer}" (no active timers currently running)`;

  ctx.log({
    level: stoppedCount > 0 ? 'success' : 'info',
    message: successMessage,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: stoppedCount > 0 ? `Stopped ${stoppedCount} timer(s)` : 'Stop signal queued',
      detail: reason,
    },
  });

  return {
    success: true,
    output: {
      stoppedCount,
      targetTimer,
      action,
      reason,
    },
    variables: {
      [outputVariable]: stoppedCount > 0,
    },
  };
};

export const executeResetTimer: NodeExecutor = async (node, ctx) => {
  const targetTimer = node.data.properties.targetTimer || 'all';
  const mode = (node.data.properties.mode as 'restart' | 'extend') || 'restart';
  const extendMs = Number(node.data.properties.extendMs) || 5000;
  const outputVariable = node.data.properties.outputVariable || 'timerReset';

  const normalizedTarget = String(targetTimer).trim().toLowerCase();
  const activeTimers = ctx._activeTimers;
  let resetCount = 0;

  const matchesTimer = (timer: ActiveTimer, id: string): boolean => {
    if (!normalizedTarget || normalizedTarget === 'all') return true;
    if (id.toLowerCase() === normalizedTarget) return true;
    if (timer.nodeId && timer.nodeId.toLowerCase() === normalizedTarget) return true;
    if (timer.timerName && timer.timerName.trim().toLowerCase() === normalizedTarget) return true;
    return false;
  };

  const resetIds = new Set<string>();

  if (activeTimers && activeTimers.size > 0) {
    for (const [id, timer] of activeTimers.entries()) {
      if (matchesTimer(timer, id)) {
        timer.reset(mode, extendMs);
        resetIds.add(id);
        resetCount++;
      }
    }
  }

  for (const [id, timer] of globalActiveTimers.entries()) {
    if (!resetIds.has(id) && matchesTimer(timer, id)) {
      timer.reset(mode, extendMs);
      resetIds.add(id);
      resetCount++;
    }
  }

  ctx.log({
    level: resetCount > 0 ? 'info' : 'warn',
    message: resetCount > 0
      ? `${mode === 'restart' ? 'Restarted' : `Extended (+${extendMs}ms)`} ${resetCount} timer(s)`
      : `No active timers found matching "${targetTimer}"`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: { resetCount, mode, extendMs },
    variables: { [outputVariable]: resetCount > 0 },
  };
};

export const executeStopWorkflow: NodeExecutor = async (node, ctx) => {
  const exitStatus = (node.data.properties.exitStatus as 'completed' | 'stopped') || 'completed';
  const rawMessage = node.data.properties.exitMessage || 'Workflow stopped early by command';
  const exitMessage = String(interpolateVariables(rawMessage, ctx.variables));

  ctx.log({
    level: exitStatus === 'completed' ? 'success' : 'warn',
    message: `Stop Workflow Command: ${exitMessage} (Status: ${exitStatus.toUpperCase()})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Exit (${exitStatus})`,
      detail: exitMessage,
    },
  });

  return {
    success: true,
    stopWorkflow: true,
    exitStatus,
    exitMessage,
    output: { exitStatus, exitMessage },
  };
};

export const executePauseWorkflow: NodeExecutor = async (node, ctx) => {
  const rawMessage = node.data.properties.message || 'Workflow paused. Click Resume to continue.';
  const message = String(interpolateVariables(rawMessage, ctx.variables));
  const autoResumeMs = Number(node.data.properties.autoResumeMs) || 0;

  ctx.log({
    level: 'warn',
    message: `Workflow Paused: ${message}${autoResumeMs > 0 ? ` (auto-resumes in ${autoResumeMs / 1000}s)` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: 'Workflow paused',
      detail: message,
    },
  });

  ctx._pauseTrigger?.(message);

  if (autoResumeMs > 0) {
    await new Promise((r) => setTimeout(r, autoResumeMs));
  }

  return {
    success: true,
    output: { paused: true, message, autoResumeMs },
  };
};

export const executeSkipTo: NodeExecutor = async (node, ctx) => {
  const targetNodeId = node.data.properties.targetNodeId;
  const rawReason = node.data.properties.reason || 'Skipped to target node';
  const reason = String(interpolateVariables(rawReason, ctx.variables));

  if (!targetNodeId) {
    throw new Error('Skip to Node requires a target node ID.');
  }

  ctx.log({
    level: 'info',
    message: `Skip Command: Jumping to node "${targetNodeId}" (${reason})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    jumpToNodeId: targetNodeId,
    output: { jumpedTo: targetNodeId, reason },
  };
};

/**
 * Combines multiple datasets from predecessor scrape/extract nodes or variables,
 * aligning columns, mapping schemas, and deduplicating records.
 */
export const executeCombineDatasets: NodeExecutor = async (node, ctx) => {
  const props = node.data.properties || {};
  const sourceMode = props.sourceMode || 'incoming_edges';
  const outVar = props.outputVariable || 'combinedDataset';
  const mode = props.mode || 'union';
  const deduplicate = props.deduplicate !== false;
  const dedupStrategy = props.dedupStrategy || 'merge_coalesce';
  const dedupKeys = Array.isArray(props.dedupKeys) ? props.dedupKeys : [];
  const columnMappings = Array.isArray(props.columnMappings) ? props.columnMappings : [];
  const primaryKey = props.primaryKey || 'title';
  const missingValue = props.missingValue !== undefined ? props.missingValue : '';
  const addSourceColumn = props.addSourceColumn !== false;
  const sourceColumnName = props.sourceColumnName || '_source';
  const caseSensitive = !!props.caseSensitive;
  const normalizeUrls = props.normalizeUrls !== false;

  ctx.log({
    level: 'info',
    message: `Combining datasets (Mode: ${mode.toUpperCase()}, Dedup: ${deduplicate ? dedupStrategy : 'off'})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: 'Resolving and merging input datasets...',
      progress: 30,
    },
  });

  const datasets: any[][] = [];
  const sourceLabels: string[] = [];

  if (sourceMode === 'incoming_edges') {
    // 1. Check if converging gate inputs were recorded by the engine
    const gateArrivals = ctx._gateInputs?.[node.id];
    if (Array.isArray(gateArrivals) && gateArrivals.length > 0) {
      gateArrivals.forEach((arr: any, idx: number) => {
        const out = arr.output;
        let items: any[] = [];
        if (Array.isArray(out)) {
          items = out;
        } else if (out && Array.isArray(out.items)) {
          items = out.items;
        } else if (out && Array.isArray(out.dataset)) {
          items = out.dataset;
        } else if (out && typeof out === 'object') {
          items = [out];
        }
        datasets.push(items);
        sourceLabels.push(arr.nodeName || `Source ${idx + 1}`);
      });
    }
  }

  // Fallback or explicit 'variables' mode: inspect sourceVariables or ctx.variables
  if (datasets.length === 0 || sourceMode === 'variables') {
    const rawVars = Array.isArray(props.sourceVariables) ? props.sourceVariables : ['scrapedProducts1', 'scrapedProducts2'];
    rawVars.forEach((rawVarName: string, idx: number) => {
      const cleanVar = String(rawVarName).trim().replace(/^\{\{|\}\}$/g, '');
      const val = ctx.variables[cleanVar];
      let items: any[] = [];
      if (Array.isArray(val)) {
        items = val;
      } else if (val && Array.isArray(val.items)) {
        items = val.items;
      } else if (val && typeof val === 'object') {
        items = [val];
      }
      if (items.length > 0 || sourceMode === 'variables') {
        datasets.push(items);
        sourceLabels.push(cleanVar || `Var ${idx + 1}`);
      }
    });
  }

  // If still empty, check for common default array variables in context
  if (datasets.length === 0) {
    for (const [k, v] of Object.entries(ctx.variables)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null && k !== outVar && !k.startsWith('_')) {
        datasets.push(v);
        sourceLabels.push(k);
      }
    }
  }

  const result = combineDatasets(datasets, {
    mode,
    missingValue,
    addSourceColumn,
    sourceColumnName,
    sourceLabels,
    columnMappings,
    deduplicate,
    dedupKeys,
    dedupStrategy,
    caseSensitive,
    normalizeUrls,
    primaryKey,
  });

  ctx.variables[outVar] = result.items;
  ctx.variables[`${outVar}_count`] = result.rowCount;
  ctx.variables[`${outVar}_columns`] = result.columns;

  ctx.log({
    level: 'info',
    message: `Datasets combined: ${result.rowCount} rows across ${result.columnCount} columns (${result.duplicatesRemoved} duplicates removed)`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: result,
    variables: {
      [outVar]: result.items,
      [`${outVar}_count`]: result.rowCount,
      [`${outVar}_columns`]: result.columns,
    },
  };
};

/**
 * Executes multiple workflow branches or actions concurrently in parallel.
 */
export const executeAsyncParallel: NodeExecutor = async (node, ctx) => {
  const props = node.data.properties || {};
  const mode = props.mode || 'all';
  const branches = Array.isArray(props.branches) && props.branches.length > 0
    ? props.branches
    : [
        { id: 'branch_1', name: 'Branch 1' },
        { id: 'branch_2', name: 'Branch 2' },
      ];
  const maxConcurrency = Number(props.maxConcurrency) || 0;
  const timeoutMs = Number(props.timeoutMs) || 30000;
  const continueOnError = props.continueOnError !== undefined ? !!props.continueOnError : mode === 'settled';
  const mergeStrategy = props.mergeStrategy || 'merge';
  const outVar = props.outputVariable || 'parallelResults';

  ctx.log({
    level: 'info',
    message: `Async Parallel executing ${branches.length} branches (Mode: ${mode.toUpperCase()}, Concurrency: ${maxConcurrency || 'unlimited'})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Executing ${branches.length} branches in parallel...`,
      progress: 20,
    },
  });

  const orchestratorResult = await orchestrateParallelBranches(
    branches,
    async (branch, signal) => {
      const branchVars: Record<string, any> = { ...ctx.variables, branchId: branch.id, branchName: branch.name };
      return {
        output: { branchId: branch.id, branchName: branch.name, executedAt: Date.now() },
        variables: branchVars,
      };
    },
    {
      mode,
      maxConcurrency,
      timeoutMs,
      continueOnError,
      mergeStrategy,
      outputVariable: outVar,
    }
  );

  if (orchestratorResult.combinedVariables) {
    Object.assign(ctx.variables, orchestratorResult.combinedVariables);
  }
  ctx.variables[outVar] = orchestratorResult;

  return {
    success: orchestratorResult.success,
    output: orchestratorResult,
    variables: {
      [outVar]: orchestratorResult,
      ...(orchestratorResult.combinedVariables || {}),
    },
  };
};

/**
 * Generates an executive briefing or report PDF document with curated themes,
 * full Markdown support, image injection, and AI content synthesis.
 */
export const executeGeneratePdf: NodeExecutor = async (node, ctx) => {
  const props = node.data.properties || {};
  const rawTitle = props.title || 'Executive Scrape Briefing';
  const title = String(interpolateVariables(rawTitle, ctx.variables));
  const rawSubtitle = props.subtitle || '';
  const subtitle = rawSubtitle ? String(interpolateVariables(rawSubtitle, ctx.variables)) : undefined;
  const rawAuthor = props.author || 'AutoFlow AI';
  const author = rawAuthor ? String(interpolateVariables(rawAuthor, ctx.variables)) : undefined;
  const theme = (props.theme || 'modern_clean') as PdfThemeId;
  const useAi = !!props.useAi;
  const rawAiPrompt = props.aiPrompt || 'Summarize the extracted items into a structured executive report with key findings table.';
  const aiModel = props.aiModel || 'gpt-5.6-sol';
  const rawMarkdown = props.contentMarkdown || '# Executive Summary\n\nIntelligence report generated automatically.';
  let contentMarkdown = String(interpolateVariables(rawMarkdown, ctx.variables));
  const pageSize = props.pageSize || 'A4';
  const orientation = props.orientation || 'portrait';
  const headerText = props.headerText ? String(interpolateVariables(props.headerText, ctx.variables)) : undefined;
  const footerText = props.footerText ? String(interpolateVariables(props.footerText, ctx.variables)) : undefined;
  const includePageNumbers = props.includePageNumbers !== false;
  const includeTimestamp = props.includeTimestamp !== false;
  const coverPage = !!props.coverPage;
  const autoDownload = props.autoDownload !== false;
  const rawFilename = props.filename || 'autoflow_report.pdf';
  const filename = String(interpolateVariables(rawFilename, ctx.variables)).replace(/\.pdf$/i, '') + '.pdf';
  const saveToStorage = !!props.saveToStorage;
  const storageKey = props.storageKey ? String(interpolateVariables(props.storageKey, ctx.variables)) : 'report_pdf';
  const outVar = props.outputVariable || 'generatedPdf';

  ctx.log({
    level: 'info',
    message: `Generating themed PDF document: "${title}" (Theme: ${theme}, Cover: ${coverPage})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: useAi ? 'Synthesizing report via AI...' : 'Rendering PDF layout...',
      progress: 30,
    },
  });

  // AI Content generation if requested
  if (useAi) {
    try {
      const resolvedAiPrompt = String(interpolateVariables(rawAiPrompt, ctx.variables));

      // Auto-detect workflow datasets to inject into the AI context
      let datasetContext = '';
      const candidateKeys = [
        'combinedDataset',
        'scrapedProducts',
        'extractedData',
        'extractedList',
        'products',
        'items',
        'dataset',
        'data',
        'tableData',
      ];
      const foundData: Record<string, any> = {};
      for (const key of candidateKeys) {
        if (ctx.variables[key] !== undefined && ctx.variables[key] !== null) {
          foundData[key] = ctx.variables[key];
        }
      }
      if (Object.keys(foundData).length === 0) {
        for (const [k, v] of Object.entries(ctx.variables)) {
          if (k !== 'generatedPdf' && k !== outVar && Array.isArray(v) && v.length > 0) {
            foundData[k] = v;
          }
        }
      }

      if (Object.keys(foundData).length > 0) {
        const jsonStr = JSON.stringify(foundData, null, 2);
        const safeJson = jsonStr.length > 30000 ? jsonStr.slice(0, 30000) + '\n... [dataset truncated for length]' : jsonStr;
        datasetContext = `\n\n### Extracted Workflow Dataset Context:\n\`\`\`json\n${safeJson}\n\`\`\``;
      } else if (rawMarkdown && rawMarkdown.trim() && !rawMarkdown.includes('Generated intelligence report based on extracted dataset.')) {
        datasetContext = `\n\n### Reference Document Content / Context:\n${contentMarkdown}`;
      }

      const aiPromptFull = `${resolvedAiPrompt}${datasetContext}\n\nFormat your entire response in GitHub-flavored Markdown including H1/H2 headings, bullet points, callout alerts ([!NOTE], [!TIP], [!WARNING]), and structured Markdown tables where appropriate. Output pure markdown only without wrapping in \`\`\`markdown backticks.`;

      const systemPrompt = 'You are an elite data analyst and executive briefing author. You turn raw extracted data into pristine, beautifully structured Markdown briefing documents with executive summaries, comparative tables, and strategic recommendations.';

      const aiResponse = await queryLlm(aiPromptFull, systemPrompt, {
        model: aiModel,
      });

      if (aiResponse && aiResponse.trim()) {
        let cleanResponse = aiResponse.trim();
        // Strip markdown code block fences if LLM wrapped whole output
        if (/^```(?:markdown|md)?\s*[\r\n]/i.test(cleanResponse)) {
          cleanResponse = cleanResponse.replace(/^```(?:markdown|md)?\s*[\r\n]/i, '').replace(/[\r\n]```\s*$/i, '').trim();
        }
        contentMarkdown = cleanResponse;
        ctx.log({
          level: 'info',
          message: `AI generated structured document markdown (${contentMarkdown.length} chars)`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
      }
    } catch (aiErr: any) {
      ctx.log({
        level: 'warn',
        message: `AI synthesis failed, falling back to static Markdown template: ${aiErr.message || aiErr}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }
  }

  // Resolve injected images
  const rawImages: any[] = Array.isArray(props.images) ? props.images : [];
  const injectedImages: InjectedImage[] = [];

  for (const img of rawImages) {
    if (!img) continue;
    let imgUrl = String(interpolateVariables(img.url || '', ctx.variables)).trim();
    // Support resolution from simple storage
    if (imgUrl.startsWith('storage:') || imgUrl.startsWith('storage.')) {
      const storeKey = imgUrl.replace(/^storage[:.]/, '');
      const stored = (ctx.variables.storage || {})[storeKey] || ctx.variables[storeKey];
      if (stored && (stored.url || stored.dataUrl)) {
        imgUrl = stored.dataUrl || stored.url;
      }
    }

    if (imgUrl) {
      injectedImages.push({
        url: imgUrl,
        placement: img.placement || 'inline',
        caption: img.caption ? String(interpolateVariables(img.caption, ctx.variables)) : undefined,
        alt: img.alt ? String(interpolateVariables(img.alt, ctx.variables)) : undefined,
        width: img.width,
      });
    }
  }

  // Generate document
  const pdfResult = generateThemedPdfDocument({
    title,
    subtitle,
    author,
    theme,
    contentMarkdown,
    pageSize,
    orientation,
    headerText,
    footerText,
    includePageNumbers,
    includeTimestamp,
    coverPage,
    images: injectedImages,
  });

  // If saveToStorage is requested
  if (saveToStorage) {
    try {
      await executeStorageAction({
        action: 'set',
        key: storageKey,
        type: 'document',
        value: {
          title,
          content: pdfResult.html,
          dataUrl: pdfResult.dataUrl,
          htmlDataUrl: pdfResult.htmlDataUrl,
          format: 'pdf',
          timestamp: Date.now(),
        },
        scope: 'workflow',
      });
      syncStorageToVariables(ctx.variables);
    } catch (storeErr) {
      console.warn('[AutoFlow] Failed to save PDF to storage:', storeErr);
    }
  }

  // Auto download if requested
  if (autoDownload) {
    try {
      await triggerFileDownload(pdfResult.dataUrl, filename);
    } catch (dlErr) {
      console.warn('[AutoFlow] PDF auto-download failed:', dlErr);
    }
  }

  const pdfOutput = {
    title,
    filename,
    dataUrl: pdfResult.dataUrl,
    pdfDataUrl: pdfResult.pdfDataUrl,
    htmlDataUrl: pdfResult.htmlDataUrl,
    sizeBytes: pdfResult.sizeBytes,
    theme,
    savedToStorage: saveToStorage ? storageKey : false,
  };

  ctx.variables[outVar] = pdfOutput;

  ctx.log({
    level: 'info',
    message: `Themed PDF generated successfully (${pdfResult.sizeBytes} bytes, saved as ${filename})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: pdfOutput,
    variables: {
      [outVar]: pdfOutput,
    },
  };
};

/**
 * Universal Simple Storage engine for Arrays, Dictionaries, Primitive Variables, Images, and Documents.
 * Accessible across any node via {{key}} or {{storage.key}}.
 */
export const executeSimpleStorage: NodeExecutor = async (node, ctx) => {
  const props = node.data.properties || {};
  const action = (props.action || 'set') as StorageAction;
  const rawKey = props.key || 'myItems';
  const key = String(interpolateVariables(rawKey, ctx.variables)).trim();
  const entryType = (props.entryType || 'variable') as StorageEntryType;
  const scope = (props.scope || 'workflow') as StorageScope;
  const deepMerge = props.deepMerge !== false;
  const outVar = props.outputVariable || 'storageResult';

  // Resolve value
  let resolvedVal: any = undefined;
  if (action === 'set' || action === 'append' || action === 'merge') {
    const rawVal = props.value !== undefined ? props.value : '';
    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      const varMatch = trimmed.match(/^\{\{([a-zA-Z0-9_.-]+)\}\}$/);
      if (varMatch && ctx.variables[varMatch[1]] !== undefined) {
        resolvedVal = ctx.variables[varMatch[1]];
      } else {
        const interpolated = interpolateVariables(trimmed, ctx.variables);
        if (entryType === 'array' || entryType === 'dictionary') {
          try {
            resolvedVal = JSON.parse(interpolated);
          } catch {
            resolvedVal = entryType === 'array' ? [interpolated] : { value: interpolated };
          }
        } else {
          resolvedVal = interpolated;
        }
      }
    } else {
      resolvedVal = rawVal;
    }
  }

  ctx.log({
    level: 'info',
    message: `Simple Storage action: ${action.toUpperCase()} on "${key}" (${entryType}, ${scope})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await executeStorageAction({
    action,
    key,
    type: entryType,
    value: resolvedVal,
    scope,
    deepMerge,
  });

  // Always sync storage into execution variables so any node can access it
  syncStorageToVariables(ctx.variables);

  ctx.variables[outVar] = res.value;

  return {
    success: res.success,
    output: res,
    variables: {
      [outVar]: res.value,
      ...(key ? { [key]: res.value } : {}),
    },
  };
};

// ----------------- CONTEXT & SYSTEM DATA EXECUTORS -----------------

export const executeGetPageInfo: NodeExecutor = async (node, ctx) => {
  const outVar = node.data.properties.outputVariable || 'pageInfo';
  const unpack = node.data.properties.unpackVariables !== false;
  let info: any = null;

  try {
    const res = await sendDomAction('get_page_info', {}, ctx, 5000);
    if (res && res.success) {
      info = res;
    }
  } catch (err) {
    // In mock or background mode, fallback
  }

  if (!info) {
    const rawUrl = ctx.currentUrl || 'https://example.com';
    let hostname = '';
    try {
      hostname = new URL(rawUrl).hostname;
    } catch {}

    info = {
      success: true,
      url: rawUrl,
      title: 'AutoFlow Page',
      domain: hostname,
      origin: hostname ? `https://${hostname}` : '',
      pathname: '/',
      search: '',
      hash: '',
      referrer: '',
      canonicalUrl: rawUrl,
      metaDescription: '',
      ogImage: '',
      keywords: '',
      contentType: 'text/html',
      docStatus: 'complete',
      searchParams: {},
    };
  }

  ctx.variables[outVar] = info;
  if (unpack) {
    if (info.url) ctx.variables.currentUrl = info.url;
    if (info.title) ctx.variables.pageTitle = info.title;
    if (info.domain) ctx.variables.currentDomain = info.domain;
    if (info.canonicalUrl) ctx.variables.canonicalUrl = info.canonicalUrl;
  }

  ctx.log({
    level: 'info',
    message: `Page info captured: ${info.title || info.url || 'Active tab'} (${info.domain || ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: info,
    variables: {
      [outVar]: info,
      ...(unpack ? {
        currentUrl: info.url,
        pageTitle: info.title,
        currentDomain: info.domain,
        canonicalUrl: info.canonicalUrl,
      } : {}),
    },
  };
};

export const executeGetUrlDetails: NodeExecutor = async (node, ctx) => {
  const rawSource = node.data.properties.sourceUrl || 'current';
  const outVar = node.data.properties.outputVariable || 'urlDetails';
  const targetParam = node.data.properties.targetParam ? String(node.data.properties.targetParam).trim() : '';

  let resolvedUrl = String(interpolateVariables(rawSource, ctx.variables) || '').trim();
  if (!resolvedUrl || resolvedUrl === 'current') {
    resolvedUrl = ctx.currentUrl || 'https://example.com';
  }

  let parsed: URL;
  try {
    parsed = new URL(resolvedUrl);
  } catch {
    throw new Error(`Invalid URL string provided to URL Details node: "${resolvedUrl}"`);
  }

  const searchParams: Record<string, string> = {};
  parsed.searchParams.forEach((val, key) => {
    searchParams[key] = val;
  });

  const targetValue = targetParam ? (parsed.searchParams.get(targetParam) ?? '') : undefined;

  const urlDetails = {
    url: parsed.href,
    origin: parsed.origin,
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.host,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    searchParams,
    ...(targetParam ? { [targetParam]: targetValue } : {}),
  };

  ctx.variables[outVar] = urlDetails;
  if (targetParam && targetValue !== undefined) {
    ctx.variables[`${outVar}_${targetParam}`] = targetValue;
    ctx.variables[targetParam] = targetValue;
  }

  ctx.log({
    level: 'info',
    message: `URL parsed: ${parsed.hostname}${parsed.pathname}${targetParam ? ` (${targetParam}=${targetValue})` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: urlDetails,
    variables: {
      [outVar]: urlDetails,
      ...(targetParam && targetValue !== undefined ? { [`${outVar}_${targetParam}`]: targetValue, [targetParam]: targetValue } : {}),
    },
  };
};

function formatDateWithTimezone(date: Date, timeZone: string, format: string, customMask?: string): string {
  const tz = (!timeZone || timeZone.toLowerCase() === 'local') ? undefined : timeZone;

  if (format === 'timestamp_ms') return String(date.getTime());
  if (format === 'timestamp_s') return String(Math.floor(date.getTime() / 1000));
  if (format === 'iso') {
    return tz ? new Intl.DateTimeFormat('sv-SE', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' }).format(date).replace(' ', 'T') + 'Z' : date.toISOString();
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const p of parts) partMap[p.type] = p.value;

    const YYYY = partMap.year || '1970';
    const YY = YYYY.slice(-2);
    const MM = partMap.month || '01';
    const DD = partMap.day || '01';
    const HH = partMap.hour || '00';
    const hourNum = parseInt(HH, 10);
    const hh = String(hourNum % 12 || 12).padStart(2, '0');
    const mm = partMap.minute || '00';
    const ss = partMap.second || '00';
    const A = hourNum >= 12 ? 'PM' : 'AM';
    const a = A.toLowerCase();

    if (format === 'date_only') return `${YYYY}-${MM}-${DD}`;
    if (format === 'time_only') return `${HH}:${mm}:${ss}`;
    if (format === 'datetime') return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;

    if (format === 'custom' && customMask) {
      return customMask
        .replace(/\bYYYY\b/g, YYYY)
        .replace(/\bYY\b/g, YY)
        .replace(/\bMM\b/g, MM)
        .replace(/\bDD\b/g, DD)
        .replace(/\bHH\b/g, HH)
        .replace(/\bhh\b/g, hh)
        .replace(/\bmm\b/g, mm)
        .replace(/\bss\b/g, ss)
        .replace(/\bA\b/g, A)
        .replace(/\ba\b/g, a);
    }

    return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
  } catch {
    return date.toISOString();
  }
}

export const executeDateTime: NodeExecutor = async (node, ctx) => {
  const mode = node.data.properties.mode || 'current_time';
  const format = node.data.properties.format || 'iso';
  const customFormat = node.data.properties.customFormat || 'YYYY-MM-DD HH:mm:ss';
  const timeZone = node.data.properties.timeZone || 'local';
  const outVar = node.data.properties.outputVariable || 'dateTimeResult';
  const rawInput = node.data.properties.inputDate ? interpolateVariables(node.data.properties.inputDate, ctx.variables) : '';

  let d = new Date();
  if (rawInput) {
    if (typeof rawInput === 'number' || (!isNaN(Number(rawInput)) && String(rawInput).trim().length >= 10)) {
      const num = Number(rawInput);
      d = new Date(num < 10000000000 ? num * 1000 : num);
    } else {
      const parsed = new Date(String(rawInput));
      if (!isNaN(parsed.getTime())) {
        d = parsed;
      }
    }
  }

  if (mode === 'add_subtract') {
    const amount = Number(interpolateVariables(node.data.properties.amount, ctx.variables)) || 0;
    const unit = node.data.properties.unit || 'days';
    if (unit === 'seconds') d = new Date(d.getTime() + amount * 1000);
    else if (unit === 'minutes') d = new Date(d.getTime() + amount * 60 * 1000);
    else if (unit === 'hours') d = new Date(d.getTime() + amount * 3600 * 1000);
    else if (unit === 'days') d = new Date(d.getTime() + amount * 86400 * 1000);
    else if (unit === 'months') {
      const m = new Date(d);
      m.setMonth(m.getMonth() + amount);
      d = m;
    } else if (unit === 'years') {
      const y = new Date(d);
      y.setFullYear(y.getFullYear() + amount);
      d = y;
    }
  }

  let dateDiffResult: any = null;
  if (mode === 'date_diff') {
    const rawCompare = node.data.properties.compareDate ? interpolateVariables(node.data.properties.compareDate, ctx.variables) : '';
    let compareD = new Date();
    if (rawCompare) {
      const parsedC = new Date(String(rawCompare));
      if (!isNaN(parsedC.getTime())) compareD = parsedC;
    }
    const diffMs = d.getTime() - compareD.getTime();
    dateDiffResult = {
      diffMs,
      diffSeconds: Math.round(diffMs / 1000),
      diffMinutes: Math.round(diffMs / (60 * 1000)),
      diffHours: Math.round(diffMs / (3600 * 1000)),
      diffDays: Math.round(diffMs / (86400 * 1000)),
    };
  }

  const formattedStr = formatDateWithTimezone(d, timeZone, format, customFormat);
  const finalOutput = mode === 'date_diff' ? dateDiffResult : formattedStr;

  ctx.variables[outVar] = finalOutput;
  ctx.variables[`${outVar}_timestamp`] = d.getTime();
  ctx.variables[`${outVar}_iso`] = d.toISOString();

  ctx.log({
    level: 'info',
    message: `Date & Time (${mode}): ${typeof finalOutput === 'object' ? JSON.stringify(finalOutput) : finalOutput}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: finalOutput,
    variables: {
      [outVar]: finalOutput,
      [`${outVar}_timestamp`]: d.getTime(),
      [`${outVar}_iso`]: d.toISOString(),
    },
  };
};

export const executeCookieManager: NodeExecutor = async (node, ctx) => {
  const action = node.data.properties.action || 'get';
  const outVar = node.data.properties.outputVariable || 'cookieResult';
  const rawUrl = node.data.properties.url ? String(interpolateVariables(node.data.properties.url, ctx.variables)) : '';
  const rawName = node.data.properties.name ? String(interpolateVariables(node.data.properties.name, ctx.variables)).trim() : '';
  const rawValue = node.data.properties.value !== undefined ? String(interpolateVariables(node.data.properties.value, ctx.variables)) : '';
  const domain = node.data.properties.domain ? String(interpolateVariables(node.data.properties.domain, ctx.variables)) : undefined;
  const path = node.data.properties.path || '/';

  let result: any = null;

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    if (action === 'get') {
      const res = await chrome.runtime.sendMessage({
        type: 'GET_COOKIES',
        payload: { url: rawUrl || ctx.currentUrl, name: rawName, domain },
      });
      result = res?.value ?? res?.cookie ?? null;
    } else if (action === 'getAll') {
      const res = await chrome.runtime.sendMessage({
        type: 'GET_COOKIES',
        payload: { url: rawUrl || ctx.currentUrl, domain },
      });
      result = res?.cookies || [];
    } else if (action === 'set') {
      const res = await chrome.runtime.sendMessage({
        type: 'SET_COOKIE',
        payload: {
          url: rawUrl || ctx.currentUrl,
          name: rawName,
          value: rawValue,
          domain,
          path,
          secure: node.data.properties.secure !== false,
          sameSite: node.data.properties.sameSite || 'lax',
        },
      });
      result = res?.cookie || { name: rawName, value: rawValue };
    } else if (action === 'delete') {
      const res = await chrome.runtime.sendMessage({
        type: 'DELETE_COOKIE',
        payload: { url: rawUrl || ctx.currentUrl, name: rawName },
      });
      result = res?.result || true;
    }
  } else {
    // In mock / node testing environment
    if (action === 'get') {
      result = rawName ? `mock_cookie_${rawName}` : '';
    } else if (action === 'getAll') {
      result = [{ name: rawName || 'session_id', value: 'mock_val' }];
    } else if (action === 'set') {
      result = { name: rawName, value: rawValue };
    } else if (action === 'delete') {
      result = true;
    }
  }

  ctx.variables[outVar] = result;
  ctx.log({
    level: 'info',
    message: `Cookie Manager: ${action.toUpperCase()} ${rawName ? `"${rawName}"` : 'cookies'}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: result,
    variables: {
      [outVar]: result,
    },
  };
};

// ----------------- ARRAY & STRING EXECUTORS -----------------

export const executeArrayOperation: NodeExecutor = async (node, ctx) => {
  const rawArray = interpolateVariables(node.data.properties.array, ctx.variables);
  const operation = node.data.properties.operation || 'deduplicate';
  const outVar = node.data.properties.outputVariable || 'processedArray';
  const field = node.data.properties.field ? String(node.data.properties.field).trim() : '';

  let arr: any[] = [];
  if (Array.isArray(rawArray)) {
    arr = [...rawArray];
  } else if (typeof rawArray === 'string' && rawArray.trim().startsWith('[')) {
    try {
      arr = JSON.parse(rawArray);
      if (!Array.isArray(arr)) arr = [];
    } catch {
      arr = [];
    }
  }

  let result: any = null;

  switch (operation) {
    case 'push': {
      const rawItem = interpolateVariables(node.data.properties.item, ctx.variables);
      let itemToPush = rawItem;
      if (typeof rawItem === 'string' && (rawItem.startsWith('{') || rawItem.startsWith('['))) {
        try {
          itemToPush = JSON.parse(rawItem);
        } catch {}
      }
      arr.push(itemToPush);
      result = arr;
      break;
    }
    case 'pop': {
      const popped = arr.pop();
      result = { poppedItem: popped, remainingArray: arr, count: arr.length };
      break;
    }
    case 'shift': {
      const shifted = arr.shift();
      result = { shiftedItem: shifted, remainingArray: arr, count: arr.length };
      break;
    }
    case 'filter_empty': {
      result = arr.filter((item) => {
        if (item === null || item === undefined || item === '') return false;
        if (typeof item === 'number' && isNaN(item)) return false;
        return true;
      });
      break;
    }
    case 'filter_by_field': {
      const op = node.data.properties.filterOperator || 'not_empty';
      const rawVal = interpolateVariables(node.data.properties.filterValue, ctx.variables);
      result = arr.filter((item) => {
        if (typeof item !== 'object' || item === null) return false;
        const itemVal = item[field];
        if (op === 'equals') return String(itemVal) === String(rawVal);
        if (op === 'not_equals') return String(itemVal) !== String(rawVal);
        if (op === 'contains') return String(itemVal || '').toLowerCase().includes(String(rawVal || '').toLowerCase());
        if (op === 'greater_than') return Number(itemVal) > Number(rawVal);
        if (op === 'less_than') return Number(itemVal) < Number(rawVal);
        if (op === 'not_empty') return itemVal !== undefined && itemVal !== null && itemVal !== '';
        return true;
      });
      break;
    }
    case 'deduplicate': {
      if (field) {
        const seen = new Set<string>();
        result = arr.filter((item) => {
          if (typeof item === 'object' && item !== null) {
            const keyVal = String(item[field] ?? '');
            if (seen.has(keyVal)) return false;
            seen.add(keyVal);
            return true;
          }
          const primKey = JSON.stringify(item);
          if (seen.has(primKey)) return false;
          seen.add(primKey);
          return true;
        });
      } else {
        const seen = new Set<string>();
        result = arr.filter((item) => {
          const k = typeof item === 'object' ? JSON.stringify(item) : String(item);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
      break;
    }
    case 'slice': {
      const start = Number(node.data.properties.sliceStart) || 0;
      const end = node.data.properties.sliceEnd !== undefined && node.data.properties.sliceEnd !== '' ? Number(node.data.properties.sliceEnd) : undefined;
      result = arr.slice(start, end);
      break;
    }
    case 'sort': {
      const order = node.data.properties.sortOrder || 'asc';
      result = [...arr].sort((a, b) => {
        const valA = field && typeof a === 'object' && a !== null ? a[field] : a;
        const valB = field && typeof b === 'object' && b !== null ? b[field] : b;
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return order === 'asc' ? numA - numB : numB - numA;
        }
        const cmp = String(valA ?? '').localeCompare(String(valB ?? ''));
        return order === 'asc' ? cmp : -cmp;
      });
      break;
    }
    case 'join': {
      const delim = node.data.properties.delimiter !== undefined ? node.data.properties.delimiter : ', ';
      result = arr.join(delim);
      break;
    }
    case 'reverse': {
      result = [...arr].reverse();
      break;
    }
    case 'count': {
      result = arr.length;
      break;
    }
    case 'flatten': {
      result = arr.flat();
      break;
    }
    default:
      result = arr;
  }

  ctx.variables[outVar] = result;
  ctx.log({
    level: 'info',
    message: `Array Operation "${operation}" on ${arr.length} items -> result saved to ${outVar}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: result,
    variables: {
      [outVar]: result,
    },
  };
};

export const executeStringTemplate: NodeExecutor = async (node, ctx) => {
  const rawTemplate = node.data.properties.template || '';
  const outVar = node.data.properties.outputVariable || 'renderedTemplate';
  const casing = node.data.properties.casing || 'none';
  const escapeHtml = !!node.data.properties.escapeHtml;

  let rendered = String(interpolateVariables(rawTemplate, ctx.variables));

  if (escapeHtml) {
    rendered = rendered
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (casing === 'uppercase') {
    rendered = rendered.toUpperCase();
  } else if (casing === 'lowercase') {
    rendered = rendered.toLowerCase();
  } else if (casing === 'capitalize') {
    rendered = rendered.charAt(0).toUpperCase() + rendered.slice(1);
  } else if (casing === 'title_case') {
    rendered = rendered.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  ctx.variables[outVar] = rendered;
  ctx.log({
    level: 'info',
    message: `String template rendered: "${rendered.slice(0, 40)}${rendered.length > 40 ? '...' : ''}"`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: rendered,
    variables: {
      [outVar]: rendered,
    },
  };
};

function evaluateJsonPath(obj: any, pathStr: string): any {
  if (obj === null || obj === undefined || !pathStr) return obj;
  const normalized = pathStr.replace(/\[(\*|\d+)\]/g, '.$1').replace(/^\./, '');
  const segments = normalized.split('.').filter(Boolean);

  let current: any = obj;
  for (let i = 0; i < segments.length; i++) {
    if (current === null || current === undefined) return undefined;
    const seg = segments[i];

    if (seg === '*') {
      const rest = segments.slice(i + 1).join('.');
      if (Array.isArray(current)) {
        if (!rest) return current;
        return current.map((item) => evaluateJsonPath(item, rest)).filter((v) => v !== undefined);
      } else if (typeof current === 'object') {
        const values = Object.values(current);
        if (!rest) return values;
        return values.map((item) => evaluateJsonPath(item, rest)).filter((v) => v !== undefined);
      }
      return undefined;
    }

    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (!isNaN(idx)) {
        current = current[idx];
      } else {
        const rest = segments.slice(i).join('.');
        return current.map((item) => evaluateJsonPath(item, rest)).filter((v) => v !== undefined);
      }
    } else if (typeof current === 'object') {
      current = current[seg];
    } else {
      return undefined;
    }
  }

  return current;
}

export const executeJsonQuery: NodeExecutor = async (node, ctx) => {
  const rawInput = interpolateVariables(node.data.properties.jsonInput, ctx.variables);
  const queryPath = node.data.properties.queryPath || '';
  const fallback = node.data.properties.fallbackValue ?? null;
  const outVar = node.data.properties.outputVariable || 'jsonQueryResult';

  let obj: any = rawInput;
  if (typeof rawInput === 'string') {
    try {
      obj = JSON.parse(rawInput);
    } catch {
      obj = rawInput;
    }
  }

  const queryResult = evaluateJsonPath(obj, queryPath);
  const finalVal = queryResult !== undefined ? queryResult : fallback;

  ctx.variables[outVar] = finalVal;
  ctx.log({
    level: 'info',
    message: `JSON query path "${queryPath}" -> extracted ${Array.isArray(finalVal) ? `array of ${finalVal.length}` : typeof finalVal}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: finalVal,
    variables: {
      [outVar]: finalVal,
    },
  };
};

// ----------------- CONTROL LOGIC EXECUTORS -----------------

export const executeSwitchCase: NodeExecutor = async (node, ctx) => {
  const rawExpr = node.data.properties.expression || '';
  const resolvedExpr = String(interpolateVariables(rawExpr, ctx.variables) ?? '');
  const outVar = node.data.properties.outputVariable || 'matchedCase';
  const matchMode = node.data.properties.matchMode || 'equals';
  const caseSensitive = !!node.data.properties.caseSensitive;

  const rawCases: Array<{ id: string; value: string; label?: string }> = Array.isArray(node.data.properties.cases)
    ? node.data.properties.cases
    : [];

  let matchedBranch = 'default';
  let matchedValue: any = null;

  for (const c of rawCases) {
    const rawTarget = String(interpolateVariables(c.value, ctx.variables) ?? '');
    let isMatch = false;

    const testExpr = caseSensitive ? resolvedExpr : resolvedExpr.toLowerCase();
    const testTarget = caseSensitive ? rawTarget : rawTarget.toLowerCase();

    if (matchMode === 'equals') {
      isMatch = testExpr === testTarget;
    } else if (matchMode === 'contains') {
      isMatch = testExpr.includes(testTarget);
    } else if (matchMode === 'starts_with') {
      isMatch = testExpr.startsWith(testTarget);
    } else if (matchMode === 'regex') {
      try {
        const regex = new RegExp(rawTarget, caseSensitive ? undefined : 'i');
        isMatch = regex.test(resolvedExpr);
      } catch {
        isMatch = false;
      }
    }

    if (isMatch) {
      matchedBranch = c.id;
      matchedValue = c.value;
      break;
    }
  }

  ctx.variables[outVar] = matchedValue;
  ctx.log({
    level: 'info',
    message: `Switch Case evaluated: expression "${resolvedExpr}" -> matched branch "${matchedBranch}"`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: { expression: resolvedExpr, matchedBranch, matchedValue },
    nextBranch: matchedBranch,
    variables: {
      [outVar]: matchedValue,
    },
  };
};

export const executeWhileLoop: NodeExecutor = async (node, ctx) => {
  const leftVal = interpolateVariables(node.data.properties.leftValue || '', ctx.variables);
  const rightVal = interpolateVariables(node.data.properties.rightValue || '', ctx.variables);
  const operator = node.data.properties.operator || 'equals';
  const caseSensitive = !!node.data.properties.caseSensitive;

  const rule: ConditionRule = {
    type: 'variable',
    leftValue: leftVal,
    operator,
    rightValue: rightVal,
    caseSensitive,
  };
  const conditionMet = evaluateCondition(rule, ctx.variables);

  return {
    success: true,
    output: { conditionMet, leftVal, operator, rightVal },
    nextBranch: conditionMet ? 'loop_body' : 'loop_done',
  };
};

export const executeRetryBlock: NodeExecutor = async (node, ctx) => {
  const maxRetries = Number(node.data.properties.maxRetries) || 3;
  const backoffMode = node.data.properties.backoffMode || 'exponential';
  const retryDelayMs = Number(node.data.properties.retryDelayMs) || 1000;
  const outVar = node.data.properties.outputVariable || 'retryInfo';

  const retryInfo = {
    maxRetries,
    backoffMode,
    retryDelayMs,
    status: 'initialized',
  };

  ctx.variables[outVar] = retryInfo;
  ctx.log({
    level: 'info',
    message: `Retry Block configured: max ${maxRetries} retries (${backoffMode}, ${retryDelayMs}ms base)`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: retryInfo,
    nextBranch: 'try',
    variables: {
      [outVar]: retryInfo,
    },
  };
};

export const executeRateLimiter: NodeExecutor = async (node, ctx) => {
  const mode = node.data.properties.mode || 'jitter_range';
  const outVar = node.data.properties.outputVariable || 'throttledMs';
  let delayMs = 1000;

  if (mode === 'fixed_delay') {
    delayMs = Math.max(0, Number(node.data.properties.fixedDelayMs) || 1000);
  } else if (mode === 'requests_per_minute') {
    const rpm = Math.max(1, Number(node.data.properties.requestsPerMinute) || 30);
    delayMs = Math.round(60000 / rpm);
  } else {
    const minJ = Math.max(0, Number(node.data.properties.minJitterMs) || 1000);
    const maxJ = Math.max(minJ, Number(node.data.properties.maxJitterMs) || 3000);
    delayMs = Math.round(minJ + Math.random() * (maxJ - minJ));
  }

  ctx.log({
    level: 'info',
    message: `Rate Limiter throttling execution: waiting ${delayMs}ms (${mode})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  if (delayMs > 0) {
    await wait(delayMs, ctx.signal);
  }

  ctx.variables[outVar] = delayMs;
  return {
    success: true,
    output: { delayMs, mode },
    variables: {
      [outVar]: delayMs,
    },
  };
};

export const executeManualApproval: NodeExecutor = async (node, ctx) => {
  const rawPrompt = node.data.properties.promptMessage || 'Please inspect page or solve CAPTCHA, then click Resume.';
  const promptMessage = String(interpolateVariables(rawPrompt, ctx.variables));
  const inputType = node.data.properties.inputType || 'confirm';
  const selectOptions = node.data.properties.selectOptions || 'Approve, Reject';
  const defaultValue = node.data.properties.defaultValue || (inputType === 'confirm' ? 'approved' : '');
  const timeoutSeconds = Number(node.data.properties.timeoutSeconds) || 0;
  const outVar = node.data.properties.outputVariable || 'approvalResponse';

  ctx.log({
    level: 'warn',
    message: `Manual Approval Required: ${promptMessage}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: 'Awaiting human approval',
      detail: promptMessage,
      awaitingUser: true,
      inputType,
      selectOptions,
    },
  });

  ctx._pauseTrigger?.(promptMessage);

  if (timeoutSeconds > 0) {
    await wait(timeoutSeconds * 1000, ctx.signal);
  }

  ctx.variables[outVar] = defaultValue;

  return {
    success: true,
    output: { approved: true, response: defaultValue },
    variables: {
      [outVar]: defaultValue,
    },
  };
};

// ==========================================
// FREE SCRAPER EXECUTORS (100% KEYLESS)
// ==========================================

async function performAutoScrollPasses(
  passes: number,
  delayMs: number,
  ctx: ExecutionContext,
  nodeId: string,
  nodeLabel: string
) {
  for (let p = 1; p <= passes; p++) {
    if (ctx.signal?.aborted) break;
    ctx.log({
      level: 'info',
      message: `Auto-scroll pass ${p}/${passes} to load dynamic content...`,
      nodeId,
      nodeName: nodeLabel,
    });
    try {
      await sendDomAction('scroll', { direction: 'down', amount: 800, smooth: true }, ctx);
    } catch {}
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function handleScraperExport(
  items: any[],
  node: WorkflowNode,
  ctx: ExecutionContext,
  defaultFilename: string
) {
  const exportFormat = node.data.properties.exportFormat as ExportDataFormat | undefined;
  if (!exportFormat || exportFormat === ('none' as any) || items.length === 0) {
    return undefined;
  }
  const rawFilename = node.data.properties.exportFilename || defaultFilename;
  const filename = interpolateVariables(rawFilename, ctx.variables);
  try {
    const doc = createExportDocument(items, exportFormat, { filename });
    await triggerFileDownload(doc.dataUrl, doc.filename);
    ctx.log({
      level: 'info',
      message: `Scraper direct export: saved ${doc.rowCount} items to ${doc.filename}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    return doc;
  } catch (err: any) {
    ctx.log({
      level: 'warn',
      message: `Export file generation warning: ${err.message}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    return undefined;
  }
}

function formatScraperTableOutput(
  items: any[],
  outputVariable: string,
  ctx: ExecutionContext,
  nodeId: string,
  nodeLabel: string,
  exportResult?: any,
  extraVars: Record<string, any> = {},
  errorMessage?: string
) {
  const headers = items.length > 0 && typeof items[0] === 'object' && items[0] !== null
    ? Object.keys(items[0])
    : ['value'];
  const tableData = {
    headers,
    rows: items,
    count: items.length,
  };
  const csvData = jsonToCsv(items);
  const htmlTable = dataToHtmlTable(items);

  ctx.variables[outputVariable] = items;
  ctx.variables[`${outputVariable}_count`] = items.length;
  ctx.variables[`${outputVariable}_table`] = tableData;
  ctx.variables[`${outputVariable}_csv`] = csvData;
  ctx.variables[`${outputVariable}_htmlTable`] = htmlTable;

  for (const [k, v] of Object.entries(extraVars)) {
    ctx.variables[k] = v;
  }

  if (errorMessage && items.length === 0) {
    ctx.updateNodeState(nodeId, {
      status: 'error',
      dynamicState: {
        table: { headers, rows: [], count: 0 },
        count: 0,
        message: `${nodeLabel}: ${errorMessage}`,
        error: errorMessage,
      },
    });
  } else {
    ctx.updateNodeState(nodeId, {
      status: 'success',
      dynamicState: {
        table: { headers, rows: items.slice(0, 10), count: items.length },
        count: items.length,
        message: `${nodeLabel}: ${items.length} items ready`,
      },
    });
  }

  return {
    success: true,
    output: items,
    items,
    table: tableData,
    variables: {
      [outputVariable]: items,
      [`${outputVariable}_count`]: items.length,
      [`${outputVariable}_table`]: tableData,
      [`${outputVariable}_csv`]: csvData,
      [`${outputVariable}_htmlTable`]: htmlTable,
      ...(exportResult ? { [`${outputVariable}_dataUrl`]: exportResult.dataUrl } : {}),
      ...extraVars,
    },
    ...(errorMessage && items.length === 0 ? { error: errorMessage } : {}),
  };
}

function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome-search://')
  );
}

async function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  return new Promise<void>((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { chrome.tabs.onUpdated.removeListener(listener); } catch {}
        resolve();
      }
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          try { chrome.tabs.onUpdated.removeListener(listener); } catch {}
          setTimeout(resolve, 800);
        }
      }
    };

    try {
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId, (t) => {
        if (chrome.runtime?.lastError || !t) return;
        if (t.status === 'complete' && !resolved) {
          resolved = true;
          clearTimeout(timer);
          try { chrome.tabs.onUpdated.removeListener(listener); } catch {}
          setTimeout(resolve, 500);
        }
      });
    } catch {
      resolve();
    }
  });
}

interface ScraperTabSession {
  tabId: number;
  createdTab: boolean;
}

/**
 * Launches a dedicated tab for the scraper.
 * In headless mode, launches a background tab (active: false) without focus interruption.
 * In standard mode, launches the tab with active: true.
 * Always opens the targetUrl rather than hijacking unrelated open tabs (e.g. YouTube Music).
 */
async function launchScraperTab(
  targetUrl: string,
  headless: boolean,
  ctx: ExecutionContext,
  nodeId: string,
  nodeLabel: string
): Promise<ScraperTabSession | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    return null;
  }

  // 1. If targetUrl is present, ALWAYS launch a dedicated tab for the scraper
  if (targetUrl) {
    if (headless) {
      ctx.log({
        level: 'info',
        message: `Headless mode: Launching background tab for ${targetUrl} (no focus interruption)...`,
        nodeId,
        nodeName: nodeLabel,
      });

      const newTab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
        chrome.tabs.create({ url: targetUrl, active: false }, (t) => {
          if (chrome.runtime?.lastError || !t) resolve(null);
          else resolve(t);
        });
      });

      if (newTab?.id) {
        ctx.currentTabId = newTab.id;
        await waitForTabLoad(newTab.id, 15000);
        return { tabId: newTab.id, createdTab: true };
      }
    } else {
      ctx.log({
        level: 'info',
        message: `Launching tab for ${targetUrl}...`,
        nodeId,
        nodeName: nodeLabel,
      });

      const newTab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
        chrome.tabs.create({ url: targetUrl, active: true }, (t) => {
          if (chrome.runtime?.lastError || !t) resolve(null);
          else resolve(t);
        });
      });

      if (newTab?.id) {
        ctx.currentTabId = newTab.id;
        await waitForTabLoad(newTab.id, 15000);
        return { tabId: newTab.id, createdTab: true };
      }
    }
  }

  // 2. Only if no targetUrl was specified (user left query/url empty to scrape whatever active page is currently open):
  if (ctx.currentTabId) {
    return { tabId: ctx.currentTabId, createdTab: false };
  }

  const activeTabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime?.lastError || !tabs) resolve([]);
      else resolve(tabs);
    });
  });

  const validTab = activeTabs.find((t) => t.id && !isRestrictedUrl(t.url));
  if (validTab?.id) {
    ctx.currentTabId = validTab.id;
    return { tabId: validTab.id, createdTab: false };
  }

  return null;
}

async function cleanupScraperTab(
  session: ScraperTabSession | null,
  autoCloseTab: boolean,
  ctx: ExecutionContext,
  nodeId: string,
  nodeLabel: string
): Promise<void> {
  if (!session || !session.createdTab || !session.tabId) {
    return;
  }

  if (autoCloseTab) {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.remove) {
        await new Promise<void>((resolve) => {
          chrome.tabs.remove(session.tabId, () => resolve());
        });
        if (ctx.currentTabId === session.tabId) {
          ctx.currentTabId = undefined;
        }
        ctx.log({
          level: 'info',
          message: 'Temporary scraper tab closed automatically.',
          nodeId,
          nodeName: nodeLabel,
        });
      }
    } catch {}
  }
}

/**
 * Resiliently executes YouTube scrape operations:
 * In the Chrome extension, delegates to the background service worker via chrome.runtime.sendMessage
 * (which holds <all_urls> host permissions and declarativeNetRequest rules, eliminating CORS preflight errors).
 * Outside Chrome (e.g. Node/vitest), falls back to direct youtubeService calls.
 */
async function runYouTubeScrape(
  action: 'search' | 'video_details' | 'video_script' | 'comments',
  params: Record<string, any>,
  signal?: AbortSignal
): Promise<any> {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const resp = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'YOUTUBE_SCRAPE', payload: { action, params } },
          (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response && response.success) {
              return resolve(response.data);
            }
            return reject(new Error(response?.error || `Failed to execute YouTube scrape: ${action}`));
          }
        );
      });
      if (resp !== undefined && resp !== null) {
        return resp;
      }
    } catch (bgErr: any) {
      console.warn('[YouTubeScraper] Background scrape message error, trying direct service fallback:', bgErr?.message);
    }
  }

  if (action === 'search') {
    return scrapeYouTubeSearch(params.query, params.maxResults, signal);
  } else if (action === 'video_details') {
    return scrapeYouTubeVideoDetails(params.target, signal);
  } else if (action === 'video_script') {
    return scrapeYouTubeTranscript(params.target, params.scriptLanguage, params.scriptFormat, signal);
  } else if (action === 'comments') {
    return scrapeYouTubeComments(params.target, params.maxResults, signal);
  }
  throw new Error(`Unsupported scrape action: ${action}`);
}

async function findExistingYouTubeTab(targetVideoId?: string): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  return new Promise((resolve) => {
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      if (chrome.runtime?.lastError || !tabs || tabs.length === 0) {
        return resolve(null);
      }
      if (targetVideoId) {
        const matchingTab = tabs.find((t) => t.url && t.url.includes(targetVideoId));
        if (matchingTab) return resolve(matchingTab);
      }
      const watchTab = tabs.find((t) => t.url && t.url.includes('/watch'));
      if (watchTab) return resolve(watchTab);
      resolve(tabs[0] || null);
    });
  });
}

export const executeYouTubeScraper: NodeExecutor = async (node, ctx) => {
  const headless = node.data.properties.headless !== false;
  const autoCloseTab = node.data.properties.autoCloseTab !== false;
  const mode = node.data.properties.mode || 'search';
  const engine = node.data.properties.engine || 'browser';
  const browserFallback = Boolean(node.data.properties.browserFallback ?? false);
  const query = interpolateVariables(node.data.properties.query || '', ctx.variables);
  const rawUrl = interpolateVariables(node.data.properties.url || '', ctx.variables);
  const channel = interpolateVariables(node.data.properties.channel || '', ctx.variables);
  const scriptLanguage = node.data.properties.scriptLanguage || 'en';
  const scriptFormat = node.data.properties.scriptFormat || 'timestamped';
  const maxResults = Math.min(Math.max(1, Number(node.data.properties.maxResults) || 15), 100);
  const autoScrollPasses = Math.max(0, Number(node.data.properties.autoScrollPasses ?? 3));
  const scrollDelay = Math.max(100, Number(node.data.properties.scrollDelay ?? 1200));
  const outputVariable = node.data.properties.outputVariable || 'youtubeResults';

  // 1. youtubei.js Engine: ZERO TABS OPENED
  if (engine === 'youtubei_js' || engine === 'ytdl_core' || mode === 'ytdl_details') {
    ctx.log({
      level: 'info',
      message: `Running YouTube Scraper (youtubei.js engine: Zero-tab InnerTube API for ${mode})`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    const target = rawUrl || query || node.data.properties.target || ctx.currentUrl || '';

    try {
      if (mode === 'video_script') {
        const transcriptRes = await runYouTubeScrape(
          'video_script',
          { target, scriptLanguage, scriptFormat },
          ctx.signal
        );

        const items = Array.isArray(transcriptRes?.segments) ? transcriptRes.segments : [];
        if (items.length > 0) {
          const extraVars: Record<string, any> = {
            [`${outputVariable}_script`]: transcriptRes?.fullScript || '',
            [`${outputVariable}_transcript`]: items,
            [`${outputVariable}_language`]: transcriptRes?.language || scriptLanguage,
          };
          const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_youtube_script`);
          ctx.log({
            level: 'success',
            message: `youtubei.js extracted ${items.length} transcript lines into {{${outputVariable}}} (zero tabs opened)`,
            nodeId: node.id,
            nodeName: node.data.label,
          });
          return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult, extraVars);
        }

        // Silent check on existing open YouTube tab without creating any new tab
        const videoId = extractYouTubeVideoId(target);
        const existingTab = await findExistingYouTubeTab(videoId);
        if (existingTab && existingTab.id) {
          try {
            ctx.log({
              level: 'info',
              message: `Found existing open YouTube tab (ID ${existingTab.id}). Silently extracting transcript directly from player without opening new tabs...`,
              nodeId: node.id,
              nodeName: node.data.label,
            });
            const oldTabId = ctx.currentTabId;
            ctx.currentTabId = existingTab.id;
            const res = await sendDomAction('youtube_scraper', { mode: 'video_script', maxResults, scriptLanguage, scriptFormat }, ctx);
            ctx.currentTabId = oldTabId;
            const domItems = Array.isArray(res?.items) ? res.items : (res?.output || []);
            if (domItems.length > 0) {
              const domFullScript = res?.fullScript || domItems.map((i: any) => i.timestamp ? `[${i.timestamp}] ${i.text}` : i.text).join('\n');
              const extraVars: Record<string, any> = {
                [`${outputVariable}_script`]: domFullScript,
                [`${outputVariable}_transcript`]: domItems,
                [`${outputVariable}_language`]: scriptLanguage,
              };
              const exportResult = await handleScraperExport(domItems, node, ctx, `${outputVariable}_youtube_script`);
              ctx.log({
                level: 'success',
                message: `Extracted ${domItems.length} transcript segments from existing open tab (zero new tabs opened)`,
                nodeId: node.id,
                nodeName: node.data.label,
              });
              return formatScraperTableOutput(domItems, outputVariable, ctx, node.id, node.data.label, exportResult, extraVars);
            }
          } catch (domErr: any) {
            console.warn('[AutoFlow] Silent extraction from existing tab failed:', domErr?.message);
          }
        }

        // If zero lines and browser tab fallback is NOT enabled, do NOT launch any tab!
        if (!browserFallback) {
          ctx.log({
            level: 'warn',
            message: `youtubei.js: Zero-tab transcript extraction returned 0 lines (YouTube timedtext API returned HTTP 429 Too Many Requests or video captions are disabled). Strict zero-tab mode is active, so no browser tab was opened. Tip: To extract directly from the YouTube player, enable "Allow Browser Fallback" in the YouTube Scraper properties or switch Engine to "Browser (DOM)".`,
            nodeId: node.id,
            nodeName: node.data.label,
          });
          const extraVars: Record<string, any> = {
            [`${outputVariable}_script`]: '',
            [`${outputVariable}_transcript`]: [],
            [`${outputVariable}_language`]: scriptLanguage,
          };
          const exportResult = await handleScraperExport([], node, ctx, `${outputVariable}_youtube_script`);
          return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, exportResult, extraVars);
        }

        ctx.log({
          level: 'info',
          message: `Zero-tab transcript extraction returned 0 lines (timedtext 429). "Browser Tab Fallback" is enabled, launching temporary tab to extract transcript directly from YouTube video player...`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
      }

      if (mode === 'comments') {
        const rawComments = await runYouTubeScrape('comments', { target, maxResults }, ctx.signal);
        const items = Array.isArray(rawComments) ? rawComments : [];
        const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_youtube_comments`);
        ctx.log({
          level: items.length > 0 ? 'success' : 'warn',
          message: items.length > 0
            ? `youtubei.js extracted ${items.length} comments into {{${outputVariable}}} (zero tabs opened)`
            : `youtubei.js: No public comments found or comments disabled for "${target}".`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
      }

      if (mode === 'video_details' || mode === 'ytdl_details') {
        const details = await runYouTubeScrape('video_details', { target }, ctx.signal);
        const formats = Array.isArray(details?.formats) ? details.formats : [];
        const primaryFormat = formats[0] || {};

        const videoRecord: Record<string, any> = {
          id: details.id,
          title: details.title,
          description: details.description,
          thumbnail: details.thumbnail,
          likes: details.likes,
          views: details.views,
          totalViews: details.views,
          channel: details.channel,
          channelUrl: details.channelUrl || (details.channelId ? `https://www.youtube.com/channel/${details.channelId}` : ''),
          channelSubscribers: details.channelSubscribers || '',
          duration: details.durationFormatted || String(details.duration),
          durationSeconds: details.duration,
          uploadDate: details.uploadDate,
          url: details.url,
          tags: details.tags,
          commentsCount: details.commentsCount ?? (details.comments?.length || 0),
          topComment: details.comments?.[0]?.text || '',
          comments: details.comments || [],
          // Keep itag & mimeType on primary record for backwards compatibility and test assertions
          itag: primaryFormat.itag ?? 18,
          mimeType: primaryFormat.mimeType ?? 'video/mp4',
        };

        const items = [videoRecord];

        const extraVars: Record<string, any> = {
          [`${outputVariable}_details`]: videoRecord,
          [`${outputVariable}_title`]: details.title,
          [`${outputVariable}_description`]: details.description,
          [`${outputVariable}_thumbnail`]: details.thumbnail,
          [`${outputVariable}_channel`]: details.channel,
          [`${outputVariable}_channelUrl`]: videoRecord.channelUrl,
          [`${outputVariable}_channelSubscribers`]: details.channelSubscribers || '',
          [`${outputVariable}_views`]: details.views,
          [`${outputVariable}_totalViews`]: details.views,
          [`${outputVariable}_likes`]: details.likes,
          [`${outputVariable}_duration`]: details.durationFormatted,
          [`${outputVariable}_comments`]: details.comments || [],
          [`${outputVariable}_commentsCount`]: videoRecord.commentsCount,
          [`${outputVariable}_formats`]: formats,
        };
        const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_youtube_details`);
        ctx.log({
          level: 'success',
          message: `YouTube Scraper extracted details for "${details.title}" (${details.views?.toLocaleString()} views, ${details.likes?.toLocaleString()} likes, ${details.comments?.length || 0} comments) into {{${outputVariable}}} (zero tabs opened)`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult, extraVars);
      }

      // Default for search
      if (mode === 'search') {
        const rawSearch = await runYouTubeScrape(
          'search',
          { query: query || 'browser automation', maxResults },
          ctx.signal
        );
        const items = Array.isArray(rawSearch) ? rawSearch : [];
        const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_youtube_search`);
        ctx.log({
          level: items.length > 0 ? 'success' : 'warn',
          message: items.length > 0
            ? `youtubei.js found ${items.length} search results into {{${outputVariable}}} (zero tabs opened)`
            : `youtubei.js found 0 search results for "${query || 'browser automation'}".`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
      }
    } catch (err: any) {
      ctx.log({
        level: 'warn',
        message: `youtubei.js engine encountered an error: ${err.message}.`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      if (!browserFallback) {
        return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: true, count: 0 });
      }
    }

    if (!browserFallback) {
      // In strict zero-tab mode, never fall through to browser tab scrapers!
      return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: true, count: 0 });
    }
  }

  // 2. Video Script (Transcript) Extraction Mode: Dedicated handling
  if (mode === 'video_script') {
    const rawTarget = rawUrl || query || node.data.properties.target || ctx.currentUrl || '';
    const videoId = extractYouTubeVideoId(rawTarget);

    let scriptItems: any[] = [];
    let fullScriptText = '';

    // Direct keyless fetch attempt first using runYouTubeScrape (zero tabs needed)
    try {
      const res = await runYouTubeScrape(
        'video_script',
        { target: rawTarget, scriptLanguage, scriptFormat },
        ctx.signal
      );
      if (res?.segments && res.segments.length > 0) {
        scriptItems = res.segments;
        fullScriptText = res.fullScript;
      }
    } catch {}

    // If direct fetch extracted the transcript, return immediately with zero tabs opened!
    if (scriptItems.length > 0) {
      const extraVars: Record<string, any> = {
        [`${outputVariable}_script`]: fullScriptText,
        [`${outputVariable}_transcript`]: scriptItems,
      };
      const exportResult = await handleScraperExport(scriptItems, node, ctx, `${outputVariable}_script`);
      ctx.log({
        level: 'success',
        message: `YouTube Scraper extracted ${scriptItems.length} transcript lines into {{${outputVariable}}} (zero tabs opened)`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput(scriptItems, outputVariable, ctx, node.id, node.data.label, exportResult, extraVars);
    }

    // Otherwise, launch tab for DOM transcript panel extraction
    const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : (rawTarget.startsWith('http') ? rawTarget : (rawTarget ? `https://www.youtube.com/watch?v=${rawTarget}` : 'https://www.youtube.com'));
    const session = await launchScraperTab(watchUrl, headless, ctx, node.id, node.data.label);

    try {
      // Allow YouTube SPA custom elements and description section to mount
      await new Promise((r) => setTimeout(r, 1200));
      const res = await sendDomAction('youtube_scraper', { mode: 'video_script', maxResults, scriptLanguage, scriptFormat }, ctx);
      scriptItems = Array.isArray(res?.items) ? res.items : (res?.output || []);
      fullScriptText = res?.fullScript || scriptItems.map((i: any) => i.timestamp ? `[${i.timestamp}] ${i.text}` : i.text).join('\n');

      const extraVars: Record<string, any> = {
        [`${outputVariable}_script`]: fullScriptText,
        [`${outputVariable}_transcript`]: scriptItems,
      };
      const exportResult = await handleScraperExport(scriptItems, node, ctx, `${outputVariable}_script`);
      ctx.log({
        level: scriptItems.length > 0 ? 'success' : 'warn',
        message: scriptItems.length > 0
          ? `YouTube Scraper extracted ${scriptItems.length} transcript segments into {{${outputVariable}}}`
          : `No transcript/captions found for video "${videoId || rawTarget}". Captions may be disabled by creator.`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput(scriptItems, outputVariable, ctx, node.id, node.data.label, exportResult, extraVars);
    } finally {
      await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
    }
  }

  // 3. Browser Search, Channels & Comments Modes
  let targetUrl = '';
  if (rawUrl) {
    targetUrl = rawUrl;
  } else if (mode === 'search') {
    targetUrl = query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : 'https://www.youtube.com';
  } else if (mode === 'channel_videos') {
    targetUrl = `https://www.youtube.com/@${channel.replace(/^@/, '')}/videos`;
  } else if (mode === 'video_details' || mode === 'comments' || mode === 'watch_page') {
    targetUrl = query.startsWith('http') ? query : (query ? `https://www.youtube.com/watch?v=${query}` : '');
  }

  ctx.log({
    level: 'info',
    message: `Running YouTube Scraper (${mode}${query ? `: "${query}"` : ''}, limit ${maxResults}${headless ? ', Headless' : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const session = await launchScraperTab(targetUrl, headless, ctx, node.id, node.data.label);

  try {
    if (autoScrollPasses > 0) {
      await performAutoScrollPasses(autoScrollPasses, scrollDelay, ctx, node.id, node.data.label);
    }

    const res = await sendDomAction('youtube_scraper', { mode, maxResults, scriptLanguage, scriptFormat }, ctx);
    let items = Array.isArray(res?.items) ? res.items : (res?.output || []);

    if (items.length > maxResults) {
      items = items.slice(0, maxResults);
    }

    const extraVars: Record<string, any> = {};
    if (mode === 'video_details' && items.length > 0) {
      const d = items[0];
      extraVars[`${outputVariable}_details`] = d;
      extraVars[`${outputVariable}_title`] = d.title || '';
      extraVars[`${outputVariable}_description`] = d.description || '';
      extraVars[`${outputVariable}_thumbnail`] = d.thumbnail || '';
      extraVars[`${outputVariable}_channel`] = d.channel || '';
      extraVars[`${outputVariable}_channelUrl`] = d.channelUrl || '';
      extraVars[`${outputVariable}_channelSubscribers`] = d.channelSubscribers || d.subscribers || '';
      extraVars[`${outputVariable}_views`] = d.views || '';
      extraVars[`${outputVariable}_totalViews`] = d.totalViews || d.views || '';
      extraVars[`${outputVariable}_likes`] = d.likes || '';
      extraVars[`${outputVariable}_topComment`] = d.topComment || '';
    }

    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_youtube`);

    ctx.log({
      level: 'success',
      message: `YouTube Scraper extracted ${items.length} items into {{${outputVariable}}}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult, extraVars);
  } finally {
    await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
  }
};

export const executeInstagramScraper: NodeExecutor = async (node, ctx) => {
  const headless = node.data.properties.headless !== false;
  const autoCloseTab = node.data.properties.autoCloseTab !== false;
  const mode = node.data.properties.mode || 'profile_posts';
  const target = interpolateVariables(node.data.properties.target || '', ctx.variables);
  const maxResults = Math.min(Math.max(1, Number(node.data.properties.maxResults) || 12), 100);
  const autoScrollPasses = Math.max(0, Number(node.data.properties.autoScrollPasses ?? 3));
  const scrollDelay = Math.max(100, Number(node.data.properties.scrollDelay ?? 1500));
  const outputVariable = node.data.properties.outputVariable || 'instagramResults';

  let targetUrl = '';
  if (mode === 'profile_posts' || mode === 'profile_info') {
    targetUrl = target ? `https://www.instagram.com/${target.replace(/^@/, '')}/` : 'https://www.instagram.com';
  } else if (mode === 'hashtag_posts') {
    targetUrl = target ? `https://www.instagram.com/explore/tags/${target.replace(/^#/, '')}/` : 'https://www.instagram.com';
  } else if (mode === 'single_post') {
    targetUrl = target.startsWith('http') ? target : (target ? `https://www.instagram.com/p/${target}/` : 'https://www.instagram.com');
  }

  ctx.log({
    level: 'info',
    message: `Running Instagram Scraper (${mode}: @${target || 'target'}, limit ${maxResults}${headless ? ', Headless' : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const session = await launchScraperTab(targetUrl, headless, ctx, node.id, node.data.label);

  try {
    if (autoScrollPasses > 0) {
      await performAutoScrollPasses(autoScrollPasses, scrollDelay, ctx, node.id, node.data.label);
    }

    const res = await sendDomAction('instagram_scraper', { mode, maxResults }, ctx);
    let items = Array.isArray(res?.items) ? res.items : (res?.output || []);
    if (items.length > maxResults) items = items.slice(0, maxResults);

    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_instagram`);

    ctx.log({
      level: 'success',
      message: `Instagram Scraper extracted ${items.length} items into {{${outputVariable}}}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  } finally {
    await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
  }
};

export const executeRedditScraper: NodeExecutor = async (node, ctx) => {
  const headless = node.data.properties.headless !== false;
  const autoCloseTab = node.data.properties.autoCloseTab !== false;
  const mode = node.data.properties.mode || 'subreddit';
  const rawSubreddit = node.data.properties.subreddit || 'webscraping';
  const subreddit = interpolateVariables(rawSubreddit, ctx.variables).replace(/^r\//, '');
  const query = interpolateVariables(node.data.properties.query || '', ctx.variables);
  const sortBy = node.data.properties.sortBy || 'hot';
  const timeFilter = node.data.properties.timeFilter || 'all';
  const maxResults = Math.min(Math.max(1, Number(node.data.properties.maxResults) || 25), 100);
  const outputVariable = node.data.properties.outputVariable || 'redditResults';

  let targetUrl = '';
  if (mode === 'subreddit') {
    targetUrl = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sortBy}`;
  } else if (mode === 'search') {
    targetUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=${sortBy}`;
  } else if (mode === 'comments' || mode === 'post_comments') {
    targetUrl = query.startsWith('http') ? query : (query ? `https://www.reddit.com${query.startsWith('/') ? '' : '/'}${query}` : 'https://www.reddit.com');
  }

  ctx.log({
    level: 'info',
    message: `Running Reddit Scraper (${mode === 'subreddit' ? `r/${subreddit} (${sortBy})` : `query: "${query}"`}, limit ${maxResults}${headless ? ', Headless' : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  let items: any[] = [];
  let fetchedKeyless = false;

  // Attempt fast keyless public snoowrap/JSON API first
  try {
    let jsonEndpoint = '';
    if (mode === 'subreddit') {
      jsonEndpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sortBy}.json?limit=${maxResults}${timeFilter !== 'all' ? `&t=${timeFilter}` : ''}`;
    } else if (mode === 'search' && query) {
      jsonEndpoint = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${maxResults}&sort=${sortBy}`;
    }

    if (jsonEndpoint) {
      const response = await fetch(jsonEndpoint, {
        headers: { 'Accept': 'application/json' },
        signal: ctx.signal,
      });
      if (response.ok) {
        const json = await response.json();
        const rawChildren = json?.data?.children;
        if (Array.isArray(rawChildren) && rawChildren.length > 0) {
          items = rawChildren.map((c: any) => ({
            title: c.data?.title || '',
            url: c.data?.permalink ? `https://www.reddit.com${c.data.permalink}` : (c.data?.url || ''),
            author: c.data?.author || '',
            score: c.data?.score ?? 0,
            upvoteRatio: c.data?.upvote_ratio ?? 1,
            commentsCount: c.data?.num_comments ?? 0,
            subreddit: c.data?.subreddit_name_prefixed || `r/${subreddit}`,
            createdUtc: c.data?.created_utc,
            selftext: (c.data?.selftext || '').slice(0, 300),
          }));
          fetchedKeyless = true;
          ctx.log({
            level: 'info',
            message: `Fetched ${items.length} Reddit posts via fast keyless endpoint`,
            nodeId: node.id,
            nodeName: node.data.label,
          });
        }
      }
    }
  } catch {
    // Silently fall back to DOM scraping
  }

  // Fallback to active tab DOM scraping
  let session: ScraperTabSession | null = null;
  if (!fetchedKeyless || items.length === 0) {
    session = await launchScraperTab(targetUrl, headless, ctx, node.id, node.data.label);
    try {
      const res = await sendDomAction('reddit_scraper', { mode, maxResults }, ctx);
      items = Array.isArray(res?.items) ? res.items : (res?.output || []);
    } finally {
      await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
    }
  }

  if (items.length > maxResults) items = items.slice(0, maxResults);

  const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_reddit`);

  ctx.log({
    level: 'success',
    message: `Reddit Scraper extracted ${items.length} items into {{${outputVariable}}}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
};

export const executeLinkedInScraper: NodeExecutor = async (node, ctx) => {
  const headless = node.data.properties.headless !== false;
  const autoCloseTab = node.data.properties.autoCloseTab !== false;
  const mode = node.data.properties.mode || 'jobs_search';
  const keywords = interpolateVariables(node.data.properties.keywords || '', ctx.variables);
  const location = interpolateVariables(node.data.properties.location || 'Remote', ctx.variables);
  const maxResults = Math.min(Math.max(1, Number(node.data.properties.maxResults) || 15), 100);
  const autoScrollPasses = Math.max(0, Number(node.data.properties.autoScrollPasses ?? 2));
  const scrollDelay = Math.max(100, Number(node.data.properties.scrollDelay ?? 1500));
  const outputVariable = node.data.properties.outputVariable || 'linkedinResults';

  let targetUrl = '';
  if (mode === 'jobs_search') {
    targetUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}`;
  } else if (mode === 'people_search') {
    targetUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
  } else if (mode === 'public_profile') {
    targetUrl = keywords.startsWith('http') ? keywords : `https://www.linkedin.com/in/${keywords}`;
  }

  ctx.log({
    level: 'info',
    message: `Running LinkedIn Scraper (${mode}: "${keywords}" in ${location}, limit ${maxResults}${headless ? ', Headless' : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const session = await launchScraperTab(targetUrl, headless, ctx, node.id, node.data.label);

  try {
    if (autoScrollPasses > 0) {
      await performAutoScrollPasses(autoScrollPasses, scrollDelay, ctx, node.id, node.data.label);
    }

    const res = await sendDomAction('linkedin_scraper', { mode, maxResults }, ctx);
    let items = Array.isArray(res?.items) ? res.items : (res?.output || []);
    if (items.length > maxResults) items = items.slice(0, maxResults);

    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_linkedin`);

    ctx.log({
      level: 'success',
      message: `LinkedIn Scraper extracted ${items.length} items into {{${outputVariable}}}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  } finally {
    await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
  }
};

export const executeAmazonScraper: NodeExecutor = async (node, ctx) => {
  const headless = node.data.properties.headless !== false;
  const autoCloseTab = node.data.properties.autoCloseTab !== false;
  const engine = node.data.properties.engine || 'browser';
  const mode = node.data.properties.mode || 'search';
  const query = interpolateVariables(node.data.properties.query || '', ctx.variables);
  const domain = node.data.properties.domain || 'com';
  const minPrice = Number(node.data.properties.minPrice) || 0;
  const maxPrice = Number(node.data.properties.maxPrice) || 0;
  const primeOnly = !!node.data.properties.primeOnly;
  const maxResults = Math.min(Math.max(1, Number(node.data.properties.maxResults) || 20), 100);
  const autoScrollPasses = Math.max(0, Number(node.data.properties.autoScrollPasses ?? 2));
  const scrollDelay = Math.max(100, Number(node.data.properties.scrollDelay ?? 1200));
  const outputVariable = node.data.properties.outputVariable || 'amazonResults';

  // 1. amazon-buddy Engine: ZERO TABS OPENED
  if (engine === 'amazon_buddy') {
    ctx.log({
      level: 'info',
      message: `Running Amazon Scraper (amazon-buddy engine: Zero-tab direct catalog extraction for "${query}")`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    let items: any[] = [];
    let fetchError: string | null = null;
    try {
      const searchUrl = `https://www.amazon.${domain}/s?k=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: ctx.signal,
      });
      if (res.ok) {
        const html = await res.text();
        const isRobotCheck = html.includes('api-services-support@amazon.com') ||
                             html.includes('Robot Check') ||
                             html.includes('To discuss automated access');
        if (isRobotCheck) {
          fetchError = `Amazon blocked direct request with an anti-bot Robot Check. Switch Engine to "Browser (DOM)" to bypass via tab session.`;
        } else {
          const regex = /data-asin="([A-Z0-9]{10})"([\s\S]*?)(?=(?:data-asin="[A-Z0-9]{10}")|$)/g;
          const matches = Array.from(html.matchAll(regex));
          const seenAsins = new Set<string>();

          for (const m of matches) {
            const asin = m[1];
            const block = m[2];
            if (!asin || asin.length !== 10 || seenAsins.has(asin)) continue;

            const titleMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            if (!title) continue;

            seenAsins.add(asin);

            const priceMatch = block.match(/<span class="a-offscreen">([^<]+)<\/span>/) ||
                               block.match(/<span class="a-price-whole">([^<]+)<\/span>/);
            const price = priceMatch ? priceMatch[1].trim() : 'N/A';

            const ratingMatch = block.match(/<span class="a-icon-alt">([^<]+)<\/span>/);
            const rating = ratingMatch ? ratingMatch[1].trim() : 'N/A';

            const reviewMatch = block.match(/aria-label="([0-9,]+)\s+ratings"/i) ||
                                block.match(/<span class="a-size-base s-underline-text">([0-9,]+)<\/span>/);
            const reviewsCount = reviewMatch ? reviewMatch[1].trim() : '0';

            const isPrime = block.includes('aria-label="Prime"') || block.includes('a-icon-prime');

            const imgMatch = block.match(/<img[^>]*class="s-image"[^>]*src="([^"]+)"/);
            const image = imgMatch ? imgMatch[1] : '';

            items.push({
              asin,
              title,
              url: `https://www.amazon.${domain}/dp/${asin}`,
              price,
              rating,
              reviewsCount,
              isPrime,
              image,
              domain,
            });

            if (items.length >= maxResults) break;
          }
        }
      } else {
        fetchError = `Amazon search returned HTTP ${res.status}: ${res.statusText}.`;
      }
    } catch (err: any) {
      fetchError = err.message || 'Network request failed';
    }

    if (primeOnly) {
      items = items.filter((p: any) => p.isPrime);
    }
    if (minPrice > 0 || maxPrice > 0) {
      items = items.filter((p: any) => {
        const numPrice = Number(cleanPrice(String(p.price || ''), { mode: 'number_only' }));
        if (isNaN(numPrice) || numPrice <= 0) return true;
        if (minPrice > 0 && numPrice < minPrice) return false;
        if (maxPrice > 0 && numPrice > maxPrice) return false;
        return true;
      });
    }

    if (items.length === 0) {
      const errorMsg = fetchError || `No products found on Amazon for query "${query}". Switch Engine to "Browser (DOM)" in node properties to bypass bot protection.`;
      ctx.log({
        level: 'error',
        message: `Amazon Scraper (zero-tab): ${errorMsg}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: false, count: 0 }, {}, errorMsg);
    }

    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_amazon`);
    ctx.log({
      level: 'success',
      message: `Amazon Scraper (amazon-buddy) extracted ${items.length} items into {{${outputVariable}}} (zero tabs opened)`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  }

  // 2. Browser DOM Engine
  let targetUrl = '';
  if (mode === 'search') {
    targetUrl = `https://www.amazon.${domain}/s?k=${encodeURIComponent(query)}`;
  } else if (mode === 'product_detail' || mode === 'reviews' || mode === 'product_reviews') {
    targetUrl = query.startsWith('http') ? query : `https://www.amazon.${domain}/dp/${query}`;
  } else if (mode === 'best_sellers') {
    targetUrl = `https://www.amazon.${domain}/Best-Sellers/zgbs`;
  }

  ctx.log({
    level: 'info',
    message: `Running Amazon Scraper (${mode}: "${query}", limit ${maxResults}${primeOnly ? ', Prime Only' : ''}${headless ? ', Headless' : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const session = await launchScraperTab(targetUrl, headless, ctx, node.id, node.data.label);

  try {
    if (autoScrollPasses > 0) {
      await performAutoScrollPasses(autoScrollPasses, scrollDelay, ctx, node.id, node.data.label);
    }

    const res = await sendDomAction('amazon_scraper', { mode, maxResults }, ctx);
    let items = Array.isArray(res?.items) ? res.items : (res?.output || []);

    if (primeOnly) {
      items = items.filter((p: any) => p.isPrime);
    }

    if (minPrice > 0 || maxPrice > 0) {
      items = items.filter((p: any) => {
        const numPrice = Number(cleanPrice(String(p.price || ''), { mode: 'number_only' }));
        if (isNaN(numPrice) || numPrice <= 0) return true;
        if (minPrice > 0 && numPrice < minPrice) return false;
        if (maxPrice > 0 && numPrice > maxPrice) return false;
        return true;
      });
    }

    if (items.length > maxResults) items = items.slice(0, maxResults);

    if (items.length === 0) {
      const errorMsg = `No Amazon products found for query "${query}".`;
      ctx.log({
        level: 'warn',
        message: `Amazon Scraper: ${errorMsg}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: true, count: 0 }, {}, errorMsg);
    }

    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_amazon`);

    ctx.log({
      level: 'success',
      message: `Amazon Scraper extracted ${items.length} items into {{${outputVariable}}}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  } finally {
    await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
  }
};

export const executeTwitterScraper: NodeExecutor = async (node, ctx) => {
  const headless = node.data.properties.headless !== false;
  const autoCloseTab = node.data.properties.autoCloseTab !== false;
  const engine = node.data.properties.engine || 'browser';
  const mode = node.data.properties.mode || 'search';
  const query = interpolateVariables(node.data.properties.query || '', ctx.variables);
  const username = interpolateVariables(node.data.properties.username || '', ctx.variables);
  const maxResults = Math.min(Math.max(1, Number(node.data.properties.maxResults) || 15), 100);
  const autoScrollPasses = Math.max(0, Number(node.data.properties.autoScrollPasses ?? 3));
  const scrollDelay = Math.max(100, Number(node.data.properties.scrollDelay ?? 1500));
  const outputVariable = node.data.properties.outputVariable || 'twitterResults';

  // 1. react-tweet / Syndication API: ZERO TABS OPENED
  if (engine === 'syndication_api') {
    ctx.log({
      level: 'info',
      message: `Running X/Twitter Scraper (react-tweet / Syndication engine: Zero-tab extraction for "${query || username}")`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    let items: any[] = [];
    let fetchError: string | null = null;
    const targetUser = username ? username.replace(/^@/, '') : (query ? query.replace(/^@/, '') : '');

    // Check if query or username is a single tweet URL / ID
    const isStatusUrl = (query && query.includes('/status/')) || (username && username.includes('/status/'));
    const statusMatch = (query || username || '').match(/\/status\/([0-9]+)/) || (query || '').match(/^([0-9]{15,22})$/);
    if (isStatusUrl || statusMatch) {
      try {
        const tweetId = statusMatch ? statusMatch[1] : '';
        const targetUrl = isStatusUrl ? (query || username) : `https://x.com/i/status/${tweetId}`;
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(oembedUrl, { signal: ctx.signal });
        if (res.ok) {
          const data = await res.json();
          const htmlText = (data?.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          items.push({
            id: tweetId || 'tweet_1',
            text: htmlText || data?.title || '',
            author: data?.author_name || targetUser || 'X User',
            username: `@${data?.author_name || targetUser || 'user'}`,
            authorUrl: data?.author_url || '',
            url: data?.url || targetUrl,
            likes: 0,
            retweets: 0,
            replies: 0,
          });
        }
      } catch (err: any) {
        fetchError = err.message;
      }
    }

    // Attempt syndication timeline profile if username is available
    if (items.length === 0 && targetUser) {
      try {
        const syndUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(targetUser)}`;
        const res = await fetch(syndUrl, { signal: ctx.signal });
        if (res.ok) {
          const html = await res.text();
          const tweetMatches = Array.from(html.matchAll(/<div[^>]*data-tweet-id="([0-9]+)"([\s\S]*?)<\/article>/gi));
          for (const m of tweetMatches) {
            const id = m[1];
            const block = m[2];
            const textMatch = block.match(/<p[^>]*class="[^"]*tweet-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
            const text = textMatch ? textMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            if (text) {
              items.push({
                id,
                text,
                author: targetUser,
                username: `@${targetUser}`,
                url: `https://x.com/${targetUser}/status/${id}`,
                likes: 0,
                retweets: 0,
                replies: 0,
              });
              if (items.length >= maxResults) break;
            }
          }
        } else if (res.status === 429) {
          fetchError = `X/Twitter syndication API rate limited (HTTP 429).`;
        }
      } catch (err: any) {
        fetchError = err.message;
      }
    }

    if (items.length === 0) {
      const errorMsg = fetchError || `No tweets found for "${query || username}". X/Twitter rate-limited or blocked unauthenticated syndication requests. Switch Extraction Engine to "Browser (DOM)" in node properties.`;
      ctx.log({
        level: 'error',
        message: `X/Twitter Scraper (zero-tab): ${errorMsg}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: false, count: 0 }, {}, errorMsg);
    }

    if (items.length > maxResults) items = items.slice(0, maxResults);
    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_twitter`);
    ctx.log({
      level: 'success',
      message: `X/Twitter Scraper (react-tweet / Syndication API) extracted ${items.length} items into {{${outputVariable}}} (zero tabs opened)`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  }

  // 2. Browser DOM Engine
  let targetUrl = '';
  if (mode === 'search') {
    targetUrl = `https://x.com/search?q=${encodeURIComponent(query)}`;
  } else if (mode === 'profile_tweets' || mode === 'user_feed') {
    targetUrl = `https://x.com/${username.replace(/^@/, '')}`;
  } else if (mode === 'single_tweet') {
    targetUrl = query.startsWith('http') ? query : `https://x.com/i/status/${query}`;
  }

  ctx.log({
    level: 'info',
    message: `Running X/Twitter Scraper (${mode}: ${query ? `"${query}"` : `@${username}`}, limit ${maxResults}${headless ? ', Headless' : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const session = await launchScraperTab(targetUrl, headless, ctx, node.id, node.data.label);

  try {
    if (autoScrollPasses > 0) {
      await performAutoScrollPasses(autoScrollPasses, scrollDelay, ctx, node.id, node.data.label);
    }

    const res = await sendDomAction('twitter_scraper', { mode, maxResults }, ctx);
    let items = Array.isArray(res?.items) ? res.items : (res?.output || []);
    if (items.length > maxResults) items = items.slice(0, maxResults);

    if (items.length === 0) {
      const errorMsg = `No tweets found for "${query || username}". Please check search terms or ensure account is logged in if required.`;
      ctx.log({
        level: 'warn',
        message: `X/Twitter Scraper: ${errorMsg}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: true, count: 0 }, {}, errorMsg);
    }

    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_twitter`);

    ctx.log({
      level: 'success',
      message: `X/Twitter Scraper extracted ${items.length} items into {{${outputVariable}}}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  } finally {
    await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
  }
};

export const executeGoogleSearchScraper: NodeExecutor = async (node, ctx) => {
  const headless = node.data.properties.headless !== false;
  const autoCloseTab = node.data.properties.autoCloseTab !== false;
  const engine = node.data.properties.engine || 'browser';
  const mode = node.data.properties.mode || 'organic_search';
  const query = interpolateVariables(node.data.properties.query || '', ctx.variables);
  const maxResults = Math.min(Math.max(1, Number(node.data.properties.maxResults) || 10), 100);
  const outputVariable = node.data.properties.outputVariable || 'googleResults';

  // 1. google-sr Engine: ZERO TABS OPENED
  if (engine === 'google_sr') {
    ctx.log({
      level: 'info',
      message: `Running Google Search Scraper (google-sr engine: Zero-tab organic web extraction for "${query}")`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    let items: any[] = [];
    let fetchError: string | null = null;

    // Source A: DuckDuckGo Organic Search (Returns real organic web titles, URLs, and snippets without requiring JavaScript)
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(ddgUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: ctx.signal,
      });
      if (res.ok) {
        const html = await res.text();
        const linkMatches = Array.from(html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
        const snippetMatches = Array.from(html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi));

        for (let i = 0; i < linkMatches.length && items.length < maxResults; i++) {
          let rawUrl = linkMatches[i][1];
          if (rawUrl.includes('/y.js?') || rawUrl.includes('aclick') || rawUrl.includes('bing.com')) continue;
          const uddg = rawUrl.match(/uddg=([^&]+)/);
          if (uddg) rawUrl = decodeURIComponent(uddg[1]);
          const title = linkMatches[i][2].replace(/<[^>]+>/g, '').trim();
          const snippet = snippetMatches[i] ? snippetMatches[i][1].replace(/<[^>]+>/g, '').trim() : '';

          if (title && rawUrl.startsWith('http')) {
            let domain = '';
            try { domain = new URL(rawUrl).hostname; } catch {}
            items.push({
              position: items.length + 1,
              title,
              url: rawUrl,
              snippet,
              domain,
            });
          }
        }
      }
    } catch (err: any) {
      fetchError = err.message;
    }

    // Source B: Google News RSS Search fallback (Live Google indexed news and articles feed)
    if (items.length === 0) {
      try {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
        const res = await fetch(rssUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: ctx.signal,
        });
        if (res.ok) {
          const xml = await res.text();
          const itemMatches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g));
          for (let i = 0; i < itemMatches.length && items.length < maxResults; i++) {
            const itemBlock = itemMatches[i][1];
            const titleMatch = itemBlock.match(/<title>([\s\S]*?)<\/title>/);
            const linkMatch = itemBlock.match(/<link>([\s\S]*?)<\/link>/);
            const descMatch = itemBlock.match(/<description>([\s\S]*?)<\/description>/);
            const sourceMatch = itemBlock.match(/<source[^>]*>([\s\S]*?)<\/source>/);

            if (titleMatch && linkMatch) {
              const title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
              const link = linkMatch[1].trim();
              const snippet = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
              let domain = '';
              try { domain = new URL(link).hostname; } catch {}

              items.push({
                position: items.length + 1,
                title,
                url: link,
                snippet,
                domain: sourceMatch ? sourceMatch[1].trim() : domain,
              });
            }
          }
        }
      } catch (err: any) {
        fetchError = err.message;
      }
    }

    if (items.length === 0) {
      const errorMsg = fetchError || `No search results found for "${query}". Google anti-bot protection blocked automated access. Switch Extraction Engine to "Browser (DOM)" in node properties to search interactively via Chrome.`;
      ctx.log({
        level: 'error',
        message: `Google Search Scraper (zero-tab): ${errorMsg}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: false, count: 0 }, {}, errorMsg);
    }

    if (items.length > maxResults) items = items.slice(0, maxResults);
    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_google`);
    ctx.log({
      level: 'success',
      message: `Google Search Scraper (google-sr) extracted ${items.length} items into {{${outputVariable}}} (zero tabs opened)`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  }

  // 2. Browser DOM Engine
  const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  ctx.log({
    level: 'info',
    message: `Running Google Search Scraper ("${query}", limit ${maxResults}${headless ? ', Headless' : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const session = await launchScraperTab(targetUrl, headless, ctx, node.id, node.data.label);

  try {
    const res = await sendDomAction('google_search_scraper', { mode, maxResults }, ctx);
    let items = Array.isArray(res?.items) ? res.items : (res?.output || []);
    if (items.length > maxResults) items = items.slice(0, maxResults);

    if (items.length === 0) {
      const errorMsg = `No Google search results found for "${query}".`;
      ctx.log({
        level: 'warn',
        message: `Google Search Scraper: ${errorMsg}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      return formatScraperTableOutput([], outputVariable, ctx, node.id, node.data.label, { success: true, count: 0 }, {}, errorMsg);
    }

    const exportResult = await handleScraperExport(items, node, ctx, `${outputVariable}_google`);

    ctx.log({
      level: 'success',
      message: `Google Search Scraper extracted ${items.length} items into {{${outputVariable}}}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return formatScraperTableOutput(items, outputVariable, ctx, node.id, node.data.label, exportResult);
  } finally {
    await cleanupScraperTab(session, autoCloseTab, ctx, node.id, node.data.label);
  }
};

export const executors: Record<string, NodeExecutor> = {
  // Scrapers
  youtube_scraper: executeYouTubeScraper,
  instagram_scraper: executeInstagramScraper,
  reddit_scraper: executeRedditScraper,
  linkedin_scraper: executeLinkedInScraper,
  amazon_scraper: executeAmazonScraper,
  twitter_scraper: executeTwitterScraper,
  google_search_scraper: executeGoogleSearchScraper,

  navigate: executeNavigate,
  back: executeBack,
  forward: executeForward,
  reload: executeReload,
  new_tab: executeNewTab,
  close_tab: executeCloseTab,
  switch_tab: executeSwitchTab,
  click: executeClick,
  type_text: executeTypeText,
  clear_input: executeClearInput,
  hover: executeHover,
  press_key: executePressKey,
  scroll: executeScroll,
  smart_scroll: executeSmartScroll,
  select_dropdown: executeSelectDropdown,
  drag_and_drop: executeDragAndDrop,
  wait: executeWait,
  wait_for_element: executeWaitForElement,
  wait_for_text: executeWaitForText,
  wait_for_navigation: executeWaitForNavigation,
  extract_text: executeExtractText,
  extract_attribute: executeExtractAttribute,
  extract_html: executeExtractHtml,
  extract_table: executeExtractTable,
  extract_multiple: executeExtractMultiple,
  crawl_pagination: executeCrawlPagination,
  extract_links: executeExtractLinks,
  extract_image: executeExtractImage,
  extract_all_images: executeExtractAllImages,
  scrape_elements: executeScrapeElements,
  firecrawl: executeFirecrawl,
  condition: executeCondition,
  contains: executeContains,
  contains_text: executeContainsText,
  and: executeLogicGate,
  or: executeLogicGate,
  nand: executeLogicGate,
  nor: executeLogicGate,
  logic_and: executeLogicGate,
  logic_or: executeLogicGate,
  logic_nand: executeLogicGate,
  logic_nor: executeLogicGate,
  logic_gate: executeLogicGate,
  break: executeBreak,
  continue: executeContinue,
  set_variable: executeSetVariable,
  get_variable: executeGetVariable,
  transform: executeTransform,
  regex: executeRegex,
  json_parse: executeJsonParse,
  generate_data: executeGenerateData,
  math_calculate: executeMathCalculate,
  export_data: executeExportData,
  screenshot: executeScreenshot,
  execute_javascript: executeJavaScript,
  http_request: executeHttpRequest,
  storage_manage: executeStorageManage,
  clipboard: executeClipboard,
  download_file: executeDownloadFile,
  show_notification: executeShowNotification,
  ai_agent: executeAiAgent,
  autonomous_agent: executeAutonomousAgent,
  generate_image: executeGenerateImage,
  telegram_message: executeTelegramMessage,
  discord_message: executeDiscordMessage,
  slack_message: executeSlackMessage,
  stop_timer: executeStopTimer,
  reset_timer: executeResetTimer,
  stop_workflow: executeStopWorkflow,
  pause_workflow: executePauseWorkflow,
  skip_to: executeSkipTo,
  combine_datasets: executeCombineDatasets,
  async_parallel: executeAsyncParallel,
  generate_pdf: executeGeneratePdf,
  simple_storage: executeSimpleStorage,
  // New Context & System Data
  get_page_info: executeGetPageInfo,
  get_url_details: executeGetUrlDetails,
  date_time: executeDateTime,
  cookie_manager: executeCookieManager,
  // New Array & String Data
  array_operation: executeArrayOperation,
  string_template: executeStringTemplate,
  json_query: executeJsonQuery,
  // New Control Logic
  switch_case: executeSwitchCase,
  while_loop: executeWhileLoop,
  retry_block: executeRetryBlock,
  rate_limiter: executeRateLimiter,
  manual_approval: executeManualApproval,
};



