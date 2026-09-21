import { HumanConfig } from '../utils/human';

export type NodeExecutionStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'skipped'
  | 'disabled';

export type WorkflowExecutionStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface NodeDynamicState {
  // Wait countdown
  remainingSeconds?: number;
  totalSeconds?: number;
  elapsedSeconds?: number;

  // Loop & iteration tracking
  currentIteration?: number; // 1-indexed for display
  totalIterations?: number;
  currentItem?: any;

  // Live dynamic message, progress bar & previews
  message?: string;
  detail?: string;
  progress?: number; // 0 - 100 percentage
  subStatus?: string;
  previewUrl?: string;
}

export interface NodeRuntimeState {
  status: NodeExecutionStatus;
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  output?: any;
  error?: string;
  errorDetails?: {
    message: string;
    suggestions: string[];
    selector?: string;
    timeout?: number;
  };
  dynamicState?: NodeDynamicState;
}

export interface ExecutionLog {
  id: string;
  timestamp: number;
  nodeId?: string;
  nodeName?: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  message: string;
  data?: any;
  durationMs?: number;
  screenshotUrl?: string;
}

export interface ActiveTimer {
  nodeId: string;
  timerName?: string;
  totalDurationMs: number;
  startTime: number;
  stop: (action: 'complete_early' | 'cancel', reason?: string) => void;
  reset: (mode: 'restart' | 'extend', extendMs?: number) => void;
}

export interface NodeResult {
  success: boolean;
  output?: any;
  variables?: Record<string, any>;
  error?: string;
  nextBranch?: string; // 'true' | 'false' | 'loop_body' | 'loop_done' | 'try' | 'catch' | 'default'
  breakLoop?: boolean;
  continueLoop?: boolean;
  stopWorkflow?: boolean;
  exitStatus?: 'completed' | 'stopped';
  exitMessage?: string;
  jumpToNodeId?: string;
  cancelBranch?: boolean;
}

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  currentTabId?: number;
  currentUrl?: string;
  variables: Record<string, any>;
  signal: AbortSignal;
  isStepMode?: boolean;
  /** Present only when the workflow has Human Mode enabled. */
  human?: HumanConfig;
  log: (log: Omit<ExecutionLog, 'id' | 'timestamp'>) => void;
  updateNodeState: (nodeId: string, state: Partial<NodeRuntimeState>) => void;
  /** Internal tracking for inputs delivered to logic gates when merging branches */
  _gateInputs?: Record<string, any[]>;
  /** Registry of currently running wait timers accessible by command nodes */
  _activeTimers?: Map<string, ActiveTimer>;
  /** Pending stop/cancel signals to handle race conditions where a timer starts slightly after stop_timer */
  _pendingStopTimers?: Map<string, { action: 'complete_early' | 'cancel'; reason?: string; timestamp: number }>;
  /** Engine-level pause trigger hook */
  _pauseTrigger?: (message?: string) => void;
}
