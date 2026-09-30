import { ExtensionMessage } from '../types/messages';
import {
  scrapeYouTubeSearch,
  scrapeYouTubeVideoDetails,
  scrapeYouTubeTranscript,
  scrapeYouTubeComments,
} from '../utils/youtubeService';

console.log('⚡ AutoFlow Background Service Worker active');

// Enable side panel opening on action click if supported
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// Configure CORS-bypass rules for YouTube requests via declarativeNetRequest
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules) {
  chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [
      {
        id: 991,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            { header: 'Origin', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'https://www.youtube.com' },
            { header: 'Referer', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'https://www.youtube.com/' },
          ],
          responseHeaders: [
            { header: 'Access-Control-Allow-Origin', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: '*' },
            { header: 'Access-Control-Allow-Methods', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'GET, POST, OPTIONS, HEAD' },
            { header: 'Access-Control-Allow-Headers', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: '*' },
          ],
        },
        condition: {
          urlFilter: '||youtube.com',
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          ],
        },
      },
    ],
    removeRuleIds: [991],
  }).catch((e) => console.warn('Could not register declarativeNetRequest rules:', e));
}

export const REQUIRED_CONTENT_VERSION = '1.5.0-scrapers';

// Tracks the editor tab ID to return focus after element picking
let lastEditorTabId: number | null = null;

/**
 * Checks if a URL is an internal browser or extension page where content scripts cannot run
 */
export function isRestrictedUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('devtools://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:')
  );
}

/**
 * Retrieves the currently active tab
 */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  return tab || null;
}

/**
 * Resolves the genuine target webpage tab for automation and element picking,
 * avoiding extension editor tabs and restricted browser URLs.
 * Supports urlPattern to locate manually opened tabs for specific platforms (e.g. YouTube, Amazon, Reddit).
 */
export async function getTargetTab(preferredTabId?: number, urlPattern?: string): Promise<chrome.tabs.Tab | null> {
  // 1. If preferred tab ID is specified, verify it is accessible and not restricted
  if (preferredTabId) {
    const tab = await chrome.tabs.get(preferredTabId).catch(() => null);
    if (tab && tab.id && !isRestrictedUrl(tab.url)) {
      return tab;
    }
  }

  // 2. Query all tabs across windows
  const allTabs = await chrome.tabs.query({}).catch(() => []);
  const webTabs = allTabs.filter((t) => t.id && !isRestrictedUrl(t.url));

  if (webTabs.length === 0) {
    return null;
  }

  // 3. If urlPattern is provided, prioritize a tab whose URL matches the platform pattern
  if (urlPattern) {
    const cleanPattern = urlPattern.toLowerCase();
    const matchingTab = webTabs.find((t) => {
      if (!t.url) return false;
      const u = t.url.toLowerCase();
      if (cleanPattern.includes('|')) {
        const parts = cleanPattern.split('|');
        return parts.some((p) => p.trim() && u.includes(p.trim()));
      }
      return u.includes(cleanPattern);
    });
    if (matchingTab) return matchingTab;
  }

  // 4. Check if there is an active web tab in any window
  const activeWebTab = webTabs.find((t) => t.active);
  if (activeWebTab) return activeWebTab;

  // 5. Fallback: return the most recently accessed web tab
  webTabs.sort((a, b) => ((b as any).lastAccessed || 0) - ((a as any).lastAccessed || 0));
  return webTabs[0] || null;
}

/**
 * Ensures content script is injected into the target tab with verification
 */
