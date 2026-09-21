import { Workflow, WorkflowNode, WorkflowEdge } from '../types/workflow';
import { ExecutionContext, NodeRuntimeState, ExecutionLog, WorkflowExecutionStatus } from '../types/execution';
import { executors } from './executors';
import { generateId } from '../utils/id';
import { createFriendlyError } from '../utils/formatters';
import { interpolateVariables } from './interpolator';
import { HumanConfig, nodeThinkTime, randomBetween, resolveHumanConfig, wait } from '../utils/human';

export interface EngineEvents {
  onStatusChange?: (status: WorkflowExecutionStatus) => void;
  onNodeStateChange?: (nodeId: string, state: Partial<NodeRuntimeState>) => void;
  onLog?: (log: ExecutionLog) => void;
  onVariablesChange?: (variables: Record<string, any>) => void;
}

export class WorkflowEngine {
  private workflow: Workflow;
  private abortController: AbortController | null = null;
  private status: WorkflowExecutionStatus = 'idle';
  private variables: Record<string, any> = {};
  private events: EngineEvents;
  private isPaused = false;
  private resumeResolve: (() => void) | null = null;
  /** Resolved Human Mode config — undefined unless the workflow enables it. */
  private human: HumanConfig | undefined;
  /** Tracks input arrivals for converging gate nodes: gateNodeId -> Map(sourceNodeId -> inputData) */
  private gateInputsState = new Map<string, Map<string, { result: boolean; output: any; nodeName: string }>>();
  /** Tracks which gate nodes have already fired during this execution pass */
  private triggeredGates = new Set<string>();

  constructor(workflow: Workflow, events: EngineEvents = {}) {
    this.workflow = workflow;
    this.events = events;
    this.variables = { ...workflow.variables };
    this.human = resolveHumanConfig(workflow.settings);
  }

  getStatus(): WorkflowExecutionStatus {
    return this.status;
  }

  getVariables(): Record<string, any> {
    return { ...this.variables };
  }

  private setStatus(status: WorkflowExecutionStatus) {
    this.status = status;
    this.events.onStatusChange?.(status);
  }

  private updateNodeState(nodeId: string, state: Partial<NodeRuntimeState>) {
    this.events.onNodeStateChange?.(nodeId, state);
  }

  private log(logData: Omit<ExecutionLog, 'id' | 'timestamp'>) {
    const log: ExecutionLog = {
      id: generateId('log'),
      timestamp: Date.now(),
      ...logData,
    };
    this.events.onLog?.(log);
  }

  /**
   * Pauses workflow execution
   */
  pause() {
    if (this.status === 'running') {
      this.isPaused = true;
      this.setStatus('paused');
      this.log({ level: 'info', message: 'Workflow paused by user.' });
    }
  }

  /**
   * Resumes workflow execution
   */
  resume() {
    if (this.status === 'paused') {
      this.isPaused = false;
      this.setStatus('running');
      this.log({ level: 'info', message: 'Workflow resumed.' });
      if (this.resumeResolve) {
        this.resumeResolve();
        this.resumeResolve = null;
      }
    }
  }

  /**
   * Immediately stops and cancels workflow execution
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isPaused = false;
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
    this.setStatus('stopped');
    this.log({ level: 'warn', message: 'Workflow stopped by user.' });
  }

  /**
   * Runs an individual node for debugging
   */
  async runSingleNode(node: WorkflowNode, initialVariables?: Record<string, any>): Promise<any> {
    const controller = new AbortController();
    const vars = initialVariables ? { ...initialVariables } : { ...this.variables };

    const ctx: ExecutionContext = {
      workflowId: this.workflow.id,
      executionId: generateId('exec_single'),
      variables: vars,
      signal: controller.signal,
      human: this.human,
      log: (l) => this.log(l),
      updateNodeState: (id, s) => this.updateNodeState(id, s),
    };

    try {
      this.updateNodeState(node.id, { status: 'running', startTime: Date.now() });
      const result = await this.executeNodeWithRetry(node, ctx);
      this.updateNodeState(node.id, { status: 'success', endTime: Date.now(), output: result.output });
      if (result.variables) {
        Object.assign(this.variables, result.variables);
        this.events.onVariablesChange?.(this.variables);
      }
      return result;
    } catch (err: any) {
      this.updateNodeState(node.id, { status: 'error', endTime: Date.now(), error: err.message });
      throw err;
    }
  }

