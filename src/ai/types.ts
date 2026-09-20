import { WorkflowNode, WorkflowEdge, NodeType } from '../types/workflow';

export type AiProvider = 'built-in' | 'openai' | 'mistral' | 'gemini' | 'openrouter' | 'custom';

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
}

export interface AiConfig {
  provider: AiProvider;
  apiKey?: string;
  model?: string;
  customEndpoint?: string;
  openaiBaseUrl?: string;
  mistralApiKey?: string;
}

export interface SynthesisRequest {
  prompt: string;
  mode: 'replace' | 'append';
  selectedNodeId?: string;
  currentNodes?: WorkflowNode[];
  currentEdges?: WorkflowEdge[];
}

export interface SynthesizedWorkflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  summary: string;
  assumptions?: string[];
  warning?: string;
  error?: string;
}

export interface AiRecipe {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
}

export type AgentActionType =
  | 'click'
  | 'type'
  | 'press_key'
  | 'shortcut'
  | 'copy_to_clipboard'
  | 'paste'
  | 'navigate'
  | 'scroll'
  | 'wait'
  | 'hover'
  | 'extract'
  | 'ask_human'
  | 'remember'
  | 'done';

export interface AgentAction {
  type: AgentActionType;
  elementIndex?: number;
  selector?: string;
  coordinates?: { x: number; y: number };
  clickType?: 'left' | 'double' | 'right';
  text?: string;
  pressEnter?: boolean;
  clearFirst?: boolean;
  key?: string;
  shortcut?: string;
  clipboardText?: string;
  url?: string;
  direction?: 'up' | 'down';
  amount?: number;
  durationMs?: number;
  waitForSelector?: string;
  waitForText?: string;
  waitForNavigation?: boolean;
  waitReason?: string;
  variableName?: string;
  extractedValue?: any;
  answer?: string;
  question?: string;
  reason?: string;
  suggestedOptions?: string[];
  memoryNote?: string;
  updateMemory?: string;
}

export interface InteractiveElement {
  index: number;
  tag: string;
  text: string;
  placeholder?: string;
  ariaLabel?: string;
  type?: string;
  value?: string;
  selector: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
    x: number;
    y: number;
  };
}

export interface AgentStep {
  stepNumber: number;
  timestamp: number;
  thought: string;
  action: AgentAction;
  humanGuidance?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  urlBefore?: string;
  urlAfter?: string;
  success: boolean;
  error?: string;
  savedMemoryNote?: string;
  isComplete?: boolean;
}

export interface HumanGuidanceRequest {
  id: string;
  question: string;
  reason?: string;
  screenshot?: string;
  suggestedOptions?: string[];
  stepNumber?: number;
}

export interface VisionLlmParams {
  prompt: string;
  systemInstruction?: string;
  imageBase64?: string;
  config?: Partial<AiConfig>;
  temperature?: number;
}

