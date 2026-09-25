export type ParallelMode = 'all' | 'settled' | 'race';
export type VariableMergeStrategy = 'merge' | 'isolated' | 'collect_datasets';

export interface ParallelBranchConfig {
  id: string;
  name: string;
  targetNodeId?: string;
  timeoutMs?: number;
  continueOnError?: boolean;
}

export interface ParallelExecutionOptions {
  mode?: ParallelMode; // 'all' | 'settled' | 'race'
  maxConcurrency?: number; // 0 = unlimited, or 1-10
  timeoutMs?: number; // Global timeout
  continueOnError?: boolean;
  mergeStrategy?: VariableMergeStrategy;
  outputVariable?: string; // default: 'parallelResults'
}

export interface ParallelBranchResult {
  branchId: string;
  branchName: string;
  status: 'completed' | 'failed' | 'timeout';
  output?: any;
  variables?: Record<string, any>;
  durationMs: number;
  error?: string;
}

export interface ParallelExecutionResult {
  success: boolean;
  mode: ParallelMode;
  totalBranches: number;
  completedCount: number;
  failedCount: number;
  branches: ParallelBranchResult[];
  combinedVariables: Record<string, any>;
  collectedDatasets: any[][];
  winningBranch?: string; // for 'race' mode
  durationMs: number;
}

/**
 * Lightweight concurrency throttle pool (runs tasks up to maxConcurrency at once)
 */
export async function runThrottled<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number
): Promise<T[]> {
  if (maxConcurrency <= 0 || maxConcurrency >= tasks.length) {
    return Promise.all(tasks.map((t) => t()));
  }

  const results: T[] = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Orchestrates parallel branch execution with timeouts, error strategies, and variable merging
 */
export async function orchestrateParallelBranches(
  branches: ParallelBranchConfig[],
  executorFn: (branch: ParallelBranchConfig, signal: AbortSignal) => Promise<{ output?: any; variables?: Record<string, any> }>,
  options: ParallelExecutionOptions = {}
): Promise<ParallelExecutionResult> {
  const {
    mode = 'all',
    maxConcurrency = 0,
    timeoutMs = 30000,
    continueOnError = mode === 'settled',
    mergeStrategy = 'merge',
    outputVariable = 'parallelResults',
  } = options;

  const startTime = Date.now();
  const branchResults: ParallelBranchResult[] = [];
  const abortCtrl = new AbortController();

  // If global timeout set, trigger abort
  let globalTimer: any = null;
  if (timeoutMs > 0) {
    globalTimer = setTimeout(() => {
      abortCtrl.abort();
    }, timeoutMs);
  }

  const runBranch = async (branch: ParallelBranchConfig): Promise<ParallelBranchResult> => {
    const branchStart = Date.now();
    const branchTimeout = branch.timeoutMs || timeoutMs;

    try {
      // Race execution against individual branch timeout if configured
      let timeoutId: any = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (branchTimeout > 0) {
          timeoutId = setTimeout(() => {
            reject(new Error(`Branch "${branch.name}" timed out after ${branchTimeout}ms`));
          }, branchTimeout);
        }
      });

      const execPromise = executorFn(branch, abortCtrl.signal);
      const res = await Promise.race([execPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      const result: ParallelBranchResult = {
        branchId: branch.id,
        branchName: branch.name,
        status: 'completed',
        output: res.output,
        variables: res.variables,
        durationMs: Date.now() - branchStart,
      };
      return result;
    } catch (err: any) {
      const isTimeout = String(err.message || '').includes('timed out');
      const result: ParallelBranchResult = {
        branchId: branch.id,
        branchName: branch.name,
        status: isTimeout ? 'timeout' : 'failed',
        error: err.message || String(err),
        durationMs: Date.now() - branchStart,
      };

      if (!continueOnError && !branch.continueOnError && mode === 'all') {
        abortCtrl.abort(); // Cancel remaining branches
        throw err;
      }
      return result;
    }
  };

  try {
    if (mode === 'race') {
      // Race: first to finish resolves immediately
      const winner = await Promise.race(branches.map((b) => runBranch(b)));
      abortCtrl.abort();
      if (globalTimer) clearTimeout(globalTimer);

      return {
        success: winner.status === 'completed',
        mode,
        totalBranches: branches.length,
        completedCount: winner.status === 'completed' ? 1 : 0,
        failedCount: winner.status !== 'completed' ? 1 : 0,
        branches: [winner],
        winningBranch: winner.branchId,
        combinedVariables: winner.variables || {},
        collectedDatasets: Array.isArray(winner.output) ? [winner.output] : [],
        durationMs: Date.now() - startTime,
      };
    }

    // Run parallel or throttled
    const taskFns = branches.map((b) => () => runBranch(b));
    let executed: ParallelBranchResult[] = [];

    if (mode === 'settled' || continueOnError) {
      if (maxConcurrency > 0) {
        executed = await runThrottled(taskFns, maxConcurrency);
      } else {
        const settled = await Promise.allSettled(branches.map((b) => runBranch(b)));
        executed = settled.map((s, idx) => {
          if (s.status === 'fulfilled') return s.value;
          return {
            branchId: branches[idx].id,
            branchName: branches[idx].name,
            status: 'failed',
            error: s.reason?.message || String(s.reason),
            durationMs: 0,
          };
        });
      }
    } else {
      // Strict Promise.all
      if (maxConcurrency > 0) {
        executed = await runThrottled(taskFns, maxConcurrency);
      } else {
        executed = await Promise.all(branches.map((b) => runBranch(b)));
      }
    }

    if (globalTimer) clearTimeout(globalTimer);

    const completed = executed.filter((r) => r.status === 'completed');
    const failed = executed.filter((r) => r.status !== 'completed');

    // Aggregate variables
    const combinedVariables: Record<string, any> = {};
    const collectedDatasets: any[][] = [];

    if (mergeStrategy === 'merge') {
      for (const branch of completed) {
        if (branch.variables) {
          Object.assign(combinedVariables, branch.variables);
        }
      }
    } else if (mergeStrategy === 'isolated') {
      for (const branch of executed) {
        const cleanName = branch.branchName.replace(/[^a-zA-Z0-9_]/g, '_');
        combinedVariables[cleanName] = branch.output;
        if (branch.variables) {
          combinedVariables[`${cleanName}_vars`] = branch.variables;
        }
      }
    }

    // Always gather datasets if outputs are arrays (ready for combine_datasets)
    for (const branch of completed) {
      if (Array.isArray(branch.output)) {
        collectedDatasets.push(branch.output);
      } else if (branch.output && Array.isArray(branch.output.items)) {
        collectedDatasets.push(branch.output.items);
      }
    }

    combinedVariables[`${outputVariable}_summary`] = executed.map((b) => ({
      branch: b.branchName,
      status: b.status,
      output: b.output,
      durationMs: b.durationMs,
      error: b.error,
    }));
    combinedVariables[`${outputVariable}_datasets`] = collectedDatasets;

    return {
      success: failed.length === 0 || continueOnError,
      mode,
      totalBranches: branches.length,
      completedCount: completed.length,
      failedCount: failed.length,
      branches: executed,
      combinedVariables,
      collectedDatasets,
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (globalTimer) clearTimeout(globalTimer);
  }
}
