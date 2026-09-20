import './picker.css';
import { startElementPicker, stopElementPicker } from './picker';
import { startActionRecorder, stopActionRecorder } from './recorder';
import * as domActions from './domActions';
import { ExtensionMessage } from '../types/messages';
import { HumanConfig } from '../utils/human';

export const CONTENT_SCRIPT_VERSION = '1.3.0-qol-features';
console.log('🤖 AutoFlow Content Script loaded on', window.location.href, `(v${CONTENT_SCRIPT_VERSION})`);

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Return true if async response is required
  const handleAsync = async () => {
    try {
      switch (message.type) {
        case 'PING':
          return { success: true, url: window.location.href, version: CONTENT_SCRIPT_VERSION };

        case 'START_ELEMENT_PICKER': {
          const pickerMode = (message as any).payload?.mode || 'single';
          startElementPicker(
            (result) => {
              chrome.runtime.sendMessage({
                type: 'ELEMENT_PICKED',
                payload: result,
              });
            },
            () => {
              chrome.runtime.sendMessage({
                type: 'PICKER_CANCELLED',
              });
            },
            pickerMode
          );
          return { success: true };
        }

        case 'STOP_ELEMENT_PICKER':
          stopElementPicker();
          return { success: true };

        case 'START_RECORDING':
          startActionRecorder((action) => {
            chrome.runtime.sendMessage({
              type: 'RECORDED_ACTION',
              payload: {
                ...action,
                url: window.location.href,
              },
            });
          });
          return { success: true };

        case 'STOP_RECORDING':
          stopActionRecorder();
          return { success: true };

        case 'EXECUTE_DOM_ACTION': {
          const { action, params, timeout, human } = message.payload;
          return await executeAction(action, params, timeout, human);
        }

        case 'HIGHLIGHT_ELEMENT': {
          const el = document.querySelector(message.payload.selector);
          if (el instanceof HTMLElement) {
            el.style.outline = '3px solid #6366f1';
            setTimeout(() => {
              el.style.outline = '';
            }, message.payload.durationMs || 1000);
          }
          return { success: true };
        }

        default:
          return { success: false, error: 'Unknown message type in content script' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };

  handleAsync().then(sendResponse);
  return true; // Keep message channel open for async response
});

async function executeAction(
  action: string,
  params: Record<string, any>,
  timeout?: number,
  human?: HumanConfig
): Promise<any> {
  const normAction = (action || '').toLowerCase().trim().replace(/[\s\-]+/g, '_');

  switch (normAction) {
    case 'get_interactive_snapshot':
      return { success: true, elements: domActions.getInteractiveElementsSnapshot() };

    case 'click_at_coordinates':
      return await domActions.clickAtCoordinates(params.x, params.y);

    case 'type_into_element':
      return await domActions.typeIntoElement({ ...params, human });

    case 'click':
    case 'click_element':
      return await domActions.clickElement(
        params.selector,
        {
          clickType: params.clickType,
          timeout: params.timeout || timeout,
          delay: params.delay,
          human,
        },
        undefined
      );

    case 'type_text':
    case 'type':
    case 'input_text':
      return await domActions.typeText(
        params.selector,
        {
          text: params.text,
          clearExisting: params.clearExisting,
          typingDelay: params.typingDelay,
          timeout: params.timeout || timeout,
          human,
        },
        undefined
      );

    case 'clear_input':
    case 'clear':
      return await domActions.clearInput(params.selector, params.timeout || timeout, undefined, human);

    case 'hover':
      return await domActions.hoverElement(params.selector, params.timeout || timeout, undefined, human);

    case 'press_key':
      return await domActions.pressKey(
        params.key,
        params.selector,
        {
          ctrl: params.ctrl,
          alt: params.alt,
          shift: params.shift,
          meta: params.meta,
        },
        human
      );

    case 'scroll':
      return await domActions.scrollPage({
        direction: params.direction,
        amount: params.amount,
        selector: params.selector,
        smooth: params.smooth,
        human,
      });

    case 'select_dropdown':
      return await domActions.selectDropdown(
        params.selector,
        {
          selectionType: params.selectionType,
          value: params.value,
          label: params.label,
          index: params.index,
          timeout: params.timeout || timeout,
          human,
        },
        undefined
      );

    case 'extract_text':
    case 'extracttext':
    case 'text':
      return await domActions.extractText(params.selector, params.timeout || timeout);

    case 'extract_attribute':
    case 'extractattribute':
    case 'attribute':
      return await domActions.extractAttribute(params.selector, params.attribute, params.timeout || timeout);

    case 'extract_html':
    case 'extracthtml':
    case 'html':
      return await domActions.extractHtml(params.selector, params.mode || 'outer', params.timeout || timeout);

    case 'extract_table':
    case 'extracttable':
    case 'table':
      return await domActions.extractTable(params.selector, params.timeout || timeout);

    case 'wait_for_element':
      await domActions.waitForElement(params.selector, {
        timeout: params.timeout || timeout,
        visible: params.visible,
        enabled: params.enabled,
      });
      return { success: true };

    case 'wait_for_text':
      return await domActions.waitForText(params.text, params.selector, params.timeout || timeout);

    case 'check_element_presence':
    case 'contains':
      return await domActions.checkElementPresence(
        params.selector,
        {
          timeout: params.timeout ?? timeout,
          visibleOnly: params.visibleOnly !== false,
          text: params.text,
        },
        undefined
      );

    case 'extract_multiple':
    case 'extractmultiple':
    case 'extract_all':
      return await domActions.extractMultipleElements(params.selector, {
        attribute: params.attribute,
        timeout: params.timeout || timeout,
      });

    case 'extract_links':
    case 'extractlinks':
    case 'extract_urls':
      return await domActions.extractLinks(params.selector, params.timeout || timeout);

    case 'extract_image':
    case 'extract_images':
    case 'extractimage':
    case 'extractimages':
    case 'image':
      return await domActions.extractImageElement(
        params.selector,
        {
          mode: params.mode,
          asBase64: params.asBase64,
          includeBackground: params.includeBackground,
          timeout: params.timeout || timeout,
        },
        undefined
      );

    case 'extract_all_images':
    case 'find_all_images':
    case 'findallimages':
    case 'extractallimages':
    case 'all_images':
      return await domActions.extractAllPageImages(
        {
          containerSelector: params.containerSelector || params.selector,
          includeBackground: params.includeBackground,
          asBase64: params.asBase64,
          minWidth: params.minWidth,
          minHeight: params.minHeight,
          maxImages: params.maxImages,
          timeout: params.timeout || timeout,
        },
        undefined
      );

    case 'storage_manage':
      return await domActions.manageStorage({
        type: params.type,
        action: params.action,
        key: params.key,
        value: params.value,
      });

    case 'clipboard':
      if (params.action === 'read') {
        return await domActions.readClipboard();
      }
      return await domActions.copyToClipboard(params.text || '');

    case 'paste_into_element':
      return await domActions.pasteIntoElement({
        selector: params.selector,
        x: params.x,
        y: params.y,
        text: params.text,
      });

    case 'press_shortcut':
      return await domActions.pressKey(params.shortcut || params.key, params.selector, params.modifiers);

    case 'wait_for_navigation':
      return await domActions.waitForNavigation(params.urlPattern, params.timeout || timeout);

    case 'smart_wait':
      return await domActions.waitForSmartSettle({
        timeout: params.timeout || timeout,
        waitForSelector: params.waitForSelector,
        waitForText: params.waitForText,
        waitForNavigation: params.waitForNavigation,
      });

    default:
      throw new Error(`Unsupported DOM action: ${action}`);
  }
}
