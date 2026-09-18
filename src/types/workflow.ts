export type NodeCategory =
  | 'browser'
  | 'interaction'
  | 'wait'
  | 'extraction'
  | 'logic'
  | 'data'
  | 'utility';

export type NodeType =
  // Browser
  | 'navigate'
  | 'back'
  | 'forward'
  | 'reload'
  | 'new_tab'
  | 'close_tab'
  | 'switch_tab'
  // Interaction
  | 'click'
  | 'type_text'
  | 'clear_input'
  | 'hover'
  | 'press_key'
  | 'scroll'
  | 'select_dropdown'
  | 'drag_and_drop'
  // Wait
  | 'wait'
  | 'wait_for_element'
  | 'wait_for_text'
  | 'wait_for_navigation'
  // Extraction
  | 'extract_text'
  | 'extract_attribute'
  | 'extract_html'
  | 'extract_table'
  | 'extract_multiple'
  | 'extract_links'
  // Logic
  | 'condition'
  | 'contains'
  | 'loop'
  | 'for_each'
  | 'try_catch'
  | 'break'
  | 'continue'
  // Data
  | 'set_variable'
  | 'get_variable'
  | 'transform'
  | 'regex'
  | 'json_parse'
  | 'generate_data'
  // Utility
  | 'screenshot'
  | 'execute_javascript'
  | 'http_request'
  | 'storage_manage'
  | 'clipboard'
  | 'ai_agent'
  | 'autonomous_agent';

export interface WorkflowNodeData {
  label: string;
  category: NodeCategory;
  type: NodeType;
  disabled?: boolean;
  description?: string;
  properties: Record<string, any>;
  [key: string]: any;
}

export interface WorkflowNode {
  id: string;
  type: string; // 'customNode' | 'conditionNode' | 'loopNode'
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null; // e.g. 'true', 'false', 'loop_body', 'loop_done', 'try', 'catch'
  targetHandle?: string | null;
  label?: string;
  animated?: boolean;
}

export type HumanIntensity = 'subtle' | 'natural' | 'slow';

export interface WorkflowSettings {
  timeout: number; // default timeout in ms (e.g. 30000)
  retryCount: number;
  retryDelay: number;
  stopOnError: boolean;
  highlightElements: boolean;
  // Human-like execution (all optional for backward compatibility with saved workflows)
  humanMode?: boolean;
  humanIntensity?: HumanIntensity;
  humanCursor?: boolean;
  humanMinDelay?: number;
  humanMaxDelay?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, any>;
  settings: WorkflowSettings;
  createdAt: number;
  updatedAt: number;
}