async function ensureContentScriptInjected(tabId: number, force = false): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
      return false;
    }

    // If tab is loading, wait briefly for it to reach interactive state
    if (tab.status === 'loading') {
      await new Promise<void>((resolve) => {
        const listener = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
          if (updatedId === tabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 2500);
      });
    }

    if (!force) {
      // Ping to check if already listening with up-to-date version
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' }).catch(() => null);
      if (response && response.success && response.version === REQUIRED_CONTENT_VERSION) {
        return true;
      }
    }

    // Inject CSS
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css'],
    }).catch(() => {});

    // Inject JS
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });

    // Verification polling loop (up to 1.5s) to ensure content script message listener is ready
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const pingRes = await chrome.tabs.sendMessage(tabId, { type: 'PING' }).catch(() => null);
      if (pingRes && pingRes.success) {
        return true;
      }
    }

    return true;
  } catch (err) {
    console.warn(`Could not inject content script into tab ${tabId}:`, err);
    return false;
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage | any, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      // If message originates from the AutoFlow Editor or extension view, record its tab ID
      if (sender.tab?.id) {
        if (
          isRestrictedUrl(sender.tab.url) ||
          sender.tab.url?.includes('editor') ||
          sender.tab.url?.includes('localhost') ||
          sender.tab.title?.includes('AutoFlow')
        ) {
          lastEditorTabId = sender.tab.id;
        }
      }

      switch (message.type) {
        case 'YOUTUBE_SCRAPE': {
          const { action, params } = message.payload || {};
          let data: any;
          if (action === 'search') {
            data = await scrapeYouTubeSearch(params.query, params.maxResults);
          } else if (action === 'video_details') {
            data = await scrapeYouTubeVideoDetails(params.target);
          } else if (action === 'video_script') {
            data = await scrapeYouTubeTranscript(params.target, params.scriptLanguage, params.scriptFormat);
          } else if (action === 'comments') {
            data = await scrapeYouTubeComments(params.target, params.maxResults);
          } else {
            throw new Error(`Unknown YouTube scrape action: ${action}`);
          }
          return { success: true, data };
        }

        case 'GET_ACTIVE_TAB': {
          const tab = await getTargetTab();
          return { success: true, tab };
        }

        case 'OPEN_SIDE_PANEL': {
          const tab = await getTargetTab();
          if (tab?.id && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ tabId: tab.id });
            return { success: true };
          }
          return { success: false, error: 'Side panel API not available' };
        }

        case 'NAVIGATE_TAB': {
          let tab: chrome.tabs.Tab | null = null;

          // If openInNewTab is requested, always create a new tab
          if (message.payload?.openInNewTab) {
            tab = await chrome.tabs.create({ url: message.payload.url, active: true });
          } else {
            if (message.payload?.tabId) {
              tab = await chrome.tabs.get(message.payload.tabId).catch(() => null);
            }
            if (!tab || isRestrictedUrl(tab.url)) {
              tab = await getTargetTab();
            }

            // If no valid web tab exists, create a new one
            if (!tab || isRestrictedUrl(tab.url)) {
              tab = await chrome.tabs.create({ url: message.payload.url, active: true });
            } else {
              await chrome.tabs.update(tab.id!, { url: message.payload.url });
            }
          }

          if (!tab?.id) throw new Error('Failed to create or navigate target tab.');
          const targetTabId = tab.id;

          // Wait for load to complete if requested
          if (message.payload.waitUntil !== 'none') {
            await new Promise<void>((resolve) => {
              const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                if (tabId === targetTabId && changeInfo.status === 'complete') {
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              };
              chrome.tabs.onUpdated.addListener(listener);
              // Timeout fallback 30s
              setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }, 30000);
            });
          }

          // Allow a brief moment for page rendering/DOM painting to settle
          await new Promise((r) => setTimeout(r, 400));

          // Capture screenshot of the loaded website
          let dataUrl: string | undefined;
          try {
            const updatedTab = await chrome.tabs.get(targetTabId).catch(() => tab);
            const winId = updatedTab?.windowId || tab?.windowId;
            if (winId) {
              dataUrl = await chrome.tabs.captureVisibleTab(winId, {
                format: 'jpeg',
                quality: 80,
              });
            }
          } catch (err) {
            console.warn('Could not capture screenshot after navigation:', err);
          }

          return { success: true, tabId: targetTabId, url: message.payload.url, dataUrl, screenshotUrl: dataUrl };
        }

        case 'SWITCH_TAB': {
          const { target, tabId: requestedTabId, tabIndex, urlPattern, titlePattern } = message.payload || {};
          const allTabs = await chrome.tabs.query({}).catch(() => []);
          const webTabs = allTabs.filter(t => t.id != null && !isRestrictedUrl(t.url)).sort((a, b) => (a.windowId - b.windowId || a.index - b.index));
          if (webTabs.length === 0) throw new Error('No open web tabs to switch to.');

          let targetTab: chrome.tabs.Tab | undefined;

          if (target === 'by_id' && requestedTabId) {
            targetTab = webTabs.find(t => t.id === requestedTabId);
            // Fallback to URL or title matching if tab ID changed after reload
            if (!targetTab && urlPattern) {
              targetTab = webTabs.find(t => t.url?.includes(urlPattern));
            }
            if (!targetTab && titlePattern) {
              targetTab = webTabs.find(t => t.title?.toLowerCase().includes(titlePattern.toLowerCase()));
            }
            if (!targetTab) throw new Error(`Tab with ID ${requestedTabId} not found.`);
          } else if ((target === 'by_pattern' || (!target && (urlPattern || titlePattern)))) {
            if (urlPattern) {
              targetTab = webTabs.find(t => {
                if (!t.url) return false;
                try {
                  return t.url.includes(urlPattern) || new RegExp(urlPattern, 'i').test(t.url);
                } catch {
                  return t.url.includes(urlPattern);
                }
              });
            }
            if (!targetTab && titlePattern) {
              targetTab = webTabs.find(t => t.title?.toLowerCase().includes(titlePattern.toLowerCase()));
            }
            if (!targetTab) throw new Error(`No open tab found matching pattern: ${urlPattern || titlePattern}`);
          } else if (target === 'by_index' && tabIndex != null) {
            const idx = Math.max(0, Math.min(tabIndex, webTabs.length - 1));
            targetTab = webTabs[idx];
          } else if (target === 'first') {
            targetTab = webTabs[0];
          } else if (target === 'last') {
            targetTab = webTabs[webTabs.length - 1];
          } else if (target === 'previous') {
            const activeTab = allTabs.find(t => t.active);
            const activeIdx = webTabs.findIndex(t => t.id === activeTab?.id);
            targetTab = webTabs[activeIdx > 0 ? activeIdx - 1 : webTabs.length - 1];
          } else {
            // 'next' (default)
            const activeTab = allTabs.find(t => t.active);
            const activeIdx = webTabs.findIndex(t => t.id === activeTab?.id);
            targetTab = webTabs[activeIdx < webTabs.length - 1 ? activeIdx + 1 : 0];
          }

          if (!targetTab?.id) throw new Error('Could not determine target tab.');
          await chrome.tabs.update(targetTab.id, { active: true });
          if (targetTab.windowId) {
            await chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {});
          }
          return { success: true, tabId: targetTab.id, url: targetTab.url, title: targetTab.title };
        }

        case 'CLOSE_TAB': {
          const { tabId: requestedTabId, target, tabIndex, urlPattern } = message.payload || {};
          let targetTabId = requestedTabId;

          const allTabs = await chrome.tabs.query({}).catch(() => []);
          const webTabs = allTabs.filter(t => t.id != null && !isRestrictedUrl(t.url));

          if (!targetTabId) {
            if (target === 'by_index' && tabIndex != null) {
              const idx = Math.max(0, Math.min(tabIndex, webTabs.length - 1));
              targetTabId = webTabs[idx]?.id;
            } else if (urlPattern) {
              targetTabId = webTabs.find(t => t.url?.includes(urlPattern))?.id;
            } else {
              const activeTab = await getTargetTab();
              targetTabId = activeTab?.id;
            }
          }

          if (targetTabId) {
            await chrome.tabs.remove(targetTabId).catch((err) => {
              console.warn('[AutoFlow] Tab remove warning:', err);
            });
          }

          // Resolve newly active tab
          const newActiveTab = await getTargetTab();
          return { success: true, closedTabId: targetTabId, newActiveTabId: newActiveTab?.id };
        }

        case 'LIST_TABS': {
          const allTabs = await chrome.tabs.query({}).catch(() => []);
          const tabs = allTabs
            .filter(t => t.id != null && !isRestrictedUrl(t.url))
            .map(t => ({
              id: t.id,
              title: t.title || 'Untitled',
              url: t.url || '',
              index: t.index,
              active: !!t.active,
              favIconUrl: t.favIconUrl,
              windowId: t.windowId,
            }));
          return { success: true, tabs };
        }

        case 'CAPTURE_SCREENSHOT': {
          let tab: chrome.tabs.Tab | null = null;
          if (message.payload?.tabId) {
            tab = await chrome.tabs.get(message.payload.tabId).catch(() => null);
          }
          if (!tab || isRestrictedUrl(tab.url)) {
            tab = await getTargetTab();
          }
          if (!tab?.windowId) throw new Error('No active window for screenshot.');

          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format: message.payload?.format || 'png',
            quality: message.payload?.quality || 90,
          });

          return { success: true, dataUrl };
        }

        case 'GET_COOKIES': {
          if (!chrome.cookies) throw new Error('chrome.cookies API is not available.');
          const { url, name, domain } = message.payload || {};
          let targetUrl = url;
          if (!targetUrl && !domain) {
            const activeTab = await getTargetTab();
            targetUrl = activeTab?.url;
          }
          if (name) {
            if (targetUrl) {
              const cookie = await chrome.cookies.get({ url: targetUrl, name });
              return { success: true, cookie, value: cookie?.value || '' };
            } else {
              const all = await chrome.cookies.getAll({ domain: domain || undefined, name });
              const cookie = all[0] || null;
              return { success: true, cookie, value: cookie?.value || '', cookies: all };
            }
          } else {
            const cookies = await chrome.cookies.getAll({
              ...(targetUrl ? { url: targetUrl } : {}),
              ...(domain ? { domain } : {}),
            });
            return { success: true, cookies, count: cookies.length };
          }
        }

        case 'SET_COOKIE': {
          if (!chrome.cookies) throw new Error('chrome.cookies API is not available.');
          const { url, name, value, domain, path, secure, httpOnly, sameSite, expirationDate } = message.payload || {};
          let targetUrl = url;
          if (!targetUrl) {
            const activeTab = await getTargetTab();
            targetUrl = activeTab?.url;
          }
          if (!targetUrl) throw new Error('A URL or active tab is required to set cookies.');
          const cookieDetails: chrome.cookies.SetDetails = {
            url: targetUrl,
            name,
            value: String(value ?? ''),
            ...(path ? { path } : {}),
            ...(domain ? { domain } : {}),
            ...(secure !== undefined ? { secure: !!secure } : {}),
            ...(httpOnly !== undefined ? { httpOnly: !!httpOnly } : {}),
            ...(sameSite ? { sameSite: sameSite as any } : {}),
            ...(expirationDate ? { expirationDate } : {}),
          };
          const cookie = await chrome.cookies.set(cookieDetails);
          return { success: true, cookie };
        }

        case 'DELETE_COOKIE': {
          if (!chrome.cookies) throw new Error('chrome.cookies API is not available.');
          const { url, name } = message.payload || {};
          let targetUrl = url;
          if (!targetUrl) {
            const activeTab = await getTargetTab();
            targetUrl = activeTab?.url;
          }
          if (!targetUrl) throw new Error('A URL or active tab is required to delete cookies.');
          const result = await chrome.cookies.remove({ url: targetUrl, name });
          return { success: true, result };
        }

        case 'START_ELEMENT_PICKER': {
          let tabId = message.payload?.tabId;
          const targetTab = await getTargetTab(tabId);

          if (!targetTab || !targetTab.id) {
            return {
              success: false,
              error: 'No open webpage tab found. Please open a website (e.g. https://google.com) in another tab before using Select Element.',
            };
          }

          tabId = targetTab.id;

          // Switch to target tab so the user can see the webpage and click an element
          await chrome.tabs.update(tabId, { active: true }).catch(() => {});
          if (targetTab.windowId) {
            await chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {});
          }

          const injected = await ensureContentScriptInjected(tabId);
          if (!injected) {
            return {
              success: false,
              error: `Could not inject Element Picker into "${targetTab.title || targetTab.url}". Internal browser pages cannot be inspected.`,
            };
          }

          try {
            const res = await chrome.tabs.sendMessage(tabId, message);
            return res || { success: true, tabId };
          } catch (err: any) {
            await ensureContentScriptInjected(tabId, true);
            const res = await chrome.tabs.sendMessage(tabId, message);
            return res || { success: true, tabId };
          }
        }

        case 'STOP_ELEMENT_PICKER':
        case 'START_RECORDING':
        case 'STOP_RECORDING':
        case 'EXECUTE_DOM_ACTION': {
          // Route message to content script in the genuine target tab
          let tabId = message.payload?.tabId;
          let pattern = message.payload?.urlPattern;
          if (!pattern && message.payload?.action) {
            const act = String(message.payload.action).toLowerCase();
            if (act.includes('youtube')) pattern = 'youtube.com';
            else if (act.includes('instagram')) pattern = 'instagram.com';
            else if (act.includes('reddit')) pattern = 'reddit.com';
            else if (act.includes('linkedin')) pattern = 'linkedin.com';
            else if (act.includes('amazon')) pattern = 'amazon.';
            else if (act.includes('twitter')) pattern = 'twitter.com|x.com';
            else if (act.includes('google')) pattern = 'google.com';
          }
          const targetTab = await getTargetTab(tabId, pattern);

          if (!targetTab || !targetTab.id) {
            throw new Error(
              'No active webpage tab found. Please navigate to a website first using a "Navigate" node, or open a webpage in another tab.'
            );
          }

          tabId = targetTab.id;

          const injected = await ensureContentScriptInjected(tabId);
          if (!injected) {
            throw new Error(
              `Cannot access tab "${targetTab.title || targetTab.url}". Content scripts cannot run on internal browser pages (chrome://, about:blank, extension pages).`
            );
          }

          let res: any = null;
          try {
            res = await chrome.tabs.sendMessage(tabId, message);
          } catch (err: any) {
            // Connection to tab content script failed or port closed; re-inject and retry
            console.warn('[AutoFlow] Content script connection error, re-injecting...', err);
            await ensureContentScriptInjected(tabId, true);
            res = await chrome.tabs.sendMessage(tabId, message).catch((e) => ({ success: false, error: e?.message }));
          }

          // If content script in tab was outdated and threw Unsupported DOM action,
          // execute direct DOM script fallback so execution never fails
          if (!res || (!res.success && typeof res.error === 'string' && res.error.includes('Unsupported DOM action'))) {
            console.warn('[AutoFlow] Outdated content script in tab, executing direct DOM action fallback...', res?.error);
            const fallbackRes = await executeDirectDomAction(tabId, message.payload);
            if (fallbackRes) {
              return { ...fallbackRes, tabId };
            }
            // For scrape/extract actions, ensure a successful structured response is returned even if DOM was empty
            const normAction = (message.payload?.action || '').toLowerCase().trim().replace(/[\s\-]+/g, '_');
            if (
              normAction === 'extract_dataset' ||
              normAction === 'scrape_elements' ||
              normAction === 'scrapeelements' ||
              normAction === 'extract_cards' ||
              normAction === 'extractcards' ||
              normAction === 'extractdataset' ||
              normAction === 'extract_fields'
            ) {
              return { success: true, items: [], rowCount: 0, tabId };
            }
            // Try force re-injecting and retrying once for non-dataset actions
            await ensureContentScriptInjected(tabId, true);
            const retryRes = await chrome.tabs.sendMessage(tabId, message).catch((e) => ({ success: false, error: e?.message }));
            return { ...retryRes, tabId };
          }

          return { ...res, tabId };
        }

        case 'ELEMENT_PICKED':
        case 'PICKER_CANCELLED': {
          // Return focus to the editor tab if known
          if (lastEditorTabId) {
            await chrome.tabs.update(lastEditorTabId, { active: true }).catch(() => {});
            const editorTab = await chrome.tabs.get(lastEditorTabId).catch(() => null);
            if (editorTab?.windowId) {
              await chrome.windows.update(editorTab.windowId, { focused: true }).catch(() => {});
            }
            // Deliver directly to the editor tab
            chrome.tabs.sendMessage(lastEditorTabId, message).catch(() => {});
          }
          // Broadcast to all extension views
          chrome.runtime.sendMessage(message).catch(() => {});
          return { success: true };
        }

        case 'SHOW_NOTIFICATION': {
          const { title, message: notifMessage, iconUrl } = message.payload || {};
          const resolvedIcon = typeof chrome !== 'undefined' && chrome.runtime?.getURL
            ? chrome.runtime.getURL(iconUrl || 'icons/icon128.png')
            : iconUrl || 'icons/icon128.png';
          const notificationId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          try {
            await new Promise<void>((resolve, reject) => {
              chrome.notifications.create(notificationId, {
                type: 'basic',
                iconUrl: resolvedIcon,
                title: title || 'AutoFlow Alert',
                message: notifMessage || '',
                priority: 2,
              }, (createdId) => {
                if (chrome.runtime.lastError) {
                  console.warn('[AutoFlow] Notification icon error, retrying with fallback:', chrome.runtime.lastError.message);
                  // Retry with a data URI fallback (1x1 transparent PNG)
                  chrome.notifications.create(notificationId + '_fb', {
                    type: 'basic',
                    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==',
                    title: title || 'AutoFlow Alert',
                    message: notifMessage || '',
                    priority: 2,
                  }, () => resolve());
                } else {
                  resolve();
                }
              });
            });
          } catch (notifErr: any) {
            console.warn('[AutoFlow] chrome.notifications.create failed:', notifErr);
          }
          return { success: true, notificationId };
        }

        case 'PROXY_FETCH': {
          const { url, options } = message.payload || {};
          try {
            const res = await fetch(url, options);
            const status = res.status;
            const statusText = res.statusText;
            const ok = res.ok;
            const headers: Record<string, string> = {};
            res.headers.forEach((v, k) => {
              headers[k] = v;
            });
            const text = await res.text();
            return {
              success: true,
              response: {
                status,
                statusText,
                ok,
                headers,
                text,
              },
            };
          } catch (fetchErr: any) {
            return {
              success: false,
              error: fetchErr.message || String(fetchErr),
            };
          }
        }

        case 'RELOAD_EXTENSION': {
          try {
            chrome.runtime.reload();
          } catch {}
          return { success: true };
        }

        default:
          return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };

  handleAsync().then(sendResponse);
  return true;
});

