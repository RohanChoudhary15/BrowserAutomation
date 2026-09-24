import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeSwitchTab,
  executeCloseTab,
  executeRegex,
  executeExtractText,
  executeNavigate,
  executeSmartScroll,
} from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('Tabs, Regex, Navigate New Tab & Smart Scroll Speed', () => {
  let mockContext: ExecutionContext;
  let sentMessages: any[] = [];

  beforeEach(() => {
    sentMessages = [];
    mockContext = {
      workflowId: 'test-wf',
      currentTabId: 101,
      currentUrl: 'https://example.com',
      variables: {},
      signal: new AbortController().signal,
      log: vi.fn(),
      updateNodeState: vi.fn(),
      getVariable: (name: string) => mockContext.variables[name],
      setVariable: (name: string, val: any) => {
        mockContext.variables[name] = val;
      },
    };

    // Mock chrome.runtime.sendMessage
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: any) => {
          sentMessages.push(msg);
          if (msg.type === 'SWITCH_TAB') {
            return { success: true, tabId: msg.payload?.tabId || 202, title: 'Target Tab', url: 'https://test.com' };
          }
          if (msg.type === 'CLOSE_TAB') {
            return { success: true, closedTabId: msg.payload?.tabId || 101, newActiveTabId: 202 };
          }
          if (msg.type === 'NAVIGATE_TAB') {
            return { success: true, tabId: msg.payload?.openInNewTab ? 303 : 101, url: msg.payload.url };
          }
          if (msg.type === 'EXECUTE_DOM_ACTION') {
            if (msg.payload.action === 'extract_text') {
              return { success: true, text: 'Order #98765 placed on 2026-09-24, total: $149.99' };
            }
            if (msg.payload.action === 'scroll') {
              return { success: true };
            }
          }
          return { success: true };
        }),
      },
    };
  });

  describe('Switch Tab', () => {
    it('switches to tab by target and updates currentTabId', async () => {
      const node: WorkflowNode = {
        id: 'node_switch',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'switch_tab',
          label: 'Switch Tab',
          properties: {
            tabTarget: 'by_id',
            tabId: 555,
            tabTitle: 'Target Page',
          },
        },
      };

      const result = await executeSwitchTab(node, mockContext);
      expect(result.success).toBe(true);
      expect(sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'SWITCH_TAB',
          payload: expect.objectContaining({ target: 'by_id', tabId: 555 }),
        })
      );
      expect(mockContext.currentTabId).toBe(555);
    });

    it('switches to relative next tab', async () => {
      const node: WorkflowNode = {
        id: 'node_switch_next',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'switch_tab',
          label: 'Switch Tab',
          properties: {
            tabTarget: 'next',
          },
        },
      };

      const result = await executeSwitchTab(node, mockContext);
      expect(result.success).toBe(true);
      expect(sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'SWITCH_TAB',
          payload: expect.objectContaining({ target: 'next' }),
        })
      );
      expect(mockContext.currentTabId).toBe(202);
    });
  });

  describe('Close Tab', () => {
    it('closes current tab and updates active tabId to new active tab', async () => {
      const node: WorkflowNode = {
        id: 'node_close',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'close_tab',
          label: 'Close Tab',
          properties: {
            closeTarget: 'current',
          },
        },
      };

      const result = await executeCloseTab(node, mockContext);
      expect(result.success).toBe(true);
      expect(sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'CLOSE_TAB',
          payload: expect.objectContaining({ tabId: 101, target: 'current' }),
        })
      );
      expect(mockContext.currentTabId).toBe(202);
    });

    it('closes a specific tab when chosen from dropdown', async () => {
      const node: WorkflowNode = {
        id: 'node_close_specific',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'close_tab',
          label: 'Close Tab',
          properties: {
            closeTarget: 'specific',
            tabId: 999,
          },
        },
      };

      const result = await executeCloseTab(node, mockContext);
      expect(result.success).toBe(true);
      expect(sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'CLOSE_TAB',
          payload: expect.objectContaining({ tabId: 999, target: 'specific' }),
        })
      );
    });
  });

  describe('Regex Node', () => {
    it('extracts multiple regex matches with global flag', async () => {
      const node: WorkflowNode = {
        id: 'node_regex',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'regex',
          label: 'Regex',
          properties: {
            text: 'Prices: $19.99, $49.50, and $120.00',
            pattern: '\\$\\d+\\.\\d{2}',
            flags: 'g',
            outputVariable: 'prices',
          },
        },
      };

      const result = await executeRegex(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toEqual(['$19.99', '$49.50', '$120.00']);
      expect(result.variables?.prices).toEqual(['$19.99', '$49.50', '$120.00']);
      expect(result.variables?.prices_first).toBe('$19.99');
    });

    it('handles non-global flag without crashing matchAll', async () => {
      const node: WorkflowNode = {
        id: 'node_regex_noglobal',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'regex',
          label: 'Regex',
          properties: {
            text: 'User ID: 84920 in database',
            pattern: '\\d+',
            flags: 'i', // Notice: no 'g' flag
            outputVariable: 'userId',
          },
        },
      };

      const result = await executeRegex(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toBe('84920');
      expect(result.variables?.userId_first).toBe('84920');
    });

    it('extracts capture group when extractGroup is specified', async () => {
      const node: WorkflowNode = {
        id: 'node_regex_group',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'regex',
          label: 'Regex',
          properties: {
            text: 'Contact: support@example.com or admin@domain.org',
            pattern: '([a-z0-9._%+-]+)@([a-z0-9.-]+\\.[a-z]{2,})',
            flags: 'g',
            extractGroup: '2', // Extract domain only
            outputVariable: 'domains',
          },
        },
      };

      const result = await executeRegex(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toEqual(['example.com', 'domain.org']);
    });

    it('parses literal regex syntax like /pattern/i', async () => {
      const node: WorkflowNode = {
        id: 'node_regex_literal',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'regex',
          label: 'Regex',
          properties: {
            text: 'Invoice INV-2026-XQ completed',
            pattern: '/INV-[0-9]+-[A-Z]+/i',
            outputVariable: 'invoiceNo',
          },
        },
      };

      const result = await executeRegex(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.variables?.invoiceNo_first).toBe('INV-2026-XQ');
    });

    it('falls back to extractedText variable when text input is left blank', async () => {
      mockContext.variables.extractedText = 'Total items: 42 in cart';

      const node: WorkflowNode = {
        id: 'node_regex_fallback',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'regex',
          label: 'Regex',
          properties: {
            pattern: '\\d+',
            outputVariable: 'count',
          },
        },
      };

      const result = await executeRegex(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.variables?.count).toEqual(['42']);
    });
  });

  describe('Extract Text with Regex Pattern', () => {
    it('applies regex extraction directly on extracted text', async () => {
      const node: WorkflowNode = {
        id: 'node_extract_regex',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'extract_text',
          label: 'Extract Text',
          properties: {
            selector: '.order-confirmation',
            regexPattern: '\\$([0-9,.]+)',
            extractGroup: '1',
            outputVariable: 'orderTotal',
          },
        },
      };

      const result = await executeExtractText(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toBe('149.99');
      expect(result.variables?.orderTotal).toBe('149.99');
    });
  });

  describe('Navigate - Open in New Tab', () => {
    it('passes openInNewTab flag and updates context currentTabId', async () => {
      const node: WorkflowNode = {
        id: 'node_navigate_new',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'navigate',
          label: 'Navigate',
          properties: {
            url: 'https://newsite.com',
            openInNewTab: true,
          },
        },
      };

      const result = await executeNavigate(node, mockContext);
      expect(result.success).toBe(true);
      expect(sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'NAVIGATE_TAB',
          payload: expect.objectContaining({
            url: 'https://newsite.com',
            openInNewTab: true,
          }),
        })
      );
      expect(mockContext.currentTabId).toBe(303);
    });
  });

  describe('Smart Scroll Speed', () => {
    it('executes smart scroll with fast speed', async () => {
      const node: WorkflowNode = {
        id: 'node_smart_scroll_fast',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'smart_scroll',
          label: 'Smart Scroll',
          properties: {
            mode: 'to_bottom',
            maxScrolls: 2,
            scrollSpeed: 'fast',
          },
        },
      };

      const result = await executeSmartScroll(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toEqual(
        expect.objectContaining({
          scrollSpeed: 'fast',
          totalScrolls: 2,
        })
      );
    });

    it('executes smart scroll with instant speed and non-smooth scroll', async () => {
      const node: WorkflowNode = {
        id: 'node_smart_scroll_instant',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'smart_scroll',
          label: 'Smart Scroll',
          properties: {
            mode: 'to_bottom',
            maxScrolls: 2,
            scrollSpeed: 'instant',
          },
        },
      };

      const result = await executeSmartScroll(node, mockContext);
      expect(result.success).toBe(true);
      expect(sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'EXECUTE_DOM_ACTION',
          payload: expect.objectContaining({
            action: 'scroll',
            params: expect.objectContaining({
              smooth: false,
            }),
          }),
        })
      );
    });
  });
});
