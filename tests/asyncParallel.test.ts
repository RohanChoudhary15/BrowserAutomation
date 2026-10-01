import { describe, it, expect, vi } from 'vitest';
import {
  runThrottled,
  orchestrateParallelBranches,
  ParallelBranchConfig,
} from '../src/utils/parallelOrchestrator';
import { executeAsyncParallel } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';
import { WorkflowEngine } from '../src/runtime/engine';

describe('Async Parallel Orchestrator & Executor', () => {
  it('throttles task concurrency pool with runThrottled', async () => {
    let active = 0;
    let maxObserved = 0;

    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      active++;
      if (active > maxObserved) maxObserved = active;
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return i * 2;
    });

    const results = await runThrottled(tasks, 2);

    expect(results).toEqual([0, 2, 4, 6, 8, 10]);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('orchestrates branches in Promise.all mode successfully', async () => {
    const branches: ParallelBranchConfig[] = [
      { id: 'b1', name: 'Branch Alpha' },
      { id: 'b2', name: 'Branch Beta' },
    ];

    const result = await orchestrateParallelBranches(
      branches,
      async (branch) => {
        return {
          output: { name: branch.name, count: 10 },
          variables: { [`${branch.id}_done`]: true },
        };
      },
      { mode: 'all', mergeStrategy: 'merge' }
    );

    expect(result.success).toBe(true);
    expect(result.completedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.combinedVariables.b1_done).toBe(true);
    expect(result.combinedVariables.b2_done).toBe(true);
  });

  it('handles settled mode when one branch encounters an error', async () => {
    const branches: ParallelBranchConfig[] = [
      { id: 'b1', name: 'Good Branch' },
      { id: 'b2', name: 'Failing Branch' },
    ];

    const result = await orchestrateParallelBranches(
      branches,
      async (branch) => {
        if (branch.id === 'b2') throw new Error('Simulated branch failure');
        return { output: 'success' };
      },
      { mode: 'settled', continueOnError: true }
    );

    expect(result.totalBranches).toBe(2);
    expect(result.completedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.branches[1].status).toBe('failed');
    expect(result.branches[1].error).toContain('Simulated branch failure');
  });

  it('resolves the first branch in race mode', async () => {
    const branches: ParallelBranchConfig[] = [
      { id: 'b_slow', name: 'Slow Branch' },
      { id: 'b_fast', name: 'Fast Branch' },
    ];

    const result = await orchestrateParallelBranches(
      branches,
      async (branch) => {
        if (branch.id === 'b_slow') {
          await new Promise((r) => setTimeout(r, 60));
          return { output: 'slow' };
        }
        await new Promise((r) => setTimeout(r, 5));
        return { output: 'fast' };
      },
      { mode: 'race' }
    );

    expect(result.winningBranch).toBe('b_fast');
  });

  it('collects datasets with collect_datasets merge strategy', async () => {
    const branches: ParallelBranchConfig[] = [
      { id: 'b1', name: 'Branch 1' },
      { id: 'b2', name: 'Branch 2' },
    ];

    const result = await orchestrateParallelBranches(
      branches,
      async (branch) => {
        return {
          output: [{ item: branch.id }],
        };
      },
      { mergeStrategy: 'collect_datasets' }
    );

    expect(result.collectedDatasets.length).toBe(2);
    expect(result.collectedDatasets[0]).toEqual([{ item: 'b1' }]);
    expect(result.collectedDatasets[1]).toEqual([{ item: 'b2' }]);
  });

  it('executes async_parallel node via executeAsyncParallel executor', async () => {
    const node: WorkflowNode = {
      id: 'parallel_node_1',
      type: 'async_parallel',
      position: { x: 0, y: 0 },
      data: {
        label: 'Parallel Execution',
        type: 'async_parallel',
        properties: {
          mode: 'all',
          branches: [
            { id: 'branch_1', name: 'Lane 1' },
            { id: 'branch_2', name: 'Lane 2' },
          ],
          outputVariable: 'myParallelRun',
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: {},
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeAsyncParallel(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.myParallelRun).toBeDefined();
    expect(ctx.variables.myParallelRun.totalBranches).toBe(2);
    expect(ctx.variables.myParallelRun.completedCount).toBe(2);
  });

  it('executes connected branch nodes in parallel via engine.run()', async () => {
    const executedNodes: string[] = [];

    const engine = new WorkflowEngine(
      {
        id: 'wf-parallel-run',
        name: 'Workflow Parallel Run Test',
        nodes: [
          {
            id: 'node_start',
            type: 'set_variable',
            position: { x: 0, y: 0 },
            data: {
              label: 'Init',
              type: 'set_variable',
              category: 'data',
              properties: {
                name: 'initKey',
                value: 'hello',
              },
            },
          },
          {
            id: 'node_parallel',
            type: 'async_parallel',
            position: { x: 150, y: 0 },
            data: {
              label: 'Parallel Split',
              type: 'async_parallel',
              category: 'flow',
              properties: {
                mode: 'all',
                branches: [
                  { id: 'branch_a', name: 'Branch A' },
                  { id: 'branch_b', name: 'Branch B' },
                ],
                outputVariable: 'parallelSummary',
              },
            },
          },
          {
            id: 'node_branch_1',
            type: 'set_variable',
            position: { x: 300, y: -50 },
            data: {
              label: 'Branch 1 Work',
              type: 'set_variable',
              category: 'data',
              properties: {
                name: 'branch1_var',
                value: 'value_a',
              },
            },
          },
          {
            id: 'node_branch_2',
            type: 'set_variable',
            position: { x: 300, y: 50 },
            data: {
              label: 'Branch 2 Work',
              type: 'set_variable',
              category: 'data',
              properties: {
                name: 'branch2_var',
                value: 'value_b',
              },
            },
          },
          {
            id: 'node_merge',
            type: 'set_variable',
            position: { x: 450, y: 0 },
            data: {
              label: 'Merge Point',
              type: 'set_variable',
              category: 'data',
              properties: {
                name: 'combined_vars',
                value: '{{branch1_var}} + {{branch2_var}}',
              },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'node_start', target: 'node_parallel' },
          { id: 'e2', source: 'node_parallel', target: 'node_branch_1', sourceHandle: 'branch_branch_a' },
          { id: 'e3', source: 'node_parallel', target: 'node_branch_2', sourceHandle: 'branch_branch_b' },
          { id: 'e4', source: 'node_branch_1', target: 'node_merge' },
          { id: 'e5', source: 'node_branch_2', target: 'node_merge' },
        ],
      },
      {
        onNodeStateChange: (nodeId, state) => {
          if (state.status === 'running' || state.status === 'success') {
            if (!executedNodes.includes(nodeId)) {
              executedNodes.push(nodeId);
            }
          }
        },
      }
    );

    await engine.run();

    expect(executedNodes).toContain('node_start');
    expect(executedNodes).toContain('node_parallel');
    expect(executedNodes).toContain('node_branch_1');
    expect(executedNodes).toContain('node_branch_2');
    expect(executedNodes).toContain('node_merge');

    const vars = engine.getVariables();
    expect(vars.branch1_var).toBe('value_a');
    expect(vars.branch2_var).toBe('value_b');
    expect(vars.combined_vars).toBe('value_a + value_b');
    expect(vars.parallelSummary).toBeDefined();
    expect(vars.parallelSummary.completedCount).toBe(2);
  });

  it('executes connected branch nodes when triggered via engine.runSingleNode() on async_parallel', async () => {
    const executedNodes: string[] = [];

    const engine = new WorkflowEngine(
      {
        id: 'wf-parallel-single-node',
        name: 'Workflow Single Node Parallel Test',
        nodes: [
          {
            id: 'node_parallel_single',
            type: 'async_parallel',
            position: { x: 0, y: 0 },
            data: {
              label: 'Parallel Split Single',
              type: 'async_parallel',
              category: 'flow',
              properties: {
                mode: 'all',
                branches: [
                  { id: 'branch_x', name: 'Branch X' },
                  { id: 'branch_y', name: 'Branch Y' },
                ],
                outputVariable: 'singleParallelRun',
              },
            },
          },
          {
            id: 'node_worker_x',
            type: 'set_variable',
            position: { x: 200, y: -40 },
            data: {
              label: 'Worker X',
              type: 'set_variable',
              category: 'data',
              properties: {
                name: 'resX',
                value: 'computed_x',
              },
            },
          },
          {
            id: 'node_worker_y',
            type: 'set_variable',
            position: { x: 200, y: 40 },
            data: {
              label: 'Worker Y',
              type: 'set_variable',
              category: 'data',
              properties: {
                name: 'resY',
                value: 'computed_y',
              },
            },
          },
        ],
        edges: [
          { id: 'e_px', source: 'node_parallel_single', target: 'node_worker_x', sourceHandle: 'branch_branch_x' },
          { id: 'e_py', source: 'node_parallel_single', target: 'node_worker_y', sourceHandle: 'branch_branch_y' },
        ],
      },
      {
        onNodeStateChange: (nodeId, state) => {
          if (state.status === 'running' || state.status === 'success') {
            if (!executedNodes.includes(nodeId)) {
              executedNodes.push(nodeId);
            }
          }
        },
      }
    );

    await engine.runSingleNode('node_parallel_single');

    expect(executedNodes).toContain('node_parallel_single');
    expect(executedNodes).toContain('node_worker_x');
    expect(executedNodes).toContain('node_worker_y');

    const vars = engine.getVariables();
    expect(vars.resX).toBe('computed_x');
    expect(vars.resY).toBe('computed_y');
    expect(vars.singleParallelRun).toBeDefined();
    expect(vars.singleParallelRun.completedCount).toBe(2);
  });
});
