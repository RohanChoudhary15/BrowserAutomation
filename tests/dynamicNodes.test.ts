import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  executeWait,
  executeSmartScroll,
  executeMathCalculate,
  executeDownloadFile,
  executeShowNotification,
} from '../src/runtime/executors';
import { WorkflowEngine } from '../src/runtime/engine';
import { Workflow, WorkflowNode } from '../src/types/workflow';
import { NodeRuntimeState } from '../src/types/execution';

describe('Dynamic Nodes & Live Canvas Progress', () => {
  describe('Wait Node Live Countdown', () => {
    it('emits real-time countdown dynamicState updates with remainingSeconds and progress', async () => {
      const recordedStates: NodeRuntimeState[] = [];

      const node: WorkflowNode = {
        id: 'wait_node_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Wait 300ms',
          category: 'wait',
          type: 'wait',
          properties: {
            duration: 300,
            unit: 'ms',
          },
        },
      };

      const ctx: any = {
        variables: {},
        signal: new AbortController().signal,
        log: vi.fn(),
        updateNodeState: vi.fn().mockImplementation((id: string, state: Partial<NodeRuntimeState>) => {
          recordedStates.push(state as NodeRuntimeState);
        }),
      };

      const result = await executeWait(node, ctx);
      expect(result.success).toBe(true);

      // Verify initial state had remainingSeconds set to 0.3s
      const initial = recordedStates[0];
      expect(initial.dynamicState?.totalSeconds).toBe(0.3);
      expect(initial.dynamicState?.remainingSeconds).toBe(0.3);
      expect(initial.dynamicState?.progress).toBe(0);

      // Verify intermediate countdown ticks occurred
      const intermediate = recordedStates.filter(
        (s) => s.dynamicState?.progress !== undefined && s.dynamicState.progress > 0 && s.dynamicState.progress < 100
      );
      expect(intermediate.length).toBeGreaterThanOrEqual(1);

      // Verify final success state has remainingSeconds 0 and progress 100%
      const final = recordedStates[recordedStates.length - 1];
      expect(final.status).toBe('success');
      expect(final.dynamicState?.remainingSeconds).toBe(0);
      expect(final.dynamicState?.progress).toBe(100);
      expect(final.dynamicState?.message).toContain('Waited');
    });
  });

  describe('Loop & Iterator Node Live Iteration Progress', () => {
    it('WorkflowEngine updates loopNode dynamicState on each iteration', async () => {
      const loopStates: any[] = [];

      const workflow: Workflow = {
        id: 'wf_loop_test',
        name: 'Loop Dynamic Test',
        nodes: [
          {
            id: 'loop_1',
            type: 'loopNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Loop 3x',
              category: 'logic',
              type: 'loop',
              properties: { count: 3 },
            },
          },
          {
            id: 'node_action',
            type: 'customNode',
            position: { x: 0, y: 150 },
            data: {
              label: 'Step Action',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'lastIdx', value: '{{index}}' },
            },
          },
        ],
        edges: [
          { id: 'edge_body', source: 'loop_1', target: 'node_action', sourceHandle: 'loop_body' },
        ],
        variables: {},
        settings: { timeout: 5000 },
      };

      const engine = new WorkflowEngine(workflow, {
        onNodeStateChange: (nodeId, state) => {
          if (nodeId === 'loop_1' && state.dynamicState) {
            loopStates.push({ ...state.dynamicState, status: state.status });
          }
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      // Should have emitted iterations 1, 2, 3
      const runningIterations = loopStates.filter((s) => s.status === 'running');
      expect(runningIterations.length).toBe(3);
      expect(runningIterations[0].currentIteration).toBe(1);
      expect(runningIterations[0].totalIterations).toBe(3);
      expect(runningIterations[0].progress).toBe(33);

      expect(runningIterations[2].currentIteration).toBe(3);
      expect(runningIterations[2].totalIterations).toBe(3);
      expect(runningIterations[2].progress).toBe(100);

      // Final success state
      const finalState = loopStates[loopStates.length - 1];
      expect(finalState.status).toBe('success');
      expect(finalState.message).toContain('Completed 3 iterations');
    });

    it('WorkflowEngine updates iteratorNode dynamicState during inline loop body execution', async () => {
      const iteratorStates: any[] = [];

      const workflow: Workflow = {
        id: 'wf_iterator_test',
        name: 'Iterator Dynamic Test',
        nodes: [
          {
            id: 'extract_all_1',
            type: 'iteratorNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Find Images',
              category: 'extraction',
              type: 'extract_all_images',
              properties: { itemVariable: 'currentImage' },
            },
          },
          {
            id: 'process_img',
            type: 'customNode',
            position: { x: 0, y: 150 },
            data: {
              label: 'Process',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'savedImg', value: '{{currentImage.url}}' },
            },
          },
        ],
        edges: [
          { id: 'edge_body', source: 'extract_all_1', target: 'process_img', sourceHandle: 'loop_body' },
        ],
        variables: {},
        settings: { timeout: 5000 },
      };

      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            success: true,
            count: 2,
            items: [
              { url: 'https://example.com/a.png', alt: 'A' },
              { url: 'https://example.com/b.png', alt: 'B' },
            ],
          }),
        },
      } as any;

      const engine = new WorkflowEngine(workflow, {
        onNodeStateChange: (nodeId, state) => {
          if (nodeId === 'extract_all_1' && state.dynamicState) {
            iteratorStates.push({ ...state.dynamicState, status: state.status });
          }
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      const runningIterations = iteratorStates.filter((s) => s.status === 'running');
      expect(runningIterations.length).toBe(2);
      expect(runningIterations[0].currentIteration).toBe(1);
      expect(runningIterations[0].totalIterations).toBe(2);
      expect(runningIterations[0].message).toBe('Image 1 of 2');

      const completed = iteratorStates[iteratorStates.length - 1];
      expect(completed.status).toBe('success');
      expect(completed.message).toBe('Processed 2 items');
    });
  });

  describe('Smart Scroll Executor', () => {
    it('executes smart_scroll passes and updates dynamicState', async () => {
      const scrollStates: any[] = [];
      const node: WorkflowNode = {
        id: 'smart_scroll_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Smart Scroll',
          category: 'interaction',
          type: 'smart_scroll',
          properties: {
            mode: 'to_bottom',
            maxScrolls: 3,
            scrollDelay: 20,
            distance: 400,
            outputVariable: 'myScrollResult',
          },
        },
      };

      const ctx: any = {
        variables: {},
        signal: new AbortSignal(),
        log: vi.fn(),
        updateNodeState: (id: string, s: any) => {
          if (s.dynamicState) scrollStates.push(s);
        },
      };

      const res = await executeSmartScroll(node, ctx);
      expect(res.success).toBe(true);
      expect(res.output.totalScrolls).toBe(3);
      expect(res.variables?.myScrollResult.totalScrolls).toBe(3);
      expect(scrollStates.length).toBeGreaterThanOrEqual(3);
      expect(scrollStates[scrollStates.length - 1].status).toBe('success');
    });
  });

  describe('Math & Counter Executor', () => {
    it('performs arithmetic operations: add, subtract, multiply, increment, formula', async () => {
      const states: any[] = [];
      const ctx: any = {
        variables: { counter: 5, price: 50 },
        log: vi.fn(),
        updateNodeState: (id: string, s: any) => states.push(s),
      };

      // 1. Increment
      const incNode: WorkflowNode = {
        id: 'math_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Increment Counter',
          category: 'data',
          type: 'math_calculate',
          properties: {
            operation: 'increment',
            leftOperand: '{{counter}}',
            rightOperand: '2',
            outputVariable: 'counter',
          },
        },
      };
      const res1 = await executeMathCalculate(incNode, ctx);
      expect(res1.success).toBe(true);
      expect(res1.output).toBe(7);
      expect(res1.variables?.counter).toBe(7);

      // 2. Formula expression
      const formulaNode: WorkflowNode = {
        id: 'math_2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Calculate Total with Tax',
          category: 'data',
          type: 'math_calculate',
          properties: {
            operation: 'formula',
            formula: '{{price}} * 1.1 + 10',
            outputVariable: 'grandTotal',
          },
        },
      };
      const res2 = await executeMathCalculate(formulaNode, ctx);
      expect(res2.success).toBe(true);
      expect(res2.output).toBe(65);
      expect(res2.variables?.grandTotal).toBe(65);
    });
  });

  describe('Download File Executor', () => {
    it('prepares and triggers download with dynamic feedback', async () => {
      const states: any[] = [];
      const node: WorkflowNode = {
        id: 'download_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Download Report',
          category: 'utility',
          type: 'download_file',
          properties: {
            sourceType: 'content',
            content: 'name,price\nApple,1.5\nBanana,0.8',
            filename: 'report.csv',
            outputVariable: 'dlResult',
          },
        },
      };

      const ctx: any = {
        variables: {},
        log: vi.fn(),
        updateNodeState: (id: string, s: any) => states.push(s),
      };

      const res = await executeDownloadFile(node, ctx);
      expect(res.success).toBe(true);
      expect(res.output.filename).toBe('report.csv');
      expect(res.variables?.dlResult.filename).toBe('report.csv');
      expect(states[states.length - 1].status).toBe('success');
      expect(states[states.length - 1].dynamicState?.message).toContain('Saved: report.csv');
    });
  });

  describe('Desktop Notification Executor', () => {
    it('dispatches desktop notification and sets dynamicState', async () => {
      const states: any[] = [];
      const node: WorkflowNode = {
        id: 'notif_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Show Done Notification',
          category: 'utility',
          type: 'show_notification',
          properties: {
            title: 'AutoFlow Done',
            message: 'All tasks completed successfully.',
            outputVariable: 'alertResult',
          },
        },
      };

      const ctx: any = {
        variables: {},
        log: vi.fn(),
        updateNodeState: (id: string, s: any) => states.push(s),
      };

      const res = await executeShowNotification(node, ctx);
      expect(res.success).toBe(true);
      expect(res.output.title).toBe('AutoFlow Done');
      expect(states[states.length - 1].status).toBe('success');
      expect(states[states.length - 1].dynamicState?.message).toContain('Alerted: AutoFlow Done');
    });
  });
});
