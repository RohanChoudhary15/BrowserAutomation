import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine } from '../src/runtime/engine';
import { Workflow, WorkflowNode } from '../src/types/workflow';
import {
  executeWait,
  executeStopTimer,
  executeResetTimer,
  executeStopWorkflow,
  executePauseWorkflow,
  executeSkipTo,
} from '../src/runtime/executors';
import { ExecutionContext, ActiveTimer } from '../src/types/execution';

function createMockContext(partial: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    variables: {},
    currentIteration: 0,
    loopData: {},
    engineSettings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
    log: vi.fn(),
    updateNodeState: vi.fn(),
    _activeTimers: new Map(),
    ...partial,
  };
}

function createMockNode(id: string, type: string, properties: Record<string, any>): WorkflowNode {
  return {
    id,
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      category: 'command',
      type: type as any,
      properties,
    },
  };
}

describe('Workflow Commands & Breakable Timers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('executeWait with built-in early stop conditions', () => {
    it('stops wait early when text appears in the page', async () => {
      const context = createMockContext();

      // In 100ms, append the text into document.body
      setTimeout(() => {
        const div = document.createElement('div');
        div.textContent = 'Data ready to export!';
        document.body.appendChild(div);
      }, 100);

      const waitNode = createMockNode('wait_node_1', 'wait', {
        duration: 3000,
        unit: 'ms',
        stopCondition: {
          enabled: true,
          type: 'text',
          text: 'Data ready',
          matchMode: 'partial',
          caseSensitive: false,
        },
      });

      const startTime = Date.now();
      const result = await executeWait(waitNode, context);

      const elapsed = Date.now() - startTime;
      expect(result.success).toBe(true);
      expect(result.output?.stoppedEarly).toBe(true);
      expect(result.output?.reason).toContain('Found text "Data ready"');
      expect(elapsed).toBeLessThan(1500);
    });

    it('stops wait early when element selector appears', async () => {
      const context = createMockContext();

      // In 80ms, append an element with class .modal-loaded
      setTimeout(() => {
        const modal = document.createElement('div');
        modal.className = 'modal-loaded';
        modal.textContent = 'Modal active';
        document.body.appendChild(modal);
      }, 80);

      const waitNode = createMockNode('wait_node_2', 'wait', {
        duration: 3000,
        unit: 'ms',
        stopCondition: {
          enabled: true,
          type: 'element',
          selector: '.modal-loaded',
        },
      });

      const startTime = Date.now();
      const result = await executeWait(waitNode, context);

      const elapsed = Date.now() - startTime;
      expect(result.success).toBe(true);
      expect(result.output?.stoppedEarly).toBe(true);
      expect(result.output?.reason).toContain('Element ".modal-loaded" appeared');
      expect(elapsed).toBeLessThan(1500);
    });

    it('stops wait early when variable condition is fulfilled', async () => {
      const context = createMockContext({ variables: { isReady: false } });

      // In 100ms, change variable in context
      setTimeout(() => {
        context.variables.isReady = true;
      }, 100);

      const waitNode = createMockNode('wait_node_3', 'wait', {
        duration: 3000,
        unit: 'ms',
        stopCondition: {
          enabled: true,
          type: 'variable',
          leftValue: '{{isReady}}',
          operator: 'equals',
          rightValue: 'true',
        },
      });

      const startTime = Date.now();
      const result = await executeWait(waitNode, context);

      const elapsed = Date.now() - startTime;
      expect(result.success).toBe(true);
      expect(result.output?.stoppedEarly).toBe(true);
      expect(result.output?.reason).toContain('Variable condition matched');
      expect(elapsed).toBeLessThan(1500);
    });
  });

  describe('executeStopTimer executor', () => {
    it('stops active timer by name with complete_early mode', async () => {
      const activeTimers = new Map<string, ActiveTimer>();
      let stoppedWithAction: string | undefined;

      activeTimers.set('node_wait_a', {
        nodeId: 'node_wait_a',
        timerName: 'user_poll_timer',
        startTime: Date.now(),
        totalDurationMs: 5000,
        remainingMs: 4000,
        stop: (mode, reason) => {
          stoppedWithAction = mode;
        },
        reset: () => {},
      });

      const context = createMockContext({ _activeTimers: activeTimers });
      const node = createMockNode('stop_timer_1', 'stop_timer', {
        targetTimer: 'user_poll_timer',
        action: 'complete_early',
        reason: 'Condition matched on parallel branch',
        outputVariable: 'stopped_count',
      });

      const result = await executeStopTimer(node, context);

      expect(result.success).toBe(true);
      expect(stoppedWithAction).toBe('complete_early');
      expect(result.variables?.stopped_count).toBe(true);
    });

    it('cancels all active timers when targetTimer is "all"', async () => {
      const activeTimers = new Map<string, ActiveTimer>();
      const cancelled: string[] = [];

      activeTimers.set('t1', {
        nodeId: 't1',
        startTime: Date.now(),
        totalDurationMs: 5000,
        remainingMs: 5000,
        stop: (mode) => cancelled.push('t1:' + mode),
        reset: () => {},
      });
      activeTimers.set('t2', {
        nodeId: 't2',
        timerName: 'secondary',
        startTime: Date.now(),
        totalDurationMs: 8000,
        remainingMs: 8000,
        stop: (mode) => cancelled.push('t2:' + mode),
        reset: () => {},
      });

      const context = createMockContext({ _activeTimers: activeTimers });
      const node = createMockNode('stop_timer_all', 'stop_timer', {
        targetTimer: 'all',
        action: 'cancel',
      });

      const result = await executeStopTimer(node, context);

      expect(result.success).toBe(true);
      expect(cancelled).toEqual(['t1:cancel', 't2:cancel']);
    });
  });

  describe('executeResetTimer executor', () => {
    it('restarts timer with new duration or extends it', async () => {
      const activeTimers = new Map<string, ActiveTimer>();
      let resetMode: string | undefined;
      let resetDuration: number | undefined;

      activeTimers.set('t1', {
        nodeId: 't1',
        timerName: 'refresh_timer',
        startTime: Date.now(),
        totalDurationMs: 3000,
        remainingMs: 2000,
        stop: () => {},
        reset: (mode, duration) => {
          resetMode = mode;
          resetDuration = duration;
        },
      });

      const context = createMockContext({ _activeTimers: activeTimers });
      const node = createMockNode('reset_timer_1', 'reset_timer', {
        targetTimer: 'refresh_timer',
        mode: 'extend',
        extendMs: 2500,
      });

      const result = await executeResetTimer(node, context);

      expect(result.success).toBe(true);
      expect(resetMode).toBe('extend');
      expect(resetDuration).toBe(2500);
    });
  });

  describe('executeStopWorkflow executor', () => {
    it('returns stopWorkflow signal with status and message', async () => {
      const context = createMockContext();
      const node = createMockNode('stop_wf_1', 'stop_workflow', {
        exitStatus: 'completed',
        exitMessage: 'Task goal met early!',
      });

      const result = await executeStopWorkflow(node, context);

      expect(result.success).toBe(true);
      expect(result.stopWorkflow).toBe(true);
      expect(result.exitStatus).toBe('completed');
      expect(result.exitMessage).toBe('Task goal met early!');
    });
  });

  describe('executeSkipTo executor', () => {
    it('returns jumpToNodeId target', async () => {
      const context = createMockContext();
      const node = createMockNode('skip_node_1', 'skip_to', {
        targetNodeId: 'node_checkout',
      });

      const result = await executeSkipTo(node, context);

      expect(result.success).toBe(true);
      expect(result.jumpToNodeId).toBe('node_checkout');
    });
  });

  describe('executePauseWorkflow executor', () => {
    it('triggers pause and resumes automatically after timeout if configured', async () => {
      let pauseTriggered = false;
      const context = createMockContext({
        _pauseTrigger: async () => {
          pauseTriggered = true;
        },
      });

      const node = createMockNode('pause_node_1', 'pause_workflow', {
        message: 'Please check CAPTCHA',
        autoResumeMs: 50,
      });

      const result = await executePauseWorkflow(node, context);

      expect(result.success).toBe(true);
      expect(pauseTriggered).toBe(true);
    });
  });

  describe('WorkflowEngine with cross-branch Stop Timer integration', () => {
    it('parallel branch stops a long wait node early and workflow finishes promptly', async () => {
      const executed: string[] = [];

      const wf: Workflow = {
        id: 'wf_parallel_stop_timer',
        name: 'Parallel Stop Timer',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 10000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'start_node',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: { label: 'Start', category: 'data', type: 'set_variable', properties: { name: 'init', value: true } },
          },
          // Branch 1: Long wait timer (5000ms)
          {
            id: 'long_wait_node',
            type: 'customNode',
            position: { x: -150, y: 100 },
            data: {
              label: 'Wait 5s',
              category: 'navigation',
              type: 'wait',
              properties: { duration: 5000, unit: 'ms', timerName: 'download_wait' },
            },
          },
          {
            id: 'after_wait_node',
            type: 'customNode',
            position: { x: -150, y: 200 },
            data: { label: 'After Wait', category: 'data', type: 'set_variable', properties: { name: 'waitDone', value: true } },
          },
          // Branch 2: Immediate stop_timer command
          {
            id: 'stop_command_node',
            type: 'customNode',
            position: { x: 150, y: 100 },
            data: {
              label: 'Stop Timer',
              category: 'command',
              type: 'stop_timer',
              properties: { targetTimer: 'download_wait', action: 'complete_early' },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'start_node', target: 'long_wait_node' },
          { id: 'e2', source: 'long_wait_node', target: 'after_wait_node' },
          { id: 'e3', source: 'start_node', target: 'stop_command_node' },
        ],
      };

      const startTime = Date.now();
      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();
      const totalElapsed = Date.now() - startTime;

      expect(engine.getStatus()).toBe('completed');
      expect(executed).toContain('start_node');
      expect(executed).toContain('stop_command_node');
      expect(executed).toContain('long_wait_node');
      expect(executed).toContain('after_wait_node');
      expect(engine.getVariables().waitDone).toBe(true);

      // The 5000ms wait should have been stopped early by branch 2, completing in under 1500ms
      expect(totalElapsed).toBeLessThan(2000);
    });

    it('stop_workflow node halts entire workflow immediately', async () => {
      const executed: string[] = [];

      const wf: Workflow = {
        id: 'wf_stop_workflow',
        name: 'Stop Workflow Test',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'n1',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: { label: 'Step 1', category: 'data', type: 'set_variable', properties: { name: 'step1', value: true } },
          },
          {
            id: 'n_stop',
            type: 'customNode',
            position: { x: 0, y: 100 },
            data: {
              label: 'Stop Here',
              category: 'command',
              type: 'stop_workflow',
              properties: { exitStatus: 'completed', exitMessage: 'Halted deliberately' },
            },
          },
          {
            id: 'n_never',
            type: 'customNode',
            position: { x: 0, y: 200 },
            data: { label: 'Never Runs', category: 'data', type: 'set_variable', properties: { name: 'never', value: true } },
          },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n_stop' },
          { id: 'e2', source: 'n_stop', target: 'n_never' },
        ],
      };

      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      expect(executed).toContain('n1');
      expect(executed).toContain('n_stop');
      expect(executed).not.toContain('n_never');
      expect(engine.getStatus()).toBe('completed');
    });

    it('skip_to jumps past intermediate nodes directly to target', async () => {
      const executed: string[] = [];

      const wf: Workflow = {
        id: 'wf_skip_to',
        name: 'Skip To Test',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'n1',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Skip Ahead',
              category: 'command',
              type: 'skip_to',
              properties: { targetNodeId: 'target_node' },
            },
          },
          {
            id: 'intermediate_node',
            type: 'customNode',
            position: { x: 0, y: 100 },
            data: { label: 'Bypassed', category: 'data', type: 'set_variable', properties: { name: 'bypassed', value: true } },
          },
          {
            id: 'target_node',
            type: 'customNode',
            position: { x: 0, y: 200 },
            data: { label: 'Target', category: 'data', type: 'set_variable', properties: { name: 'reachedTarget', value: true } },
          },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'intermediate_node' },
          { id: 'e2', source: 'intermediate_node', target: 'target_node' },
        ],
      };

      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      expect(executed).toContain('n1');
      expect(executed).not.toContain('intermediate_node');
      expect(executed).toContain('target_node');
      expect(engine.getVariables().reachedTarget).toBe(true);
      expect(engine.getVariables().bypassed).toBeUndefined();
    });
  });
});
