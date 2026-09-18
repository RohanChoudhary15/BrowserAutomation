import { ExtensionMessage } from '../types/messages';

console.log('⚡ AutoFlow Background Service Worker active');

// Enable side panel opening on action click if supported
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

/**
 * Ensures content script is injected into the target tab
 */
async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    // Ping to check if already listening
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' }).catch(() => null);
    if (response && response.success) {
      return true;
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

    // Wait a brief moment for script initialization
    await new Promise(r => setTimeout(r, 150));
    return true;
  } catch (err) {
    console.warn(`Could not inject content script into tab ${tabId}:`, err);
    return false;
  }
}

/**
 * Retrieves the currently active tab
 */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage | any, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      switch (message.type) {
        case 'GET_ACTIVE_TAB': {
          const tab = await getActiveTab();
          return { success: true, tab };
        }

        case 'OPEN_SIDE_PANEL': {
          const tab = await getActiveTab();
          if (tab?.id && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ tabId: tab.id });
            return { success: true };
          }
          return { success: false, error: 'Side panel API not available' };
        }

        case 'NAVIGATE_TAB': {
          const tab = message.payload.tabId ? await chrome.tabs.get(message.payload.tabId) : await getActiveTab();
          if (!tab?.id) throw new Error('No target tab found.');

          await chrome.tabs.update(tab.id, { url: message.payload.url });

          // Wait for load to complete if requested
          if (message.payload.waitUntil !== 'none') {
            await new Promise<void>((resolve) => {
              const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
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
            const updatedTab = await chrome.tabs.get(tab.id).catch(() => tab);
            const winId = updatedTab?.windowId || tab.windowId;
            if (winId) {
              dataUrl = await chrome.tabs.captureVisibleTab(winId, {
                format: 'jpeg',
                quality: 80,
              });
            }
          } catch (err) {
            console.warn('Could not capture screenshot after navigation:', err);
          }

          return { success: true, tabId: tab.id, url: message.payload.url, dataUrl, screenshotUrl: dataUrl };
        }

        case 'CAPTURE_SCREENSHOT': {
          const tab = message.payload?.tabId ? await chrome.tabs.get(message.payload.tabId) : await getActiveTab();
          if (!tab?.windowId) throw new Error('No active window for screenshot.');

          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format: message.payload?.format || 'png',
            quality: message.payload?.quality || 90,
          });

          return { success: true, dataUrl };
        }

        case 'START_ELEMENT_PICKER':
        case 'STOP_ELEMENT_PICKER':
        case 'START_RECORDING':
        case 'STOP_RECORDING':
        case 'EXECUTE_DOM_ACTION': {
          // Route message to content script in the target tab
          let tabId = message.payload?.tabId;
          if (!tabId) {
            const activeTab = await getActiveTab();
            tabId = activeTab?.id;
          }

          if (!tabId) {
            throw new Error('No active tab available to communicate with.');
          }

          await ensureContentScriptInjected(tabId);
          return await chrome.tabs.sendMessage(tabId, message);
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
