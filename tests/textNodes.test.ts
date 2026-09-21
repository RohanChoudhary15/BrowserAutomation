import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { matchesText, findMatchingElement } from '../src/utils/textMatcher';
import { waitForText, checkElementPresence } from '../src/content/domActions';
import { executeContainsText, executeWaitForText } from '../src/runtime/executors';
import { evaluateCondition } from '../src/runtime/evaluator';
import { WorkflowEngine } from '../src/runtime/engine';
import { ExecutionContext, NodeResult } from '../src/types/execution';
import { Workflow } from '../src/types/workflow';

function makeCtx(variables: Record<string, any> = {}): ExecutionContext {
  return {
    workflowId: 'wf_text_test',
    executionId: 'exec_text_test',
    variables,
    signal: new AbortController().signal,
    log: vi.fn(),
    updateNodeState: vi.fn(),
  };
}

describe('Text Matching Utilities & Nodes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  describe('matchesText utility', () => {
    it('matches partial text case-insensitively by default', () => {
      expect(matchesText('Operation Successful!', 'successful')).toBe(true);
      expect(matchesText('Hello World', 'WORLD')).toBe(true);
      expect(matchesText('Welcome to AutoFlow', 'missing')).toBe(false);
    });

    it('handles exact match mode correctly', () => {
      expect(matchesText('Complete', 'Complete', { matchMode: 'exact' })).toBe(true);
      expect(matchesText('Complete', 'complete', { matchMode: 'exact', caseSensitive: false })).toBe(true);
      expect(matchesText('Completed Order', 'Complete', { matchMode: 'exact' })).toBe(false);
      expect(matchesText(' Complete ', 'Complete', { matchMode: 'exact' })).toBe(true);
    });

    it('respects case sensitivity when enabled', () => {
      expect(matchesText('Submit', 'Submit', { caseSensitive: true })).toBe(true);
      expect(matchesText('Submit', 'submit', { caseSensitive: true })).toBe(false);
      expect(matchesText('Submit', 'submit', { caseSensitive: false })).toBe(true);
    });

    it('normalizes non-breaking spaces and irregular whitespace', () => {
      const textWithNbsp = 'Hello\u00A0World\n  Test  ';
      expect(matchesText(textWithNbsp, 'Hello World Test')).toBe(true);
      expect(matchesText(textWithNbsp, 'hello world test', { matchMode: 'exact' })).toBe(true);
    });
  });

  describe('findMatchingElement utility', () => {
    it('finds innermost matching element', () => {
      document.body.innerHTML = `
        <div id="container">
          <div class="card">
            <span id="target">Target Text Here</span>
          </div>
        </div>
      `;

      const found = findMatchingElement(document.body, 'Target Text');
      expect(found).not.toBeNull();
      expect(found?.id).toBe('target');
    });
  });

  describe('waitForText DOM action', () => {
    it('finds text on the page within timeout', async () => {
      const msg = document.createElement('div');
      msg.textContent = 'Data Processed Successfully';
      document.body.appendChild(msg);

      const result = await waitForText('processed successfully', undefined, 1000, undefined, {
        matchMode: 'partial',
        caseSensitive: false,
      });

      expect(result.success).toBe(true);
      expect(result.matchedText).toContain('Data Processed Successfully');
    });

    it('respects caseSensitive in waitForText', async () => {
      const msg = document.createElement('div');
      msg.textContent = 'UPPERCASE ONLY';
      document.body.appendChild(msg);

      await expect(
        waitForText('uppercase only', undefined, 200, undefined, {
          matchMode: 'partial',
          caseSensitive: true,
        })
      ).rejects.toThrow(/Timed out after \d+ms waiting for text/);
    });

    it('respects matchMode exact in waitForText', async () => {
      const msg = document.createElement('div');
      msg.textContent = 'Order #12345 Pending';
      document.body.appendChild(msg);

      await expect(
        waitForText('Order #12345', undefined, 200, undefined, {
          matchMode: 'exact',
          caseSensitive: false,
        })
      ).rejects.toThrow(/Timed out after \d+ms waiting for text/);

      const exactResult = await waitForText('Order #12345 Pending', undefined, 500, undefined, {
        matchMode: 'exact',
        caseSensitive: false,
      });
      expect(exactResult.success).toBe(true);
    });
  });

  describe('checkElementPresence for contains_text', () => {
    it('checks text existence on entire page without selector', async () => {
      const p = document.createElement('p');
      p.textContent = 'Account Verification Completed';
      document.body.appendChild(p);

      const found = await checkElementPresence('', {
        text: 'verification completed',
        matchMode: 'partial',
        caseSensitive: false,
        timeout: 200,
      });
      expect(found.present).toBe(true);

      const notFound = await checkElementPresence('', {
        text: 'random non existing token',
        matchMode: 'partial',
        caseSensitive: false,
        timeout: 100,
      });
      expect(notFound.present).toBe(false);
    });

    it('checks text existence inside specific container selector', async () => {
      document.body.innerHTML = `
        <div id="modal">
          <h3>Modal Title</h3>
          <p>Please Confirm</p>
        </div>
        <div id="sidebar">
          <p>Other content</p>
        </div>
      `;

      const insideModal = await checkElementPresence('#modal', {
        text: 'Please Confirm',
        matchMode: 'partial',
        timeout: 200,
      });
      expect(insideModal.present).toBe(true);

      const outsideModal = await checkElementPresence('#sidebar', {
        text: 'Please Confirm',
        matchMode: 'partial',
        timeout: 100,
      });
      expect(outsideModal.present).toBe(false);
    });
  });

  describe('executeContainsText executor', () => {
    it('executes and takes true branch when text is found', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ present: true, matchedText: 'Dashboard Overview' }),
        },
      };

      const node = {
        id: 'contains_text_1',
        data: {
          label: 'Check Dashboard',
          type: 'contains_text',
          properties: {
            text: 'Dashboard Overview',
            matchMode: 'exact',
            caseSensitive: false,
            timeout: 500,
            outputVariable: 'hasDashboard',
          },
        },
      } as any;

      const ctx = makeCtx();
      const res: NodeResult = await executeContainsText(node, ctx);

      expect(res.success).toBe(true);
      expect(res.nextBranch).toBe('true');
      expect(res.output.present).toBe(true);
      expect(res.variables?.hasDashboard).toBe(true);
    });

    it('executes and takes false branch without throwing when text is not found', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ present: false, reason: 'not_found' }),
        },
      };

      const node = {
        id: 'contains_text_2',
        data: {
          label: 'Check Error Message',
          type: 'contains_text',
          properties: {
            text: 'Critical Failure Occurred',
            timeout: 100,
            outputVariable: 'hasError',
          },
        },
      } as any;

      const ctx = makeCtx();
      const res: NodeResult = await executeContainsText(node, ctx);

      expect(res.success).toBe(true);
      expect(res.nextBranch).toBe('false');
      expect(res.output.present).toBe(false);
      expect(res.variables?.hasError).toBe(false);
    });
  });

  describe('WorkflowEngine branching with contains_text node', () => {
    it('routes workflow to TRUE branch when text is present', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ present: true, matchedText: 'Alice' }),
        },
      };

      const workflow: Workflow = {
        id: 'wf_contains_text_branch',
        name: 'Contains Text Branching',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 3000, retryCount: 0, retryDelay: 50, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'check_text',
            type: 'containsNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Check Alice',
              category: 'logic',
              type: 'contains_text',
              properties: {
                text: 'Alice',
                matchMode: 'partial',
                caseSensitive: true,
                timeout: 300,
                outputVariable: 'foundAlice',
              },
            },
          },
          {
            id: 'on_true',
            type: 'customNode',
            position: { x: -100, y: 150 },
            data: {
              label: 'Set Alice Greeting',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'greeted', value: 'Hello Alice!' },
            },
          },
          {
            id: 'on_false',
            type: 'customNode',
            position: { x: 100, y: 150 },
            data: {
              label: 'Set Guest Greeting',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'greeted', value: 'Hello Guest!' },
            },
          },
        ],
        edges: [
          {
            id: 'e_true',
            source: 'check_text',
            sourceHandle: 'true',
            target: 'on_true',
          },
          {
            id: 'e_false',
            source: 'check_text',
            sourceHandle: 'false',
            target: 'on_false',
          },
        ],
      };

      const executed: string[] = [];
      const engine = new WorkflowEngine(workflow, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(executed).toContain('on_true');
      expect(executed).not.toContain('on_false');
      expect(engine.getVariables().foundAlice).toBe(true);
      expect(engine.getVariables().greeted).toBe('Hello Alice!');
    });

    it('routes workflow to FALSE branch when text is missing', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ present: false }),
        },
      };

      const workflow: Workflow = {
        id: 'wf_contains_text_false_branch',
        name: 'Contains Text False Branching',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 3000, retryCount: 0, retryDelay: 50, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'check_text_missing',
            type: 'containsNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Check Bob',
              category: 'logic',
              type: 'contains_text',
              properties: {
                text: 'Bob',
                timeout: 300,
                outputVariable: 'foundBob',
              },
            },
          },
          {
            id: 'on_true',
            type: 'customNode',
            position: { x: -100, y: 150 },
            data: {
              label: 'Set Bob Greeting',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'greeted', value: 'Hello Bob!' },
            },
          },
          {
            id: 'on_false',
            type: 'customNode',
            position: { x: 100, y: 150 },
            data: {
              label: 'Set Guest Greeting',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'greeted', value: 'Hello Guest!' },
            },
          },
        ],
        edges: [
          {
            id: 'e_true',
            source: 'check_text_missing',
            sourceHandle: 'true',
            target: 'on_true',
          },
          {
            id: 'e_false',
            source: 'check_text_missing',
            sourceHandle: 'false',
            target: 'on_false',
          },
        ],
      };

      const executed: string[] = [];
      const engine = new WorkflowEngine(workflow, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(executed).toContain('on_false');
      expect(executed).not.toContain('on_true');
      expect(engine.getVariables().foundBob).toBe(false);
      expect(engine.getVariables().greeted).toBe('Hello Guest!');
    });
  });

  describe('Condition evaluation case sensitivity', () => {
    it('evaluates string equality and contains with caseSensitive flag', () => {
      expect(evaluateCondition({
        leftValue: 'Apple',
        operator: 'equals',
        rightValue: 'apple',
        caseSensitive: false,
      }, {})).toBe(true);

      expect(evaluateCondition({
        leftValue: 'Apple',
        operator: 'equals',
        rightValue: 'apple',
        caseSensitive: true,
      }, {})).toBe(false);

      expect(evaluateCondition({
        leftValue: 'Super Secret Token',
        operator: 'contains',
        rightValue: 'secret',
        caseSensitive: false,
      }, {})).toBe(true);

      expect(evaluateCondition({
        leftValue: 'Super Secret Token',
        operator: 'contains',
        rightValue: 'secret',
        caseSensitive: true,
      }, {})).toBe(false);
    });
  });
});