  /**
   * Starts executing the workflow
   */
  async run(options: { startNodeId?: string; isStepMode?: boolean } = {}) {
    if (this.status === 'running') return;

    this.abortController = new AbortController();
    this.setStatus('running');
    this.variables = { ...this.workflow.variables };
    this.events.onVariablesChange?.(this.variables);
    this.gateInputsState.clear();
    this.triggeredGates.clear();

    this.log({
      level: 'info',
      message: `Starting workflow "${this.workflow.name}"`,
    });

    if (this.human) {
      this.log({
        level: 'info',
        message: `Human mode enabled (${this.human.intensity} pacing · cursor ${
          this.human.cursor ? 'on' : 'off'
        })`,
      });
    }

    const ctx: ExecutionContext = {
      workflowId: this.workflow.id,
      executionId: generateId('exec'),
      variables: this.variables,
      signal: this.abortController.signal,
      isStepMode: options.isStepMode,
      human: this.human,
      log: (l) => this.log(l),
      updateNodeState: (id, s) => this.updateNodeState(id, s),
    };

    // Reset all node states to queued / idle
    this.workflow.nodes.forEach(n => {
      this.updateNodeState(n.id, { status: n.data.disabled ? 'disabled' : 'idle' });
    });

    try {
      let startNodes: WorkflowNode[] = [];
      if (options.startNodeId) {
        const found = this.workflow.nodes.find(n => n.id === options.startNodeId);
        if (found) startNodes = [found];
      }

      if (startNodes.length === 0) {
        // Find nodes with no incoming edges
        const targetIds = new Set(this.workflow.edges.map(e => e.target));
        startNodes = this.workflow.nodes.filter(n => !targetIds.has(n.id));
      }

      if (startNodes.length === 0 && this.workflow.nodes.length > 0) {
        startNodes = [this.workflow.nodes[0]];
      }

      await Promise.all(startNodes.map((startNode) => this.traverseAndExecute(startNode, ctx)));

      if (this.status === 'running') {
        this.setStatus('completed');
        this.log({ level: 'success', message: 'Workflow completed successfully.' });
      }
    } catch (err: any) {
      if (ctx.signal.aborted) {
        this.setStatus('stopped');
      } else {
        this.setStatus('failed');
        this.log({ level: 'error', message: `Workflow execution error: ${err.message}` });
      }
    }
  }

