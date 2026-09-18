import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  copyToClipboard,
  readClipboard,
  pasteIntoElement,
  pressKey,
} from '../src/content/domActions';
import { executeClipboard, executePressKey } from '../src/runtime/executors';
import { ExecutionContext } from '../src/types/workflow';

describe('Clipboard & Keyboard Shortcut DOM Actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('copyToClipboard & readClipboard', () => {
    it('copies text and reads it back from in-memory clipboard buffer', async () => {
      const resCopy = await copyToClipboard('Hello AutoFlow Clipboard!');
      expect(resCopy.success).toBe(true);

      const resRead = await readClipboard();
      expect(resRead.success).toBe(true);
      expect(resRead.text).toBe('Hello AutoFlow Clipboard!');
    });
  });

  describe('pasteIntoElement', () => {
    it('pastes text into an HTMLInputElement and updates its value', async () => {
      const input = document.createElement('input');
      input.id = 'target-input';
      input.value = 'Initial ';
      document.body.appendChild(input);

      const res = await pasteIntoElement({
        selector: '#target-input',
        text: 'Pasted Value',
      });

      expect(res.success).toBe(true);
      expect(input.value).toBe('Initial Pasted Value');
    });

    it('pastes fallback clipboard content if text parameter is omitted', async () => {
      await copyToClipboard('Fallback Text');

      const textarea = document.createElement('textarea');
      textarea.id = 'target-textarea';
      document.body.appendChild(textarea);

      const res = await pasteIntoElement({
        selector: '#target-textarea',
      });

      expect(res.success).toBe(true);
      expect(textarea.value).toBe('Fallback Text');
    });
  });

  describe('pressKey with shortcut combos', () => {
    it('executes Ctrl+V shortcut to paste into target element', async () => {
      await copyToClipboard('Pasted via Ctrl+V');

      const input = document.createElement('input');
      input.id = 'shortcut-input';
      document.body.appendChild(input);

      const res = await pressKey('Ctrl+V', { selector: '#shortcut-input' });
      expect(res.success).toBe(true);
      expect(input.value).toBe('Pasted via Ctrl+V');
    });

    it('executes Ctrl+C shortcut to copy element value into clipboard', async () => {
      const input = document.createElement('input');
      input.id = 'copy-input';
      input.value = 'Text to copy via Ctrl+C';
      document.body.appendChild(input);

      const res = await pressKey('Ctrl+C', { selector: '#copy-input' });
      expect(res.success).toBe(true);

      const clip = await readClipboard();
      expect(clip.text).toBe('Text to copy via Ctrl+C');
    });

    it('dispatches keyboard events for standard keys like Enter', async () => {
      const input = document.createElement('input');
      input.id = 'enter-input';
      document.body.appendChild(input);

      let keydownFired = false;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') keydownFired = true;
      });

      const res = await pressKey('Enter', { selector: '#enter-input' });
      expect(res.success).toBe(true);
      expect(keydownFired).toBe(true);
    });
  });

  describe('Executors: executeClipboard & executePressKey', () => {
    it('executeClipboard reads and writes to variables', async () => {
      const ctx: ExecutionContext = {
        workflowId: 'wf_1',
        executionId: 'exec_1',
        variables: { secretToken: 'XYZ_TOKEN_999' },
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        signal: new AbortController().signal,
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      const writeNode: any = {
        id: 'clip_write',
        data: {
          properties: {
            action: 'write',
            text: 'Token: {{secretToken}}',
          },
        },
      };

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ success: true, text: 'Token: XYZ_TOKEN_999' }),
        },
      };

      const writeRes = await executeClipboard(writeNode, ctx);
      expect(writeRes.success).toBe(true);
      expect(writeRes.output).toBe('Token: XYZ_TOKEN_999');

      const readNode: any = {
        id: 'clip_read',
        data: {
          properties: {
            action: 'read',
            outputVariable: 'myClipboard',
          },
        },
      };

      const readRes = await executeClipboard(readNode, ctx);
      expect(readRes.success).toBe(true);
      expect(readRes.variables?.myClipboard).toBe('Token: XYZ_TOKEN_999');
    });

    it('executePressKey interpolates variables in key property', async () => {
      const ctx: ExecutionContext = {
        workflowId: 'wf_1',
        executionId: 'exec_2',
        variables: { targetShortcut: 'Ctrl+V' },
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        signal: new AbortController().signal,
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ success: true }),
        },
      };

      const pressNode: any = {
        id: 'press_node',
        data: {
          properties: {
            key: '{{targetShortcut}}',
            selector: 'input#test',
          },
        },
      };

      const res = await executePressKey(pressNode, ctx);
      expect(res.success).toBe(true);
      expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EXECUTE_DOM_ACTION',
          payload: expect.objectContaining({
            action: 'press_key',
            params: expect.objectContaining({
              key: 'Ctrl+V',
              selector: 'input#test',
            }),
          }),
        })
      );
    });
  });
});
