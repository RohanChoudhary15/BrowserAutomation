import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../src/runtime/engine';
import { Workflow, WorkflowNode } from '../src/types/workflow';
import { executeErrorHandler } from '../src/runtime/executors';

describe('Error Handler Node & Engine Interception', () => {
  describe('executeErrorHandler Direct Executor', () => {
    it('initializes error handler node and exposes default variables', async () => {
      const node: WorkflowNode = {
        id: 'err_handler_1',
        type: 'error_handler',
        position: { x: 0, y: 0 },
        data: {
          label: 'Error Handler',
          type: 'error_handler',
          properties: {
            mode: 'chosen',
            watchedNodeIds: ['node_risky'],
            action: 'continue',
          },
        },
      };

      const mockCtx: any = {
        variables: {},
        storage: {},
        dynamicStates: {},
      };

      const res = await executeErrorHandler(node, mockCtx);
      expect(res.success).toBe(true);
      expect(res.output.mode).toBe('chosen');
      expect(res.output.watchMode).toBe('chosen');
      expect(mockCtx.variables.hasError).toBe(false);
      expect(mockCtx.variables.lastError).toBe(null);
    });
  });

  describe('WorkflowEngine Error Interception', () => {
    it('catches error from chosen node without stopping the workflow', async () => {
      const executed: string[] = [];

      const wf: Workflow = {
        id: 'wf_error_test_1',
        name: 'Error Handler Test',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'node_start',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: { label: 'Start', category: 'data', type: 'set_variable', properties: { name: 'status', value: 'started' } },
          },
          {
            id: 'node_failing',
            type: 'customNode',
            position: { x: 0, y: 100 },
            data: {
              label: 'Parse Corrupt JSON',
              category: 'data',
              type: 'json_parse',
              properties: { text: 'MALFORMED_JSON_STRING {' },
            },
          },
          {
            id: 'err_handler',
            type: 'error_handler',
            position: { x: 200, y: 100 },
            data: {
              label: 'Error Shield',
              category: 'control_flow',
              type: 'error_handler',
              properties: {
                mode: 'chosen',
                watchedNodeIds: ['node_failing'],
                action: 'continue',
              },
            },
          },
          {
            id: 'node_recovery',
            type: 'customNode',
            position: { x: 200, y: 200 },
            data: {
              label: 'Recovery Notification',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'fallbackHandled', value: true },
            },
          },
          {
            id: 'node_final',
            type: 'customNode',
            position: { x: 0, y: 200 },
            data: {
              label: 'Final Step',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'completedNormally', value: true },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'node_start', target: 'node_failing' },
          { id: 'e2', source: 'node_failing', target: 'node_final' },
          // Error handler catch branch to recovery
          { id: 'e_err', source: 'err_handler', sourceHandle: 'error', target: 'node_recovery' },
        ],
      };

      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      // Check executed nodes
      expect(executed).toContain('node_start');
      expect(executed).toContain('err_handler');
      expect(executed).toContain('node_recovery');
      expect(executed).toContain('node_final');

      // Variables exposed by error handler
      const vars = engine.getVariables();
      expect(vars.hasError).toBe(true);
      expect(vars.lastErrorNodeId).toBe('node_failing');
      expect(vars.lastErrorNodeName).toBe('Parse Corrupt JSON');
      expect(vars.lastErrorMessage).toContain('JSON');
      expect(vars.fallbackHandled).toBe(true);
      expect(vars.completedNormally).toBe(true);

      // Workflow did not abort
      expect(engine.getStatus()).toBe('completed');
    });

    it('catches error when mode is "all"', async () => {
      const executed: string[] = [];

      const wf: Workflow = {
        id: 'wf_error_test_all',
        name: 'Error Handler All Mode',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'node_thrower',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Parse Broken Data',
              category: 'data',
              type: 'json_parse',
              properties: { text: '{ invalid json syntax' },
            },
          },
          {
            id: 'err_handler_global',
            type: 'error_handler',
            position: { x: 200, y: 0 },
            data: {
              label: 'Global Handler',
              category: 'control_flow',
              type: 'error_handler',
              properties: {
                mode: 'all',
                action: 'continue',
              },
            },
          },
          {
            id: 'node_fallback',
            type: 'customNode',
            position: { x: 200, y: 100 },
            data: {
              label: 'Save Fallback Value',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'usedDefault', value: true },
            },
          },
        ],
        edges: [
          { id: 'e_err', source: 'err_handler_global', sourceHandle: 'error', target: 'node_fallback' },
        ],
      };

      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executed.push(id);
        },
      });

      await engine.run();

      expect(executed).toContain('err_handler_global');
      expect(executed).toContain('node_fallback');

      const vars = engine.getVariables();
      expect(vars.hasError).toBe(true);
      expect(vars.lastErrorMessage).toContain('JSON');
      expect(vars.usedDefault).toBe(true);
      expect(engine.getStatus()).toBe('completed');
    });

    it('does not catch errors if node is not in watchedNodeIds list', async () => {
      const wf: Workflow = {
        id: 'wf_error_not_watched',
        name: 'Unwatched Error Test',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'node_unwatched_fail',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Unwatched Fail',
              category: 'data',
              type: 'json_parse',
              properties: { text: 'MALFORMED' },
            },
          },
          {
            id: 'err_handler_specific',
            type: 'error_handler',
            position: { x: 200, y: 0 },
            data: {
              label: 'Specific Handler',
              category: 'control_flow',
              type: 'error_handler',
              properties: {
                mode: 'chosen',
                watchedNodeIds: ['other_node_123'], // Not watching node_unwatched_fail
                action: 'continue',
              },
            },
          },
        ],
        edges: [],
      };

      const engine = new WorkflowEngine(wf);
      await engine.run();

      // Because node_unwatched_fail was not in watchedNodeIds and stopOnError is true,
      // the workflow failed.
      expect(engine.getStatus()).toBe('failed');
    });
  });
});
