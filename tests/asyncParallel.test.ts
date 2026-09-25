import { describe, it, expect, vi } from 'vitest';
import {
  runThrottled,
  orchestrateParallelBranches,
  ParallelBranchConfig,
} from '../src/utils/parallelOrchestrator';
import { executeAsyncParallel } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

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
});