  /**
   * Traverses node execution along edges
   */
  private async traverseAndExecute(node: WorkflowNode, ctx: ExecutionContext): Promise<void> {
    if (ctx.signal.aborted) return;

    // Check pause state
    if (this.isPaused) {
      await new Promise<void>((resolve) => {
        this.resumeResolve = resolve;
      });
    }

    if (node.data.disabled) {
      this.updateNodeState(node.id, { status: 'skipped' });
      const nextNodes = this.getNextNodes(node.id);
      for (const next of nextNodes) {
        await this.traverseAndExecute(next, ctx);
      }
      return;
    }

    // Handle Loop / For Each Node
    if (node.data.type === 'loop' || node.data.type === 'for_each') {
      await this.executeLoop(node, ctx);
      return;
    }

    // Execute standard node
    const startTime = Date.now();

    // Human Mode: think for a beat before acting on each node, so the run
    // reads like a person working through the page rather than a script.
    if (this.human) {
      const think = nodeThinkTime(this.human);
      if (think > 0) await wait(think, ctx.signal);
      if (ctx.signal.aborted) return;
    }

    this.updateNodeState(node.id, { status: 'running', startTime });

    try {
      const result = await this.executeNodeWithRetry(node, ctx);
      const durationMs = Date.now() - startTime;

      this.updateNodeState(node.id, {
        status: 'success',
        endTime: Date.now(),
        durationMs,
        output: result.output,
      });

      if (result.variables) {
        Object.assign(this.variables, result.variables);
        this.events.onVariablesChange?.(this.variables);
      }

      // Step mode pause
      if (ctx.isStepMode) {
        this.pause();
      }

      // Check if this node has inline loop body attached (e.g. extract_all_images, extract_multiple, extract_image, or any node with loop_body handle)
      const bodyNodes = this.getNextNodes(node.id, 'loop_body');
      const doneNodes = this.getNextNodes(node.id, 'loop_done');

      if (bodyNodes.length > 0) {
        // Resolve collection to iterate over
        let items: any[] = [];
        if (Array.isArray(result.output)) {
          items = result.output;
        } else if (Array.isArray(result.items)) {
          items = result.items;
        } else if (node.data.properties?.outputVariable && Array.isArray(this.variables[node.data.properties.outputVariable])) {
          items = this.variables[node.data.properties.outputVariable];
        } else if (result.output !== undefined && result.output !== null) {
          items = [result.output];
        }

        const isImageNode = node.data.type === 'extract_all_images' || node.data.type === 'extract_image';
        const isElementNode = node.data.type === 'extract_multiple' || node.data.type === 'crawl_pagination';
        const customVar = node.data.properties?.itemVariable;

        this.log({
          level: 'info',
          message: `Iterating loop body for ${items.length} items from ${node.data.label}`,
          nodeId: node.id,
          nodeName: node.data.label,
        });

        const totalItems = items.length;
        for (let index = 0; index < totalItems; index++) {
          if (ctx.signal.aborted) break;
          const item = items[index];

          ctx.variables.index = index;
          ctx.variables.item = item;
          if (isImageNode) {
            ctx.variables.currentImage = item;
            if (typeof item === 'object' && item !== null) {
              if (item.url) ctx.variables.imageUrl = item.url;
              if (item.dataUrl) ctx.variables.imageDataUrl = item.dataUrl;
            } else if (typeof item === 'string') {
              ctx.variables.imageUrl = item;
            }
          }
          if (isElementNode) {
            ctx.variables.currentElement = item;
          }
          if (customVar) {
            ctx.variables[customVar] = item;
          }

          Object.assign(this.variables, ctx.variables);
          this.events.onVariablesChange?.(this.variables);

          const progress = Math.round(((index + 1) / Math.max(1, totalItems)) * 100);
          const detail = typeof item === 'object' && item?.url
            ? item.url
            : typeof item === 'string'
            ? item.slice(0, 30)
            : undefined;

          this.updateNodeState(node.id, {
            status: 'running',
            dynamicState: {
              currentIteration: index + 1,
              totalIterations: totalItems,
              currentItem: item,
              progress,
              message: isImageNode
                ? `Image ${index + 1} of ${totalItems}`
                : `Element ${index + 1} of ${totalItems}`,
              detail,
            },
          });

          for (const bNode of bodyNodes) {
            if (ctx.signal.aborted) break;
            await this.traverseAndExecute(bNode, ctx);
          }
        }

        this.updateNodeState(node.id, {
          status: 'success',
          dynamicState: {
            currentIteration: totalItems,
            totalIterations: totalItems,
            progress: 100,
            message: `Processed ${totalItems} items`,
          },
        });

        // After loop completes, follow 'loop_done' edges (or any non-loop_body edges)
        const continuationNodes = doneNodes.length > 0
          ? doneNodes
          : this.getNextNodes(node.id).filter(n => !bodyNodes.some(bn => bn.id === n.id));

        await this.proceedToNextNodes(node, result, continuationNodes, ctx);
      } else {
        // Standard branch execution
        const nextNodes = this.getNextNodes(node.id, result.nextBranch);
        await this.proceedToNextNodes(node, result, nextNodes, ctx);
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const friendly = createFriendlyError(node.data.label, err, {
        selector: node.data.properties.selector,
        timeoutMs: node.data.properties.timeout,
        url: node.data.properties.url,
      });

      this.updateNodeState(node.id, {
        status: 'error',
        endTime: Date.now(),
        durationMs,
        error: friendly.message,
        errorDetails: {
          message: friendly.message,
          suggestions: friendly.suggestions,
          selector: friendly.selector,
          timeout: friendly.timeoutMs,
        },
      });

      this.log({
        level: 'error',
        nodeId: node.id,
        nodeName: node.data.label,
        message: friendly.message,
        durationMs,
      });

      if (this.workflow.settings.stopOnError !== false) {
        throw err;
      }
    }
  }

  /**
   * Executes a loop construct
   */
  private async executeLoop(loopNode: WorkflowNode, ctx: ExecutionContext): Promise<void> {
    const isForEach = loopNode.data.type === 'for_each';
    let iterations: any[] = [];

    if (isForEach) {
      const arrayVal = interpolateVariables(loopNode.data.properties.array, ctx.variables);
      iterations = Array.isArray(arrayVal) ? arrayVal : [];
    } else {
      const count = Number(interpolateVariables(loopNode.data.properties.count, ctx.variables)) || 1;
      iterations = Array.from({ length: Math.min(count, 500) }, (_, i) => i);
    }

    const bodyNodes = this.getNextNodes(loopNode.id, 'loop_body');
    const doneNodes = this.getNextNodes(loopNode.id, 'loop_done');

    this.log({
      level: 'info',
      message: `Starting loop with ${iterations.length} iterations`,
      nodeId: loopNode.id,
      nodeName: loopNode.data.label,
    });

    const totalIterations = iterations.length;
    for (let index = 0; index < totalIterations; index++) {
      if (ctx.signal.aborted) break;

      const item = iterations[index];
      ctx.variables.index = index;
      ctx.variables.item = item;
      this.events.onVariablesChange?.(this.variables);

      const progress = Math.round(((index + 1) / Math.max(1, totalIterations)) * 100);
      const detail = typeof item === 'object'
        ? (item?.name || item?.id || item?.url || JSON.stringify(item).slice(0, 25))
        : String(item);

      this.updateNodeState(loopNode.id, {
        status: 'running',
        dynamicState: {
          currentIteration: index + 1,
          totalIterations,
          currentItem: item,
          progress,
          message: isForEach
            ? `Item ${index + 1} of ${totalIterations}`
            : `Iteration ${index + 1} of ${totalIterations}`,
          detail: isForEach ? detail : undefined,
        },
      });

      let shouldBreak = false;
      for (const bNode of bodyNodes) {
        if (ctx.signal.aborted) break;
        await this.traverseAndExecute(bNode, ctx);
      }

      if (shouldBreak) break;
    }

    this.updateNodeState(loopNode.id, {
      status: 'success',
      dynamicState: {
        currentIteration: totalIterations,
        totalIterations,
        progress: 100,
        message: `Completed ${totalIterations} iterations`,
      },
    });

    // Once loop completes, continue on 'loop_done' branch
    for (const dNode of doneNodes) {
      if (ctx.signal.aborted) break;
      await this.traverseAndExecute(dNode, ctx);
    }
  }

  /**
   * Executes a node with retry support
   */
  private async executeNodeWithRetry(node: WorkflowNode, ctx: ExecutionContext): Promise<any> {
    const executor = executors[node.data.type];
    if (!executor) {
      throw new Error(`No executor found for node type: ${node.data.type}`);
    }

    const maxRetries = this.workflow.settings.retryCount || 0;
    const retryDelay = this.workflow.settings.retryDelay || 1000;

    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (ctx.signal.aborted) throw new Error('Execution aborted by user.');

      try {
        if (attempt > 0) {
          this.log({
            level: 'warn',
            message: `Retrying ${node.data.label} (attempt ${attempt}/${maxRetries})...`,
            nodeId: node.id,
            nodeName: node.data.label,
          });
          await new Promise(r => setTimeout(r, this.human ? Math.round(retryDelay * randomBetween(0.85, 1.3)) : retryDelay));
        }

        return await executor(node, ctx);
      } catch (err) {
        lastError = err;
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError;
  }

  /**
   * Forwards execution from sourceNode along outgoing branches to nextNodes.
   * Handles multi-branch merging and synchronization for logic gates (AND, OR, NAND, NOR).
   */
  private async proceedToNextNodes(
    sourceNode: WorkflowNode,
    sourceResult: any,
    nextNodes: WorkflowNode[],
    ctx: ExecutionContext
  ): Promise<void> {
    if (ctx.signal.aborted) return;

    const handleNext = async (next: WorkflowNode) => {
      if (ctx.signal.aborted) return;

      const incomingEdges = this.workflow.edges.filter((e) => e.target === next.id);
      const isLogicGate =
        ['and', 'or', 'nand', 'nor', 'logic_and', 'logic_or', 'logic_nand', 'logic_nor'].includes(
          next.data.type
        ) ||
        next.type === 'logicGateNode' ||
        incomingEdges.length > 1;

      if (!isLogicGate || incomingEdges.length <= 1) {
        // Standard single-input node
        await this.traverseAndExecute(next, ctx);
        return;
      }

      // Logic Gate or multi-input converge point:
      if (!this.gateInputsState.has(next.id)) {
        this.gateInputsState.set(next.id, new Map());
      }
      const arrivals = this.gateInputsState.get(next.id)!;

      const isBranchTrue =
        sourceResult.nextBranch === 'true' ||
        sourceResult.output?.result === true ||
        sourceResult.output?.present === true ||
        (sourceResult.nextBranch !== 'false' && sourceResult.output !== false && sourceResult.success);

      arrivals.set(sourceNode.id, {
        result: isBranchTrue,
        output: sourceResult.output,
        nodeName: sourceNode.data.label,
      });

      const totalExpected = incomingEdges.length;
      const rawType = String(next.data.type || '').toLowerCase();
      let gate = String(next.data.properties?.gate || '').toUpperCase();
      if (!gate) {
        if (rawType.includes('and') && !rawType.includes('nand')) gate = 'AND';
        else if (rawType.includes('nand')) gate = 'NAND';
        else if (rawType.includes('nor')) gate = 'NOR';
        else gate = 'OR';
      }

      let shouldTrigger = false;

      if (gate === 'OR') {
        // OR Gate: Triggers on first TRUE branch, or after all arrived if none TRUE
        if (isBranchTrue && !this.triggeredGates.has(next.id)) {
          shouldTrigger = true;
        } else if (arrivals.size === totalExpected && !this.triggeredGates.has(next.id)) {
          shouldTrigger = true;
        }
      } else if (gate === 'NAND') {
        // NAND Gate: Short-circuit to TRUE on first FALSE branch, or after all arrived
        if (!isBranchTrue && !this.triggeredGates.has(next.id)) {
          shouldTrigger = true;
        } else if (arrivals.size === totalExpected && !this.triggeredGates.has(next.id)) {
          shouldTrigger = true;
        }
      } else if (gate === 'NOR') {
        // NOR Gate: Short-circuit to FALSE on first TRUE branch, or after all arrived
        if (isBranchTrue && !this.triggeredGates.has(next.id)) {
          shouldTrigger = true;
        } else if (arrivals.size === totalExpected && !this.triggeredGates.has(next.id)) {
          shouldTrigger = true;
        }
      } else {
        // AND Gate: Requires ALL incoming branches to arrive!
        if (arrivals.size === totalExpected && !this.triggeredGates.has(next.id)) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        this.triggeredGates.add(next.id);
        ctx._gateInputs = {
          ...(ctx._gateInputs || {}),
          [next.id]: Array.from(arrivals.values()),
        };

        this.log({
          level: 'info',
          message: `${gate} Gate combining ${arrivals.size}/${totalExpected} incoming branches into 1 output`,
          nodeId: next.id,
          nodeName: next.data.label,
        });

        await this.traverseAndExecute(next, ctx);
      }
    };

    await Promise.all(nextNodes.map((n) => handleNext(n)));
  }

  /**
   * Finds subsequent nodes connected by outgoing edges
   */
  private getNextNodes(sourceId: string, branchHandle?: string): WorkflowNode[] {
    const sourceNode = this.workflow.nodes.find((n) => n.id === sourceId);
    const isLogicGate =
      sourceNode &&
      (['and', 'or', 'nand', 'nor', 'logic_and', 'logic_or', 'logic_nand', 'logic_nor'].includes(
        sourceNode.data.type
      ) ||
        sourceNode.type === 'logicGateNode');

    if (isLogicGate && (branchHandle === 'loop_body' || branchHandle === 'loop_done')) {
      return [];
    }

    const edges = this.workflow.edges.filter((e) => {
      if (e.source !== sourceId) return false;
      if (isLogicGate) {
        // Combined output branch:
        if (e.sourceHandle === 'output' || !e.sourceHandle) {
          if (branchHandle && branchHandle !== 'output') return false;
          return true;
        }
        // Auxiliary 'true' or 'false' handle matching
        if (branchHandle) return e.sourceHandle === branchHandle;
        return true;
      }
      if (branchHandle) {
        return e.sourceHandle === branchHandle;
      }
      return true;
    });

    return edges
      .map((e) => this.workflow.nodes.find((n) => n.id === e.target))
      .filter((n): n is WorkflowNode => n !== undefined);
  }
}
