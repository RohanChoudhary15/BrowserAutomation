import { ExecutionContext, NodeResult, ActiveTimer } from '../../types/execution';
import { WorkflowNode } from '../../types/workflow';
import { interpolateVariables, getNestedValue } from '../interpolator';
import {
  evaluateCondition,
  LogicalGate,
  ConditionRule,
} from '../evaluator';
import { queryLlm } from '../../ai/aiService';
import { runBrowserAgent } from '../../ai/browserAgent';
import { getCredentialById } from '../../storage/credentialStore';
import {
  formatAiAgentDocument,
  AiAgentOutputFormat,
  createExportDocument,
  zipVariablesToDataset,
  ExportDataFormat,
} from '../../utils/documentExporter';
import { runInSandbox, safeEvaluateMath } from '../sandboxEvaluator';
import {
  processDataset,
  normalizeUrl,
  cleanPrice,
  formatDateString,
} from '../../utils/dataPostProcessor';

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
    items = items.filter((row: any) => {
      if (!row || typeof row !== 'object') return false;
      const keys = Object.keys(row);
      if (keys.length === 0) return false;
      if (filterEmptyMode === 'any') {
        return !keys.some((k) => isValEmpty(row[k]));
      } else {
        return !keys.every((k) => isValEmpty(row[k]));
      }
    });
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
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    try {
      return await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs,
      });
    } catch (e) {
      console.warn('[AutoFlow] Chrome download API failed, falling back to DOM anchor:', e);
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 200);
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

export const executors: Record<string, NodeExecutor> = {
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
  telegram_message: executeTelegramMessage,
  discord_message: executeDiscordMessage,
  slack_message: executeSlackMessage,
  stop_timer: executeStopTimer,
  reset_timer: executeResetTimer,
  stop_workflow: executeStopWorkflow,
  pause_workflow: executePauseWorkflow,
  skip_to: executeSkipTo,
};



