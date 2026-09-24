import { ElementSelectionResult } from './selector';
import { HumanConfig } from '../utils/human';

export interface RecordedActionPayload {
  type: 'navigate' | 'click' | 'type_text' | 'press_key' | 'scroll' | 'select_dropdown';
  timestamp: number;
  properties: Record<string, any>;
  url?: string;
}

export type ExtensionMessage =
  // Tab Management
  | { type: 'GET_ACTIVE_TAB' }
  | { type: 'OPEN_SIDE_PANEL'; payload?: { tabId?: number } }
  | { type: 'NAVIGATE_TAB'; payload: { tabId?: number; url: string; waitUntil?: string; openInNewTab?: boolean } }
  | { type: 'CAPTURE_SCREENSHOT'; payload?: { tabId?: number; format?: 'png' | 'jpeg'; quality?: number } }
  | { type: 'SWITCH_TAB'; payload: { target?: 'next' | 'previous' | 'first' | 'last' | 'by_index' | 'by_id' | 'by_pattern'; tabId?: number; tabIndex?: number; urlPattern?: string; titlePattern?: string } }
  | { type: 'CLOSE_TAB'; payload?: { tabId?: number; target?: 'current' | 'specific' | 'by_index' | 'by_pattern'; tabIndex?: number; urlPattern?: string } }
  | { type: 'LIST_TABS' }

  // Element Picker
  | { type: 'START_ELEMENT_PICKER'; payload?: { tabId?: number; mode?: 'single' | 'pattern_2click' } }
  | { type: 'STOP_ELEMENT_PICKER'; payload?: { tabId?: number } }
  | { type: 'ELEMENT_PICKED'; payload: ElementSelectionResult }
  | { type: 'PICKER_CANCELLED' }

  // Action Recorder
  | { type: 'START_RECORDING'; payload?: { tabId?: number } }
  | { type: 'STOP_RECORDING'; payload?: { tabId?: number } }
  | { type: 'RECORDED_ACTION'; payload: RecordedActionPayload }

  // DOM Action Execution in Content Script
  | {
      type: 'EXECUTE_DOM_ACTION';
      payload: {
        action: string;
        params: Record<string, any>;
        timeout?: number;
        /** Human-like behavior config, forwarded to the content script when Human Mode is on. */
        human?: HumanConfig;
      };
    }
  | {
      type: 'HIGHLIGHT_ELEMENT';
      payload: {
        selector: string;
        durationMs?: number;
      };
    }
  | { type: 'PING' }
  | { type: 'PROXY_FETCH'; payload: { url: string; options?: any } }
  | { type: 'SHOW_NOTIFICATION'; payload: { title: string; message: string; iconUrl?: string } };

export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