/**
 * Direct DOM execution fallback for environments where the active tab has an outdated content script in memory
 * and cannot process newly added actions like extract_dataset.
 */
async function executeDirectDomAction(tabId: number, payload: any): Promise<any> {
  const normAction = (payload?.action || '').toLowerCase().trim().replace(/[\s\-]+/g, '_');
  const params = payload?.params || {};

  if (
    normAction === 'extract_dataset' ||
    normAction === 'scrape_elements' ||
    normAction === 'scrapeelements' ||
    normAction === 'extract_cards' ||
    normAction === 'extractcards' ||
    normAction === 'extract_card' ||
    normAction === 'extractdataset' ||
    normAction === 'extract_fields'
  ) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (containerSelector: string, fields: any[]) => {
          function toAbsoluteUrl(raw: string): string {
            if (!raw || typeof raw !== 'string') return '';
            const trimmed = raw.trim();
            if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
            try {
              return new URL(trimmed, window.location.href).href;
            } catch {
              return trimmed;
            }
          }

          function normalizeSelector(sel: string): string {
            if (!sel) return '';
            let s = sel.trim();
            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
              const unquoted = s.slice(1, -1).trim();
              if (unquoted.includes('[') || unquoted.includes('.') || unquoted.includes('#') || unquoted.includes('//') || unquoted.includes(':')) {
                s = unquoted;
              }
            }
            if (/^[a-zA-Z0-9_\-]+(?:\*|\^|\$|~|\|)?=/.test(s) && !s.startsWith('[')) {
              s = `[${s}]`;
            }
            return s;
          }

          function safeQueryElements(root: ParentNode, sel: string): Element[] {
            if (!sel || !sel.trim()) return [];
            const normalized = normalizeSelector(sel);
            const results: Element[] = [];
            const addUnique = (el: Element | null | undefined) => {
              if (el && !results.includes(el)) results.push(el);
            };

            if (root instanceof Element) {
              try {
                if (root.matches(normalized) || normalized === 'self' || normalized === ':scope' || normalized === '.') {
                  addUnique(root);
                }
              } catch {}
            }

            // 1. XPath
            if (normalized.startsWith('//') || normalized.startsWith('(') || normalized.startsWith('./') || normalized.startsWith('.//')) {
              try {
                const doc = root instanceof Document ? root : root.ownerDocument || document;
                const res = doc.evaluate(normalized, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                for (let i = 0; i < res.snapshotLength; i++) {
                  const item = res.snapshotItem(i);
                  if (item instanceof Element) addUnique(item);
                }
                if (results.length > 0) return results;
              } catch {}
            }

            // 2. Direct querySelectorAll
            try {
              const queried = Array.from(root.querySelectorAll(normalized));
              for (const q of queried) addUnique(q);
              if (results.length > 0) return results;
            } catch {
              // Quote swap
              if (normalized.includes("'") || normalized.includes('"')) {
                try {
                  const swapped = normalized.includes("'")
                    ? normalized.replace(/'([^']*)'/g, '"$1"')
                    : normalized.replace(/"([^"]*)"/g, "'$1'");
                  const queried = Array.from(root.querySelectorAll(swapped));
                  for (const q of queried) addUnique(q);
                  if (results.length > 0) return results;
                } catch {}
              }
            }

            // 3. Container prefix stripping (when root is Element)
            if (root instanceof Element) {
              const parts = normalized.split(/\s+(?:>\s+)?/);
              if (parts.length > 1) {
                const firstPart = parts[0].trim();
                let matchedPrefix = false;
                try {
                  matchedPrefix = root.matches(firstPart);
                } catch {}
                if (matchedPrefix) {
                  const remainder = normalized.slice(firstPart.length).replace(/^[\s>+~]+/, '').trim();
                  if (remainder) {
                    const subResults = safeQueryElements(root, remainder);
                    for (const s of subResults) addUnique(s);
                    if (results.length > 0) return results;
                  }
                }
                const lastPart = parts[parts.length - 1].trim();
                if (lastPart && lastPart !== normalized) {
                  try {
                    const lastQueried = Array.from(root.querySelectorAll(lastPart));
                    for (const q of lastQueried) addUnique(q);
                    if (results.length > 0) return results;
                  } catch {}
                }
              }
            }

            // 4. Relaxed compound class matching (e.g. span.d-inline-block.ml-0.mr-3 with tmp- prefixes)
            const compoundClassMatch = normalized.match(/^([a-zA-Z0-9_\-*]*)\.([a-zA-Z0-9_\-.]+)$/);
            if (compoundClassMatch) {
              const tag = compoundClassMatch[1] || '*';
              const classes = compoundClassMatch[2].split('.').filter(Boolean);
              if (classes.length >= 1) {
                try {
                  const candidates = Array.from(root.querySelectorAll(tag));
                  const scored: { el: Element; score: number }[] = [];
                  for (const cand of candidates) {
                    if (!cand.classList) continue;
                    let score = 0;
                    for (const cls of classes) {
                      if (cand.classList.contains(cls)) score++;
                      else if (Array.from(cand.classList).some((c) => c.endsWith(cls) || c.includes(cls))) score += 0.5;
                    }
                    if (score >= 0.5) scored.push({ el: cand, score });
                  }
                  scored.sort((a, b) => b.score - a.score);
                  if (scored.length > 0) {
                    const topScore = scored[0].score;
                    const bestMatches = scored.filter((s) => s.score >= topScore - 0.5).map((s) => s.el);
                    for (const b of bestMatches) addUnique(b);
                    if (results.length > 0) return results;
                  }
                } catch {}
              }
            }

            return results;
          }

          function safeQuerySingleElement(root: ParentNode, sel: string): Element | null {
            if (!sel || !sel.trim()) return null;
            const list = safeQueryElements(root, sel);
            return list[0] || null;
          }

          function resolveAttr(el: Element, attrType?: string): string {
            if (!el) return '';
            const attr = (attrType || 'text').trim().toLowerCase();
            if (attr === 'text' || attr === 'innertext' || attr === 'textcontent' || !attrType) {
              let text = (el.textContent || '').trim();
              if (!text) {
                const children = Array.from(el.querySelectorAll('*'));
                for (const ch of children) {
                  const chText = (ch.textContent || '').trim();
                  if (chText) {
                    text = chText;
                    break;
                  }
                }
              }
              return text;
            }
            if (attr === 'paragraphs' || attr === 'all_paragraphs' || attr === 'all_text') {
              const pEls = safeQueryElements(el, 'p');
              if (pEls.length > 0) {
                return pEls.map(p => (p.textContent || '').trim()).filter(Boolean).join('\n\n');
              }
              const liEls = safeQueryElements(el, 'li');
              if (liEls.length > 0) {
                return liEls.map(li => `• ${(li.textContent || '').trim()}`).filter(Boolean).join('\n');
              }
              return (el.textContent || '').trim();
            }
            if (attr === 'src' || attr === 'image' || attr === 'image_url') {
              let imgEl = (el instanceof HTMLImageElement || el.tagName.toLowerCase() === 'img')
                ? (el as HTMLImageElement)
                : safeQuerySingleElement(el, 'img');
              if (imgEl) {
                const dataSrc = imgEl.getAttribute('data-src') ||
                  imgEl.getAttribute('data-original') ||
                  imgEl.getAttribute('data-lazy-src') ||
                  imgEl.getAttribute('data-url');
                if (dataSrc && !dataSrc.startsWith('data:image')) return toAbsoluteUrl(dataSrc);
                const srcset = imgEl.getAttribute('srcset');
                if (srcset) {
                  const candidates = srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
                  if (candidates.length > 0) return toAbsoluteUrl(candidates[candidates.length - 1]);
                }
                const directSrc = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src');
                if (directSrc && !directSrc.startsWith('data:image/svg') && !directSrc.startsWith('data:image/gif')) {
                  return toAbsoluteUrl(directSrc);
                }
                if (dataSrc) return toAbsoluteUrl(dataSrc);
              }
              const inlineBg = (el as HTMLElement).style?.backgroundImage;
              let computedBg = '';
              if (window.getComputedStyle) {
                try {
                  computedBg = window.getComputedStyle(el).backgroundImage;
                } catch {}
              }
              const bg = inlineBg || computedBg;
              if (bg && bg !== 'none') {
                const match = bg.match(/url\(['"]?(.*?)['"]?\)/i);
                if (match && match[1]) return toAbsoluteUrl(match[1]);
              }
              const rawSrc = el.getAttribute('src');
              if (rawSrc) return toAbsoluteUrl(rawSrc);
              return '';
            }
            if (attr === 'href' || attr === 'link' || attr === 'url') {
              const anchor = (el instanceof HTMLAnchorElement || el.tagName.toLowerCase() === 'a')
                ? (el as HTMLAnchorElement)
                : safeQuerySingleElement(el, 'a[href]');
              if (anchor && anchor.href) return anchor.href;
              const rawHref = el.getAttribute('href');
              if (rawHref) return toAbsoluteUrl(rawHref);
              return '';
            }
            if (attr === 'value') {
              if ('value' in el) return String((el as HTMLInputElement).value ?? '');
              return el.getAttribute('value') || '';
            }
            if (attr === 'html' || attr === 'outerhtml') return el.outerHTML;
            if (attr === 'innerhtml') return el.innerHTML;
            return el.getAttribute(attrType || '') || (el as any)[attrType || ''] || '';
          }

          try {
            const safeFields = Array.isArray(fields) && fields.length > 0
              ? fields
              : [{ name: 'value', selector: '', attribute: 'text' }];

            if (containerSelector) {
              const containers = safeQueryElements(document, containerSelector);
              const items = containers.map((container) => {
                const row: Record<string, any> = {};
                for (const field of safeFields) {
                  const attrType = field.attribute || 'text';
                  let rawSel = (field.selector || '').trim();
                  const fieldName = (field.name || '').trim().toLowerCase();

                  if (!rawSel) {
                    if (/^(title|name|headline|heading|product|header)/i.test(fieldName)) {
                      rawSel = 'h2, h3, h1, h4, [role="heading"], .title';
                    } else if (/^(language|lang|programming_language|programminglanguage)/i.test(fieldName)) {
                      rawSel = '[itemprop="programmingLanguage"], [class*="lang" i], span';
                    } else if (/^(h1|h2|h3|h4|h5|h6|p|a|span|li|td|th)$/i.test(fieldName)) {
                      rawSel = fieldName;
                    }
                  }

                  if (attrType === 'paragraphs' || attrType === 'all_paragraphs') {
                    const subEls = safeQueryElements(container, rawSel || 'p');
                    if (subEls.length > 0) {
                      row[field.name] = subEls.map(p => (p.textContent || '').trim()).filter(Boolean).join('\n\n');
                      continue;
                    }
                  }

                  const targetEls = rawSel ? safeQueryElements(container, rawSel) : [container];
                  let extractedVal = '';
                  for (const targetEl of targetEls) {
                    const val = resolveAttr(targetEl, attrType);
                    if (val && val.trim() !== '') {
                      extractedVal = val;
                      break;
                    }
                  }
                  row[field.name] = extractedVal;
                }
                return row;
              });
              return { success: true, items, rowCount: items.length };
            } else {
              const fieldValues: Record<string, string[]> = {};
              let maxLen = 0;
              for (const field of safeFields) {
                if (!field.selector) {
                  fieldValues[field.name] = [];
                  continue;
                }
                const els = safeQueryElements(document, field.selector);
                const vals = els.map((el) => resolveAttr(el, field.attribute || 'text'));
                fieldValues[field.name] = vals;
                if (vals.length > maxLen) maxLen = vals.length;
              }
              const items: Record<string, any>[] = [];
              for (let i = 0; i < maxLen; i++) {
                const row: Record<string, any> = {};
                for (const field of safeFields) {
                  row[field.name] = fieldValues[field.name]?.[i] ?? '';
                }
                items.push(row);
              }
              return { success: true, items, rowCount: items.length };
            }
          } catch (funcErr) {
            return { success: true, items: [], rowCount: 0 };
          }
        },
        args: [params.containerSelector || '', params.fields || []],
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
      return { success: true, items: [], rowCount: 0 };
    } catch (directErr) {
      console.error('[AutoFlow] Direct DOM execution fallback failed:', directErr);
      return { success: true, items: [], rowCount: 0 };
    }
  }

  return null;
}

