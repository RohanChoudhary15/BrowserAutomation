import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkElementPresence } from '../src/content/domActions';
import { executeContains } from '../src/runtime/executors';
import { WorkflowEngine } from '../src/runtime/engine';
import { ExecutionContext, NodeResult } from '../src/types/execution';
import { Workflow } from '../src/types/workflow';

function makeCtx(variables: Record<string, any> = {}): ExecutionContext {
  return {
    workflowId: 'wf_contains',
    executionId: 'exec_contains',
    variables,
    signal: new AbortController().signal,
    log: vi.fn(),
    updateNodeState: vi.fn(),
  };
}

function makeContainsNode(properties: Record<string, any>, label = 'Contains') {
  return {
    id: 'contains_node',
    type: 'containsNode',
    position: { x: 0, y: 0 },
    data: {
      label,
      category: 'logic' as const,
      type: 'contains' as const,
      properties,
    },
  } as any;
}

function makeWorkflow(nodes: any[], edges: any[]): Workflow {
  return {
    id: 'wf_contains_branch',
    name: 'Contains Branching',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    variables: {},
    settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
    nodes,
    edges,
  };
}

describe('Contains node', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
    delete (document as any).evaluate;
    delete (globalThis as any).XPathResult;
  });

  describe('checkElementPresence DOM action', () => {
    it('reports present: true when the element exists on the page', async () => {
      const el = document.createElement('div');
      el.id = 'banner';
      el.textContent = 'Welcome back, user';
      document.body.appendChild(el);

      const res = await checkElementPresence('#banner', { timeout: 200 });
      expect(res.present).toBe(true);
      expect(res.matchedText).toContain('Welcome back');
    });

    it('reports present: false when the element is missing', async () => {
      const res = await checkElementPresence('#does-not-exist', { timeout: 150 });
      expect(res.present).toBe(false);
      expect(res.reason).toBe('not_found');
    });

    it('resolves true as soon as a delayed element appears', async () => {
      setTimeout(() => {
        const el = document.createElement('button');
        el.id = 'late-btn';
        document.body.appendChild(el);
      }, 60);

      const res = await checkElementPresence('#late-btn', { timeout: 2000 });
      expect(res.present).toBe(true);
    });

    it('supports :has-text() selectors used by the element picker', async () => {
      const btn = document.createElement('button');
      btn.className = 'btn-retry';
      btn.textContent = 'Retry Connection';
      document.body.appendChild(btn);

      const res = await checkElementPresence('button:has-text("Retry Connection")', { timeout: 200 });
      expect(res.present).toBe(true);
    });

    it('supports XPath selectors (via document.evaluate)', async () => {
      const el = document.createElement('span');
      el.id = 'xpath-target';
      document.body.appendChild(el);

      // happy-dom does not implement XPath, so stub the browser APIs the finder uses.
      (globalThis as any).XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
      const evaluate = vi.fn().mockReturnValue({ singleNodeValue: el });
      (document as any).evaluate = evaluate;

      const res = await checkElementPresence("//span[@id='xpath-target']", { timeout: 150 });
      expect(res.present).toBe(true);
      expect(evaluate).toHaveBeenCalled();
    });

    it('filters by expected text when text matching is requested', async () => {
      const el = document.createElement('div');
      el.id = 'status';
      el.textContent = 'Order shipped';
      document.body.appendChild(el);

      const hit = await checkElementPresence('#status', { timeout: 150, text: 'shipped' });
      expect(hit.present).toBe(true);

      const miss = await checkElementPresence('#status', { timeout: 150, text: 'cancelled' });
      expect(miss.present).toBe(false);
    });

    it('treats a hidden element as absent when visibility is required', async () => {
      const el = document.createElement('div');
      el.id = 'hidden-panel';
      el.style.display = 'none';
      document.body.appendChild(el);

      const required = await checkElementPresence('#hidden-panel', { timeout: 150, visibleOnly: true });
      expect(required.present).toBe(false);

      const notRequired = await checkElementPresence('#hidden-panel', { timeout: 150, visibleOnly: false });
      expect(notRequired.present).toBe(true);
    });
  });

  describe('executeContains', () => {
    it('returns the TRUE branch and sets the output variable when present', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ present: true, matchedText: 'Welcome back' }),
        },
      };

      const ctx = makeCtx();
      const node = makeContainsNode({ selector: '#banner', timeout: 2000, outputVariable: 'hasBanner' });

      const res: NodeResult = await executeContains(node, ctx);

      expect(res.success).toBe(true);
      expect(res.nextBranch).toBe('true');
      expect(res.variables?.hasBanner).toBe(true);
      expect(res.output.present).toBe(true);
    });

    it('returns the FALSE branch when the element is not present', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ present: false, reason: 'not_found' }),
        },
      };

      const ctx = makeCtx();
      const node = makeContainsNode({ selector: '#missing', outputVariable: 'hasBanner' });

      const res = await executeContains(node, ctx);

      expect(res.success).toBe(true);
      expect(res.nextBranch).toBe('false');
      expect(res.variables?.hasBanner).toBe(false);
    });

    it('interpolates variables inside the selector', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ present: true }),
        },
      };

      const ctx = makeCtx({ targetId: 'checkout-panel' });
      const node = makeContainsNode({ selector: '#{{targetId}}' });

      await executeContains(node, ctx);

      expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EXECUTE_DOM_ACTION',
          payload: expect.objectContaining({
            action: 'check_element_presence',
            params: expect.objectContaining({ selector: '#checkout-panel' }),
          }),
        })
      );
    });

    it('throws a friendly error when no selector is configured', async () => {
      const ctx = makeCtx();
      const node = makeContainsNode({ selector: '' });
      await expect(executeContains(node, ctx)).rejects.toThrow(/requires a selector/i);
    });
  });

  describe('workflow branching', () => {
    const buildBranchWorkflow = () =>
      makeWorkflow(
        [
          makeContainsNode({ selector: '#banner', outputVariable: 'hasBanner' }),
          {
            id: 'true_branch',
            type: 'customNode',
            position: { x: -100, y: 100 },
            data: { label: 'Found', category: 'data', type: 'set_variable', properties: { name: 'result', value: 'FOUND' } },
          },
          {
            id: 'false_branch',
            type: 'customNode',
            position: { x: 100, y: 100 },
            data: { label: 'Missing', category: 'data', type: 'set_variable', properties: { name: 'result', value: 'MISSING' } },
          },
        ],
        [
          { id: 'e_true', source: 'contains_node', target: 'true_branch', sourceHandle: 'true' },
          { id: 'e_false', source: 'contains_node', target: 'false_branch', sourceHandle: 'false' },
        ]
      );

    it('follows the TRUE branch when the element is present', async () => {
      (globalThis as any).chrome = {
        runtime: { sendMessage: vi.fn().mockResolvedValue({ present: true }) },
      };

      const executed: string[] = [];
      const engine = new WorkflowEngine(buildBranchWorkflow(), {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      expect(executed).toContain('true_branch');
      expect(executed).not.toContain('false_branch');
      expect(engine.getVariables().result).toBe('FOUND');
      expect(engine.getVariables().hasBanner).toBe(true);
      expect(engine.getStatus()).toBe('completed');
    });

    it('follows the FALSE branch when the element is absent', async () => {
      (globalThis as any).chrome = {
        runtime: { sendMessage: vi.fn().mockResolvedValue({ present: false }) },
      };

      const executed: string[] = [];
      const engine = new WorkflowEngine(buildBranchWorkflow(), {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      expect(executed).toContain('false_branch');
      expect(executed).not.toContain('true_branch');
      expect(engine.getVariables().result).toBe('MISSING');
      expect(engine.getVariables().hasBanner).toBe(false);
    });
  });
});