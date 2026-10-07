import { Workflow, WorkflowNode, WorkflowEdge } from '../types/workflow';
import { ExecutionContext, NodeRuntimeState, ExecutionLog, WorkflowExecutionStatus, ActiveTimer } from '../types/execution';
import { executors, globalActiveTimers, globalPendingStopTimers } from './executors';
import { generateId } from '../utils/id';
import { createFriendlyError } from '../utils/formatters';
import { interpolateVariables, getNestedValue } from './interpolator';
import { evaluateCondition, ConditionRule } from './evaluator';
import { HumanConfig, nodeThinkTime, randomBetween, resolveHumanConfig, wait } from '../utils/human';
import { runThrottled, orchestrateParallelBranches, ParallelMode, ParallelBranchConfig } from '../utils/parallelOrchestrator';
import { syncStorageToVariables } from '../utils/simpleStorage';

/**
 * Wraps an object so that string coercion (e.g. String(item), `item: ${item}`)
 * yields JSON string representation rather than "[object Object]", while fully
 * preserving all normal object property accesses, keys, and prototype methods.
 */
export function createInspectableItem(rawItem: any): any {
  if (typeof rawItem !== 'object' || rawItem === null) return rawItem;
  if (Array.isArray(rawItem)) {
    return rawItem.map(createInspectableItem);
  }
  try {
    const item = { ...rawItem };
    Object.defineProperty(item, 'toString', {
      value: function() {
        return JSON.stringify(this);
      },
      enumerable: false,
      configurable: true,
      writable: true,
    });
    return item;
  } catch {
    return rawItem;
  }
}

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
  /** Active wait timers registry for stopping/resetting timers across branches */
  private activeTimers = new Map<string, ActiveTimer>();
  /** Pending stop timers registry for race conditions */
  private pendingStopTimers = new Map<string, { action: 'complete_early' | 'cancel'; reason?: string; timestamp: number }>();

  constructor(workflow: Workflow, events: EngineEvents = {}) {
    this.workflow = {
      ...workflow,
      settings: {
        timeout: 30000,
        retryCount: 0,
        retryDelay: 1000,
        stopOnError: true,
        ...(workflow.settings || {}),
      },
    };
    this.events = events;
    this.variables = { ...workflow.variables };
    syncStorageToVariables(this.variables);
    this.human = resolveHumanConfig(this.workflow.settings);
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

  private nodeStates = new Map<string, Partial<NodeRuntimeState>>();

  private updateNodeState(nodeId: string, state: Partial<NodeRuntimeState>) {
    const prev = this.nodeStates.get(nodeId) || {};
    const updated = { ...prev, ...state };
    this.nodeStates.set(nodeId, updated);
    this.events.onNodeStateChange?.(nodeId, state);
  }

  getNodeState(nodeId: string): Partial<NodeRuntimeState> | undefined {
    return this.nodeStates.get(nodeId);
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
    for (const timer of this.activeTimers.values()) {
      try {
        timer.stop('cancel', 'Workflow stopped');
      } catch {}
    }
    this.activeTimers.clear();
    this.pendingStopTimers.clear();
    globalActiveTimers.clear();
    globalPendingStopTimers.clear();
    this.setStatus('stopped');
    this.log({ level: 'warn', message: 'Workflow stopped by user.' });
  }

  /**
   * Runs an individual node for debugging
   */
  async runSingleNode(nodeOrId: WorkflowNode | string, initialVariables?: Record<string, any>): Promise<any> {
    const node = typeof nodeOrId === 'string'
      ? this.workflow.nodes.find((n) => n.id === nodeOrId)
      : nodeOrId;
    if (!node) {
      throw new Error(`Node not found: ${typeof nodeOrId === 'string' ? nodeOrId : 'undefined'}`);
    }

    const controller = new AbortController();
    const vars = initialVariables ? { ...initialVariables } : { ...this.variables };
    syncStorageToVariables(vars);

    const ctx: ExecutionContext = {
      workflowId: this.workflow.id,
      executionId: generateId('exec_single'),
      variables: vars,
      signal: controller.signal,
      human: this.human,
      log: (l) => this.log(l),
      updateNodeState: (id, s) => this.updateNodeState(id, s),
      _activeTimers: this.activeTimers,
      _pendingStopTimers: this.pendingStopTimers,
      _pauseTrigger: () => this.pause(),
    };

    try {
      this.updateNodeState(node.id, { status: 'running', startTime: Date.now() });
      if (node.data.type === 'async_parallel') {
        await this.executeAsyncParallelNode(node, ctx);
        const state = this.getNodeState(node.id);
        if (state?.error) {
          throw new Error(state.error);
        }
        return { success: state?.status === 'success', output: state?.output };
      }
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
    syncStorageToVariables(this.variables);
    this.events.onVariablesChange?.(this.variables);
    this.gateInputsState.clear();
    this.triggeredGates.clear();
    this.activeTimers.clear();
    this.pendingStopTimers.clear();
    globalActiveTimers.clear();
    globalPendingStopTimers.clear();

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
      _activeTimers: this.activeTimers,
      _pendingStopTimers: this.pendingStopTimers,
      _pauseTrigger: () => this.pause(),
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

    // Handle Loop / For Each / While Loop Node
    if (node.data.type === 'loop' || node.data.type === 'for_each' || node.data.type === 'while_loop') {
      await this.executeLoop(node, ctx);
      return;
    }

    // Handle Async Parallel Node
    if (node.data.type === 'async_parallel') {
      await this.executeAsyncParallelNode(node, ctx);
      return;
    }

    // Handle Recurring Watch Nodes (telegram_watch, discord_watch, slack_watch)
    if (
      ['telegram_watch', 'discord_watch', 'slack_watch'].includes(node.data.type) &&
      node.data.properties?.recurring
    ) {
      await this.executeRecurringWatchNode(node, ctx);
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
        Object.assign(ctx.variables, result.variables);
        this.events.onVariablesChange?.(this.variables);
      }

      // Handle Stop Workflow command
      if (result.stopWorkflow) {
        const exitStatus = result.exitStatus || 'completed';
        this.setStatus(exitStatus);
        this.log({
          level: 'info',
          nodeId: node.id,
          nodeName: node.data.label,
          message: result.exitMessage || `Workflow stopped early by ${node.data.label}`,
        });
        return;
      }

      // Handle Cancel Branch (e.g. stop_timer with cancel action)
      if (result.cancelBranch) {
        this.log({
          level: 'info',
          nodeId: node.id,
          nodeName: node.data.label,
          message: `Branch cancelled at ${node.data.label}`,
        });
        return;
      }

      // Handle Skip To (Jump to specific node)
      if (result.jumpToNodeId) {
        const targetNode = this.workflow.nodes.find(n => n.id === result.jumpToNodeId);
        if (targetNode) {
          this.log({
            level: 'info',
            nodeId: node.id,
            nodeName: node.data.label,
            message: `Jumping execution to ${targetNode.data.label} (${targetNode.id})`,
          });
          await this.traverseAndExecute(targetNode, ctx);
          return;
        } else {
          this.log({
            level: 'warn',
            nodeId: node.id,
            nodeName: node.data.label,
            message: `Target node "${result.jumpToNodeId}" not found for skip_to command`,
          });
        }
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
        const isScrapeNode = node.data.type === 'scrape_elements';
        const isElementNode = node.data.type === 'extract_multiple' || node.data.type === 'crawl_pagination' || isScrapeNode;
        const customVar = node.data.properties?.itemVariable;
        const itemExtractField = node.data.properties?.itemExtractField || 'all';
        const itemExtractCustomField = node.data.properties?.itemExtractCustomField;

        // General start index / item offset support
        let startOffset = 0;
        const rawStartItem = interpolateVariables(node.data.properties?.startItem, ctx.variables);
        const rawStartIndex = interpolateVariables(
          node.data.properties?.startIndex ?? node.data.properties?.startAt ?? node.data.properties?.startFrom,
          ctx.variables
        );
        if (rawStartItem !== undefined && rawStartItem !== null && String(rawStartItem).trim() !== '') {
          const num = Number(rawStartItem);
          if (!isNaN(num) && num >= 1) startOffset = Math.floor(num) - 1;
        } else if (rawStartIndex !== undefined && rawStartIndex !== null && String(rawStartIndex).trim() !== '') {
          const num = Number(rawStartIndex);
          if (!isNaN(num) && num >= 0) startOffset = Math.floor(num);
        }

        const totalOriginal = items.length;
        const validOffset = Math.max(0, Math.min(startOffset, totalOriginal));
        items = items.slice(validOffset);

        this.log({
          level: 'info',
          message: `Iterating loop body for ${items.length} items${validOffset > 0 ? ` (started from item #${validOffset + 1} of ${totalOriginal})` : ''} from ${node.data.label}`,
          nodeId: node.id,
          nodeName: node.data.label,
        });

        const totalItems = items.length;
        for (let index = 0; index < totalItems; index++) {
          if (ctx.signal.aborted) break;
          const rawItem = items[index];
          const item = createInspectableItem(rawItem);
          const absoluteIndex = validOffset + index;
          const itemNumber = validOffset + index + 1;

          ctx.variables.index = absoluteIndex;
          ctx.variables.loop_index = absoluteIndex;
          ctx.variables.item_number = itemNumber;
          ctx.variables.loop_iteration = index + 1;
          ctx.variables.total_items = totalOriginal;
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
          if (isScrapeNode) {
            // Determine the exposed value for the primary variable (currentProduct or custom itemVariable)
            let exposedValue: any = item;
            if (itemExtractField && itemExtractField !== 'all') {
              const targetKey = itemExtractField === 'custom' ? (itemExtractCustomField || '') : itemExtractField;
              if (targetKey && typeof item === 'object' && item !== null) {
                exposedValue = item[targetKey] ?? getNestedValue(item, targetKey) ?? '';
              }
            }

            const itemVarName = customVar || 'currentProduct';
            ctx.variables[itemVarName] = exposedValue;
            ctx.variables.currentProduct = exposedValue;
            // Always retain the full inspectable card object under _object
            ctx.variables[`${itemVarName}_object`] = item;
            ctx.variables.currentProduct_object = item;

            // Always unpack all card fields for this iteration so {{field}} and {{currentProduct.field}} work reliably
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              for (const [k, v] of Object.entries(item)) {
                ctx.variables[k] = v;
                ctx.variables[`${itemVarName}_${k}`] = v;
                ctx.variables[`${itemVarName}.${k}`] = v;
                ctx.variables[`currentProduct_${k}`] = v;
                ctx.variables[`currentProduct.${k}`] = v;
              }
            }
          }
          if (customVar && !isScrapeNode) {
            ctx.variables[customVar] = item;
          }

          Object.assign(this.variables, ctx.variables);
          this.events.onVariablesChange?.(this.variables);

          const progress = Math.round(((index + 1) / Math.max(1, totalItems)) * 100);
          const detail = typeof item === 'object' && item !== null
            ? (item.title || item.name || item.url || (item.price ? `${item.price}` : undefined) || JSON.stringify(item).slice(0, 40))
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
                : isScrapeNode
                ? `Card ${index + 1} of ${totalItems}`
                : `Element ${index + 1} of ${totalItems}`,
              detail,
            },
          });

          // Reset logic gate states for fresh evaluation in each iteration
          this.triggeredGates.clear();
          this.gateInputsState.clear();

          await Promise.all(bodyNodes.map((bNode) => this.traverseAndExecute(bNode, ctx)));
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

      // Intercept error if an Error Handler node is watching this node
      const errorHandlerNode = this.findErrorHandlerForNode(node);
      if (errorHandlerNode) {
        await this.handleNodeErrorWithHandler(node, errorHandlerNode, friendly, err, ctx);
        return; // Handled safely without stopping the workflow!
      }

      if (this.workflow.settings.stopOnError !== false) {
        throw err;
      }
    }
  }

  /**
   * Finds an active Error Handler (or Try/Catch) node that covers this failing node.
   */
  private findErrorHandlerForNode(failingNode: WorkflowNode): WorkflowNode | undefined {
    return this.workflow.nodes.find((n) => {
      if (n.id === failingNode.id || n.data.disabled) return false;
      if (n.data.type !== 'error_handler' && n.data.type !== 'try_catch') return false;

      const props = n.data.properties || {};
      const watchMode = props.watchMode || props.mode || 'chosen';

      // 1. Watch All Nodes
      if (watchMode === 'all') {
        return true;
      }

      // 2. Watch Chosen Nodes (explicit array of node IDs)
      if (watchMode === 'chosen' || !watchMode) {
        const watchedIds = Array.isArray(props.watchedNodeIds) ? props.watchedNodeIds : [];
        if (watchedIds.includes(failingNode.id)) {
          return true;
        }
      }

      // 3. Try branch: node is connected downstream of this error handler's 'try' handle
      if (watchMode === 'try_branch') {
        const tryNodes = this.getNextNodes(n.id, 'try');
        if (tryNodes.some((tn) => tn.id === failingNode.id)) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Handles an intercepted error using the designated Error Handler node.
   * Sets error payload variables, routes to error/catch branch, and continues workflow.
   */
  private async handleNodeErrorWithHandler(
    failingNode: WorkflowNode,
    handlerNode: WorkflowNode,
    friendly: any,
    rawError: any,
    ctx: ExecutionContext
  ): Promise<void> {
    const props = handlerNode.data.properties || {};
    const outVar = props.outputVariable || 'lastError';
    const action = props.action || 'catch_and_continue';
    const continueWorkflow = props.continueWorkflow !== false;

    const errorPayload = {
      message: friendly.message || rawError?.message || String(rawError),
      rawMessage: rawError?.message,
      nodeId: failingNode.id,
      nodeName: failingNode.data.label,
      nodeType: failingNode.data.type,
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString(),
      suggestions: friendly.suggestions || [],
      selector: friendly.selector,
    };

    // 1. Expose error variables to context
    ctx.variables[outVar] = errorPayload;
    ctx.variables[`${outVar}_message`] = errorPayload.message;
    ctx.variables[`${outVar}_nodeId`] = errorPayload.nodeId;
    ctx.variables[`${outVar}_nodeName`] = errorPayload.nodeName;
    ctx.variables['lastError'] = errorPayload;
    ctx.variables['lastErrorMessage'] = errorPayload.message;
    ctx.variables['lastErrorNodeId'] = errorPayload.nodeId;
    ctx.variables['lastErrorNodeName'] = errorPayload.nodeName;
    ctx.variables['hasError'] = true;

    // 2. Update Error Handler node state
    this.updateNodeState(handlerNode.id, {
      status: 'success',
      output: errorPayload,
      dynamicState: {
        message: `Handled error on "${failingNode.data.label}"`,
        detail: errorPayload.message,
        errorNode: failingNode.data.label,
        lastHandledTime: Date.now(),
      },
    });

    // 3. Log user-friendly recovery notice
    this.log({
      level: 'warn',
      nodeId: handlerNode.id,
      nodeName: handlerNode.data.label,
      message: `[Error Handler] Caught error from "${failingNode.data.label}": "${errorPayload.message}". Executing error flow without stopping workflow.`,
    });

    // 4. Execute Error Handler's catch/error branch if connected
    const catchBranchNodes = [
      ...this.getNextNodes(handlerNode.id, 'error'),
      ...this.getNextNodes(handlerNode.id, 'catch'),
    ];
    if (catchBranchNodes.length > 0) {
      await this.proceedToNextNodes(handlerNode, { success: true, output: errorPayload }, catchBranchNodes, ctx);
    }

    // 5. If continueWorkflow is enabled, proceed to failingNode's next nodes so rest of workflow continues
    if (continueWorkflow && action !== 'stop') {
      const failingNextNodes = this.getNextNodes(failingNode.id);
      if (failingNextNodes.length > 0) {
        await this.proceedToNextNodes(failingNode, { success: false, output: errorPayload }, failingNextNodes, ctx);
      }
    }
  }

  /**
   * Executes a loop construct
   */
  private async executeLoop(loopNode: WorkflowNode, ctx: ExecutionContext): Promise<void> {
    const isWhileLoop = loopNode.data.type === 'while_loop';

    if (isWhileLoop) {
      const maxIterations = Math.max(1, Math.min(Number(loopNode.data.properties?.maxIterations) || 50, 2000));
      const delayMs = Math.max(0, Number(loopNode.data.properties?.delayBetweenMs) || 0);
      const outVar = loopNode.data.properties?.outputVariable || 'whileIteration';

      const bodyNodes = this.getNextNodes(loopNode.id, 'loop_body');
      const doneNodes = this.getNextNodes(loopNode.id, 'loop_done');

      let iter = 0;
      this.log({
        level: 'info',
        message: `Starting While Loop (safety limit: ${maxIterations} iterations)`,
        nodeId: loopNode.id,
        nodeName: loopNode.data.label,
      });

      while (iter < maxIterations) {
        if (ctx.signal.aborted) break;

        const leftVal = interpolateVariables(loopNode.data.properties?.leftValue || '', ctx.variables);
        const rightVal = interpolateVariables(loopNode.data.properties?.rightValue || '', ctx.variables);
        const operator = loopNode.data.properties?.operator || 'equals';
        const caseSensitive = !!loopNode.data.properties?.caseSensitive;

        const rule: ConditionRule = {
          type: 'variable',
          leftValue: leftVal,
          operator,
          rightValue: rightVal,
          caseSensitive,
        };
        const conditionMet = evaluateCondition(rule, ctx.variables);

        if (!conditionMet) {
          this.log({
            level: 'info',
            message: `While Loop exit condition reached: "${leftVal}" ${operator} "${rightVal}" (completed ${iter} iterations)`,
            nodeId: loopNode.id,
            nodeName: loopNode.data.label,
          });
          break;
        }

        iter++;
        ctx.variables[outVar] = iter;
        ctx.variables.index = iter - 1;
        this.events.onVariablesChange?.(this.variables);

        this.updateNodeState(loopNode.id, {
          status: 'running',
          dynamicState: {
            currentIteration: iter,
            totalIterations: maxIterations,
            progress: Math.min(100, Math.round((iter / maxIterations) * 100)),
            message: `While Loop iteration ${iter}/${maxIterations}`,
            detail: `${leftVal} ${operator} ${rightVal}`,
          },
        });

        // Reset logic gate states for fresh evaluation in each iteration
        this.triggeredGates.clear();
        this.gateInputsState.clear();

        await Promise.all(bodyNodes.map((bNode) => this.traverseAndExecute(bNode, ctx)));

        if (delayMs > 0 && iter < maxIterations) {
          await wait(delayMs, ctx.signal);
        }
      }

      this.updateNodeState(loopNode.id, {
        status: 'success',
        dynamicState: {
          currentIteration: iter,
          totalIterations: iter,
          progress: 100,
          message: `Completed ${iter} iterations`,
        },
      });

      const continuationNodes = doneNodes.length > 0
        ? doneNodes
        : this.getNextNodes(loopNode.id).filter(n => !bodyNodes.some(bn => bn.id === n.id));

      for (const dNode of continuationNodes) {
        if (ctx.signal.aborted) break;
        await this.traverseAndExecute(dNode, ctx);
      }
      return;
    }

    const isForEach = loopNode.data.type === 'for_each';
    let iterations: any[] = [];
    let startOffset = 0;

    // Start index / item offset support
    const rawStartItem = interpolateVariables(loopNode.data.properties?.startItem, ctx.variables);
    const rawStartIndex = interpolateVariables(
      loopNode.data.properties?.startIndex ?? loopNode.data.properties?.startAt ?? loopNode.data.properties?.startFrom,
      ctx.variables
    );

    if (rawStartItem !== undefined && rawStartItem !== null && String(rawStartItem).trim() !== '') {
      const num = Number(rawStartItem);
      if (!isNaN(num) && num >= 1) startOffset = Math.floor(num) - 1;
    } else if (rawStartIndex !== undefined && rawStartIndex !== null && String(rawStartIndex).trim() !== '') {
      const num = Number(rawStartIndex);
      if (!isNaN(num) && num >= 0) startOffset = Math.floor(num);
    }

    let totalOriginal = 0;

    if (isForEach) {
      let arrayVal = interpolateVariables(loopNode.data.properties.array, ctx.variables);
      if (typeof arrayVal === 'string') {
        try {
          const parsed = JSON.parse(arrayVal);
          if (Array.isArray(parsed)) arrayVal = parsed;
        } catch {
          // not json
        }
      }
      if (!Array.isArray(arrayVal) && Array.isArray(loopNode.data.properties?.importedItems) && loopNode.data.properties.importedItems.length > 0) {
        arrayVal = loopNode.data.properties.importedItems;
      }
      const rawIterations = Array.isArray(arrayVal) ? arrayVal : [];
      totalOriginal = rawIterations.length;
      const validOffset = Math.max(0, Math.min(startOffset, totalOriginal));
      iterations = rawIterations.slice(validOffset);
    } else {
      const startCount = Number(interpolateVariables(loopNode.data.properties?.startCount ?? loopNode.data.properties?.fromCount ?? loopNode.data.properties?.startIndex ?? 0, ctx.variables)) || 0;
      const count = Number(interpolateVariables(loopNode.data.properties.count, ctx.variables)) || 1;
      totalOriginal = Math.min(count, 500);
      iterations = Array.from({ length: totalOriginal }, (_, i) => startCount + i);
    }

    const bodyNodes = this.getNextNodes(loopNode.id, 'loop_body');
    const doneNodes = this.getNextNodes(loopNode.id, 'loop_done');

    this.log({
      level: 'info',
      message: `Starting loop with ${iterations.length} iterations${isForEach && startOffset > 0 ? ` (started from item #${startOffset + 1} of ${totalOriginal})` : ''}`,
      nodeId: loopNode.id,
      nodeName: loopNode.data.label,
    });

    const totalIterations = iterations.length;
    for (let index = 0; index < totalIterations; index++) {
      if (ctx.signal.aborted) break;

      const rawItem = iterations[index];
      const item = createInspectableItem(rawItem);
      const itemVar = loopNode.data.properties?.itemVariable || 'item';
      const absoluteIndex = isForEach ? (startOffset + index) : (typeof rawItem === 'number' ? rawItem : index);
      const itemNumber = isForEach ? (startOffset + index + 1) : (typeof rawItem === 'number' ? rawItem + 1 : index + 1);

      ctx.variables.index = absoluteIndex;

      ctx.variables.loop_index = absoluteIndex;
      ctx.variables.item_number = itemNumber;
      ctx.variables.loop_iteration = index + 1;
      ctx.variables.total_items = totalOriginal;
      ctx.variables[itemVar] = item;
      ctx.variables.item = item;
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        for (const [k, v] of Object.entries(item)) {
          // Direct variable by column name: {{title}}, {{price}}, etc.
          ctx.variables[k] = v;
          ctx.variables[`${itemVar}.${k}`] = v;
          ctx.variables[`${itemVar}_${k}`] = v;
          ctx.variables[`item.${k}`] = v;
          ctx.variables[`item_${k}`] = v;
        }
      }
      Object.assign(this.variables, ctx.variables);
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
            ? `Item ${itemNumber} of ${totalOriginal} (${index + 1}/${totalIterations})`
            : `Iteration ${index + 1} of ${totalIterations}`,
          detail: isForEach ? detail : undefined,
        },
      });

      let shouldBreak = false;
      // Reset logic gate states for fresh evaluation in each iteration
      this.triggeredGates.clear();
      this.gateInputsState.clear();

      await Promise.all(bodyNodes.map((bNode) => this.traverseAndExecute(bNode, ctx)));

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
   * Executes an async_parallel node by running its branches concurrently.
   */
  private async executeAsyncParallelNode(node: WorkflowNode, ctx: ExecutionContext): Promise<void> {
    const startTime = Date.now();
    const props = node.data.properties || {};
    const mode: ParallelMode = props.mode || 'all';
    const branches: ParallelBranchConfig[] = Array.isArray(props.branches) && props.branches.length > 0
      ? props.branches
      : [
          { id: 'branch_1', name: 'Branch 1' },
          { id: 'branch_2', name: 'Branch 2' },
        ];
    const maxConcurrency = Number(props.maxConcurrency) || 0;
    const timeoutMs = Number(props.timeoutMs) || 30000;
    const continueOnError = props.continueOnError !== undefined ? !!props.continueOnError : mode === 'settled';
    const mergeStrategy = props.mergeStrategy || 'merge';
    const outVar = props.outputVariable || 'parallelResults';

    this.log({
      level: 'info',
      message: `Starting Async Parallel execution across ${branches.length} branches (${mode.toUpperCase()}, Concurrency: ${maxConcurrency || 'unlimited'})`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    this.updateNodeState(node.id, {
      status: 'running',
      startTime,
      dynamicState: {
        message: `Executing ${branches.length} branches in parallel...`,
        progress: 10,
      },
    });

    // Map each branch to connected nodes
    const branchTargetsMap = new Map<string, WorkflowNode[]>();
    for (const b of branches) {
      let targets = this.getNextNodes(node.id, b.id);
      if (targets.length === 0) {
        // Fallback: match by index among edges from this node
        const allEdges = this.workflow.edges.filter((e) => e.source === node.id);
        const bIdx = branches.indexOf(b);
        if (allEdges[bIdx]) {
          const tNode = this.workflow.nodes.find((n) => n.id === allEdges[bIdx].target);
          if (tNode) targets = [tNode];
        }
      }
      branchTargetsMap.set(b.id, targets);
    }

    const orchestratorResult = await orchestrateParallelBranches(
      branches,
      async (branch, signal) => {
        const branchVars: Record<string, any> = {
          ...this.variables,
          ...ctx.variables,
          branchId: branch.id,
          branchName: branch.name,
        };

        const branchCtx: ExecutionContext = {
          ...ctx,
          variables: branchVars,
          signal: signal || ctx.signal,
          executionId: generateId(`branch_${branch.id}`),
        };

        const targets = branchTargetsMap.get(branch.id) || [];
        let branchOutput: any = undefined;

        if (targets.length > 0) {
          for (const targetNode of targets) {
            if (signal.aborted || ctx.signal.aborted) {
              throw new Error(`Branch "${branch.name}" aborted.`);
            }
            await this.traverseAndExecute(targetNode, branchCtx);
            const targetState = this.getNodeState(targetNode.id);
            if (targetState?.output !== undefined) {
              branchOutput = targetState.output;
            }
          }
        } else {
          branchOutput = { branchId: branch.id, branchName: branch.name, executedAt: Date.now() };
        }

        return {
          output: branchOutput,
          variables: branchVars,
        };
      },
      {
        mode,
        maxConcurrency,
        timeoutMs,
        continueOnError,
        mergeStrategy,
        outputVariable: outVar,
      }
    );

    const durationMs = Date.now() - startTime;

    if (orchestratorResult.combinedVariables) {
      Object.assign(this.variables, orchestratorResult.combinedVariables);
      Object.assign(ctx.variables, orchestratorResult.combinedVariables);
      this.events.onVariablesChange?.(this.variables);
    }

    this.variables[outVar] = orchestratorResult;
    ctx.variables[outVar] = orchestratorResult;

    const isSuccess = orchestratorResult.success;

    this.updateNodeState(node.id, {
      status: isSuccess ? 'success' : 'error',
      endTime: Date.now(),
      durationMs,
      output: orchestratorResult,
      dynamicState: {
        message: `${orchestratorResult.completedCount}/${orchestratorResult.totalBranches} branches completed (${mode})`,
        completedCount: orchestratorResult.completedCount,
        failedCount: orchestratorResult.failedCount,
        winningBranch: orchestratorResult.winningBranch,
      },
      error: isSuccess ? undefined : `Async Parallel execution failed (${orchestratorResult.failedCount} branch failures)`,
    });

    this.log({
      level: isSuccess ? 'success' : 'warn',
      message: `Async Parallel completed: ${orchestratorResult.completedCount}/${orchestratorResult.totalBranches} branches finished in ${durationMs}ms`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
  }

  /**
   * Executes a recurring message watcher node (telegram_watch, discord_watch, slack_watch)
   * in continuous listening mode, executing downstream branches for every incoming message.
   */
  private async executeRecurringWatchNode(node: WorkflowNode, ctx: ExecutionContext): Promise<void> {
    const maxIterations = Number(node.data.properties?.maxIterations) || 0; // 0 = unlimited / continuous
    const delayBetweenMs = Math.max(100, Number(node.data.properties?.delayBetweenMs) || 1000);
    const bodyNodes = this.getNextNodes(node.id, 'loop_body');
    const standardNextNodes = this.getNextNodes(node.id);
    const targets = bodyNodes.length > 0 ? bodyNodes : standardNextNodes;

    let iter = 0;
    this.log({
      level: 'info',
      message: `Starting Recurring Watcher on ${node.data.label} (${maxIterations > 0 ? `limit: ${maxIterations} updates` : 'continuous listening'})`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    while (!ctx.signal.aborted && this.status === 'running') {
      iter++;
      const startTime = Date.now();
      this.updateNodeState(node.id, {
        status: 'running',
        startTime,
        dynamicState: {
          message: `Listening for update #${iter}...`,
          currentIteration: iter,
          totalIterations: maxIterations > 0 ? maxIterations : undefined,
        },
      });

      try {
        const result = await this.executeNodeWithRetry(node, ctx);
        const durationMs = Date.now() - startTime;

        this.updateNodeState(node.id, {
          status: 'success',
          endTime: Date.now(),
          durationMs,
          output: result.output,
          dynamicState: {
            message: `Update #${iter} received`,
            currentIteration: iter,
            totalIterations: maxIterations > 0 ? maxIterations : undefined,
          },
        });

        if (result.variables) {
          Object.assign(this.variables, result.variables);
          Object.assign(ctx.variables, result.variables);
          this.events.onVariablesChange?.(this.variables);
        }

        // Reset logic gate states for fresh execution in each iteration
        this.triggeredGates.clear();
        this.gateInputsState.clear();

        // Execute downstream targets with this update's variables
        if (targets.length > 0) {
          await Promise.all(targets.map((tNode) => this.traverseAndExecute(tNode, ctx)));
        }

        if (maxIterations > 0 && iter >= maxIterations) {
          this.log({
            level: 'info',
            message: `Recurring watcher on ${node.data.label} reached limit of ${maxIterations} updates.`,
            nodeId: node.id,
            nodeName: node.data.label,
          });
          break;
        }

        if (delayBetweenMs > 0 && !ctx.signal.aborted && this.status === 'running') {
          await wait(delayBetweenMs, ctx.signal);
        }
      } catch (err: any) {
        if (ctx.signal.aborted || this.status !== 'running') {
          break;
        }
        this.log({
          level: 'warn',
          message: `Recurring watch check on ${node.data.label}: ${err.message}`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        if (this.workflow.settings.stopOnError !== false) {
          throw err;
        }
        await wait(2000, ctx.signal);
      }
    }

    const doneNodes = this.getNextNodes(node.id, 'loop_done');
    if (doneNodes.length > 0) {
      await Promise.all(doneNodes.map((dNode) => this.traverseAndExecute(dNode, ctx)));
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

      const matchingEdge = incomingEdges.find(e => e.source === sourceNode.id && (e.sourceHandle ? e.sourceHandle === sourceResult?.branchId : true)) || incomingEdges.find(e => e.source === sourceNode.id);
      const arrivalKey = matchingEdge ? matchingEdge.id : sourceNode.id;

      // If this incoming branch has already arrived in this cycle, a new cycle/iteration has begun
      if (arrivals.has(arrivalKey)) {
        this.triggeredGates.delete(next.id);
        arrivals.clear();
      }

      const isBranchTrue =
        sourceResult.nextBranch === 'true' ||
        sourceResult.output?.result === true ||
        sourceResult.output?.present === true ||
        (sourceResult.nextBranch !== 'false' && sourceResult.output !== false && sourceResult.success);

      arrivals.set(arrivalKey, {
        result: isBranchTrue,
        output: sourceResult.output,
        nodeName: sourceNode.data.label,
      });

      const totalExpected = incomingEdges.length;
      const rawType = String(next.data.type || '').toLowerCase();
      let gate = String(next.data.properties?.gate || '').toUpperCase();
      if (!gate) {
        if (next.data.type === 'combine_datasets' || next.type === 'combineDatasetsNode') gate = 'AND';
        else if (rawType.includes('and') && !rawType.includes('nand')) gate = 'AND';
        else if (rawType.includes('nand')) gate = 'NAND';
        else if (rawType.includes('nor')) gate = 'NOR';
        else {
          const isDescendantOfParallel = (startId: string, visited = new Set<string>()): boolean => {
            if (visited.has(startId)) return false;
            visited.add(startId);
            const parentEdges = this.workflow.edges.filter((e) => e.target === startId);
            for (const pe of parentEdges) {
              const parentNode = this.workflow.nodes.find((n) => n.id === pe.source);
              if (!parentNode) continue;
              if (parentNode.data.type === 'async_parallel') return true;
              if (isDescendantOfParallel(parentNode.id, visited)) return true;
            }
            return false;
          };

          const fromParallel = incomingEdges.some((e) => isDescendantOfParallel(e.source));
          gate = fromParallel ? 'AND' : 'OR';
        }
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

        Object.assign(this.variables, ctx.variables);
        const mergedCtx: ExecutionContext = {
          ...ctx,
          variables: this.variables,
        };

        await this.traverseAndExecute(next, mergedCtx);

        // Reset gate if all incoming branches arrived so loops/cycles can re-trigger cleanly
        if (arrivals.size >= totalExpected) {
          this.triggeredGates.delete(next.id);
          this.gateInputsState.delete(next.id);
        }
      } else if (arrivals.size >= totalExpected) {
        // All branches arrived, clear state for future cycles
        this.triggeredGates.delete(next.id);
        this.gateInputsState.delete(next.id);
      }
    };

    if (sourceNode.data.type === 'async_parallel') {
      const mode = sourceNode.data.properties?.mode || 'all';
      const maxConcurrency = Number(sourceNode.data.properties?.maxConcurrency) || 0;

      if (mode === 'race') {
        await Promise.race(nextNodes.map((n) => handleNext(n)));
      } else if (mode === 'settled') {
        if (maxConcurrency > 0) {
          await runThrottled(
            nextNodes.map((n) => async () => {
              try {
                await handleNext(n);
              } catch (e) {
                /* continue on settled branch error */
              }
            }),
            maxConcurrency
          );
        } else {
          await Promise.allSettled(nextNodes.map((n) => handleNext(n)));
        }
      } else {
        if (maxConcurrency > 0) {
          await runThrottled(
            nextNodes.map((n) => () => handleNext(n)),
            maxConcurrency
          );
        } else {
          await Promise.all(nextNodes.map((n) => handleNext(n)));
        }
      }
      return;
    }

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
