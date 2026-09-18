import { NodeType, NodeCategory } from '../types/workflow';

export interface NodeDefinition {
  type: NodeType;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string; // Lucide icon name
  defaultProperties: Record<string, any>;
  reactFlowType?: string; // 'customNode' | 'conditionNode' | 'loopNode'
}

export const NODE_REGISTRY: Record<NodeType, NodeDefinition> = {
  // Browser
  navigate: {
    type: 'navigate',
    label: 'Navigate',
    category: 'browser',
    description: 'Go to a web page URL',
    icon: 'Globe',
    defaultProperties: {
      url: 'https://example.com',
      waitUntil: 'load',
      timeout: 30000,
    },
  },
  back: {
    type: 'back',
    label: 'Back',
    category: 'browser',
    description: 'Navigate backward in history',
    icon: 'ArrowLeft',
    defaultProperties: {},
  },
  forward: {
    type: 'forward',
    label: 'Forward',
    category: 'browser',
    description: 'Navigate forward in history',
    icon: 'ArrowRight',
    defaultProperties: {},
  },
  reload: {
    type: 'reload',
    label: 'Reload',
    category: 'browser',
    description: 'Reload the current page',
    icon: 'RotateCw',
    defaultProperties: {},
  },
  new_tab: {
    type: 'new_tab',
    label: 'New Tab',
    category: 'browser',
    description: 'Open a new browser tab',
    icon: 'PlusSquare',
    defaultProperties: {
      url: 'about:blank',
    },
  },
  close_tab: {
    type: 'close_tab',
    label: 'Close Tab',
    category: 'browser',
    description: 'Close the current or target tab',
    icon: 'XSquare',
    defaultProperties: {},
  },
  switch_tab: {
    type: 'switch_tab',
    label: 'Switch Tab',
    category: 'browser',
    description: 'Switch active browser tab',
    icon: 'Layers',
    defaultProperties: {},
  },

  // Interaction
  click: {
    type: 'click',
    label: 'Click',
    category: 'interaction',
    description: 'Click an element on the webpage',
    icon: 'MousePointer',
    defaultProperties: {
      selector: '',
      clickType: 'left',
      timeout: 10000,
    },
  },
  type_text: {
    type: 'type_text',
    label: 'Type Text',
    category: 'interaction',
    description: 'Type text or variables into an input field',
    icon: 'Type',
    defaultProperties: {
      selector: '',
      text: '',
      clearExisting: true,
      typingDelay: 0,
      timeout: 10000,
    },
  },
  clear_input: {
    type: 'clear_input',
    label: 'Clear Input',
    category: 'interaction',
    description: 'Clear the contents of an input element',
    icon: 'Delete',
    defaultProperties: {
      selector: '',
      timeout: 10000,
    },
  },
  hover: {
    type: 'hover',
    label: 'Hover',
    category: 'interaction',
    description: 'Hover mouse cursor over an element',
    icon: 'Pointer',
    defaultProperties: {
      selector: '',
      timeout: 10000,
    },
  },
  press_key: {
    type: 'press_key',
    label: 'Press Key',
    category: 'interaction',
    description: 'Simulate pressing a keyboard key (e.g. Enter)',
    icon: 'Keyboard',
    defaultProperties: {
      key: 'Enter',
      selector: '',
    },
  },
  scroll: {
    type: 'scroll',
    label: 'Scroll',
    category: 'interaction',
    description: 'Scroll the page or a container element',
    icon: 'ChevronsDown',
    defaultProperties: {
      direction: 'down',
      amount: 400,
      smooth: true,
    },
  },
  select_dropdown: {
    type: 'select_dropdown',
    label: 'Select Dropdown',
    category: 'interaction',
    description: 'Choose an option in a select dropdown',
    icon: 'ListFilter',
    defaultProperties: {
      selector: '',
      selectionType: 'value',
      value: '',
    },
  },
  drag_and_drop: {
    type: 'drag_and_drop',
    label: 'Drag & Drop',
    category: 'interaction',
    description: 'Drag element to another element target',
    icon: 'Move',
    defaultProperties: {
      sourceSelector: '',
      targetSelector: '',
    },
  },

  // Wait
  wait: {
    type: 'wait',
    label: 'Wait',
    category: 'wait',
    description: 'Pause execution for specified duration',
    icon: 'Clock',
    defaultProperties: {
      duration: 2000,
      unit: 'ms',
    },
  },
  wait_for_element: {
    type: 'wait_for_element',
    label: 'Wait For Element',
    category: 'wait',
    description: 'Wait until element appears and is visible',
    icon: 'Search',
    defaultProperties: {
      selector: '',
      timeout: 10000,
      visible: true,
      enabled: false,
    },
  },
  wait_for_text: {
    type: 'wait_for_text',
    label: 'Wait For Text',
    category: 'wait',
    description: 'Wait until specific text appears on the page',
    icon: 'FileText',
    defaultProperties: {
      text: '',
      timeout: 10000,
    },
  },
  wait_for_navigation: {
    type: 'wait_for_navigation',
    label: 'Wait For Navigation',
    category: 'wait',
    description: 'Wait for page URL change or navigation to complete',
    icon: 'Compass',
    defaultProperties: {
      urlPattern: '',
      timeout: 15000,
    },
  },

  // Extraction
  extract_text: {
    type: 'extract_text',
    label: 'Extract Text',
    category: 'extraction',
    description: 'Extract text content from an element',
    icon: 'FileText',
    defaultProperties: {
      selector: '',
      outputVariable: 'extractedText',
      timeout: 10000,
    },
  },
  extract_attribute: {
    type: 'extract_attribute',
    label: 'Extract Attribute',
    category: 'extraction',
    description: 'Extract an attribute like href, src, or value',
    icon: 'Tag',
    defaultProperties: {
      selector: '',
      attribute: 'href',
      outputVariable: 'extractedAttr',
      timeout: 10000,
    },
  },
  extract_html: {
    type: 'extract_html',
    label: 'Extract HTML',
    category: 'extraction',
    description: 'Extract outer or inner HTML from an element',
    icon: 'Code',
    defaultProperties: {
      selector: '',
      mode: 'outer',
      outputVariable: 'extractedHtml',
    },
  },
  extract_table: {
    type: 'extract_table',
    label: 'Extract Table',
    category: 'extraction',
    description: 'Parse HTML table into structured JSON rows',
    icon: 'Table',
    defaultProperties: {
      selector: 'table',
      outputVariable: 'tableData',
    },
  },
  extract_multiple: {
    type: 'extract_multiple',
    label: 'Extract Multiple',
    category: 'extraction',
    description: 'Extract text or attributes from all matching elements into an array',
    icon: 'ListChecks',
    defaultProperties: {
      selector: '',
      attribute: '',
      outputVariable: 'extractedList',
      timeout: 10000,
    },
  },
  extract_links: {
    type: 'extract_links',
    label: 'Extract Links',
    category: 'extraction',
    description: 'Scrape all hyperlinks with their text and URLs',
    icon: 'Link',
    defaultProperties: {
      selector: '',
      outputVariable: 'extractedLinks',
      timeout: 10000,
    },
  },

  // Logic
  condition: {
    type: 'condition',
    label: 'Condition',
    category: 'logic',
    description: 'Branch workflow execution based on condition',
    icon: 'GitBranch',
    reactFlowType: 'conditionNode',
    defaultProperties: {
      leftValue: '',
      operator: 'equals',
      rightValue: '',
    },
  },
  contains: {
    type: 'contains',
    label: 'Contains',
    category: 'logic',
    description: 'Check whether an element is present on the page (TRUE / FALSE branches)',
    icon: 'SearchCheck',
    reactFlowType: 'containsNode',
    defaultProperties: {
      selector: '',
      matchMode: 'element',
      text: '',
      visibleOnly: true,
      timeout: 5000,
      outputVariable: 'elementPresent',
    },
  },
  loop: {
    type: 'loop',
    label: 'Loop',
    category: 'logic',
    description: 'Repeat connected downstream nodes N times',
    icon: 'Repeat',
    reactFlowType: 'loopNode',
    defaultProperties: {
      count: 3,
    },
  },
  for_each: {
    type: 'for_each',
    label: 'For Each',
    category: 'logic',
    description: 'Iterate through an array of items',
    icon: 'List',
    reactFlowType: 'loopNode',
    defaultProperties: {
      array: '{{items}}',
    },
  },
  try_catch: {
    type: 'try_catch',
    label: 'Try / Catch',
    category: 'logic',
    description: 'Catch errors and execute fallback action',
    icon: 'ShieldAlert',
    defaultProperties: {},
  },
  break: {
    type: 'break',
    label: 'Break',
    category: 'logic',
    description: 'Exit currently active loop',
    icon: 'Octagon',
    defaultProperties: {},
  },
  continue: {
    type: 'continue',
    label: 'Continue',
    category: 'logic',
    description: 'Skip to next loop iteration',
    icon: 'Play',
    defaultProperties: {},
  },

  // Data
  set_variable: {
    type: 'set_variable',
    label: 'Set Variable',
    category: 'data',
    description: 'Assign a value or expression to a variable',
    icon: 'Variable',
    defaultProperties: {
      name: 'myVar',
      value: '',
    },
  },
  get_variable: {
    type: 'get_variable',
    label: 'Get Variable',
    category: 'data',
    description: 'Retrieve stored variable',
    icon: 'Eye',
    defaultProperties: {
      name: '',
    },
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    category: 'data',
    description: 'Transform text, format casing, or parse data',
    icon: 'Sparkles',
    defaultProperties: {
      input: '',
      operation: 'trim',
      outputVariable: 'transformedText',
    },
  },
  regex: {
    type: 'regex',
    label: 'Regex',
    category: 'data',
    description: 'Extract matches using regular expression',
    icon: 'Regex',
    defaultProperties: {
      text: '',
      pattern: '',
      flags: 'g',
      outputVariable: 'regexMatches',
    },
  },
  json_parse: {
    type: 'json_parse',
    label: 'JSON Parse',
    category: 'data',
    description: 'Parse JSON string into an object or array',
    icon: 'FileJson',
    defaultProperties: {
      text: '',
      outputVariable: 'parsedJson',
    },
  },
  generate_data: {
    type: 'generate_data',
    label: 'Generate Data',
    category: 'data',
    description: 'Generate mock random data (email, name, UUID, timestamp)',
    icon: 'Sparkles',
    defaultProperties: {
      dataType: 'email',
      outputVariable: 'generatedData',
    },
  },

  // Utility
  screenshot: {
    type: 'screenshot',
    label: 'Screenshot',
    category: 'utility',
    description: 'Capture screenshot of current page or viewport',
    icon: 'Camera',
    defaultProperties: {
      outputVariable: 'screenshotUrl',
    },
  },
  execute_javascript: {
    type: 'execute_javascript',
    label: 'Execute JS',
    category: 'utility',
    description: 'Run custom JavaScript script in page context',
    icon: 'Terminal',
    defaultProperties: {
      code: 'return document.title;',
      outputVariable: 'scriptResult',
    },
  },
  http_request: {
    type: 'http_request',
    label: 'HTTP Request',
    category: 'utility',
    description: 'Make an API request (GET, POST, etc.)',
    icon: 'Send',
    defaultProperties: {
      method: 'GET',
      url: 'https://httpbin.org/get',
      outputVariable: 'apiResponse',
    },
  },
  storage_manage: {
    type: 'storage_manage',
    label: 'Storage Manage',
    category: 'utility',
    description: 'Get, set, or clear localStorage and sessionStorage',
    icon: 'Database',
    defaultProperties: {
      type: 'local',
      action: 'get',
      key: '',
      value: '',
      outputVariable: 'storedValue',
    },
  },
  clipboard: {
    type: 'clipboard',
    label: 'Clipboard',
    category: 'utility',
    description: 'Copy text to or read text from system clipboard',
    icon: 'Clipboard',
    defaultProperties: {
      action: 'write',
      text: '{{extractedData}}',
      outputVariable: 'clipboardText',
    },
  },
  ai_agent: {
    type: 'ai_agent',
    label: 'AI Agent',
    category: 'utility',
    description: 'Run LLM prompt to summarize, classify, or analyze page data',
    icon: 'Brain',
    defaultProperties: {
      prompt: 'Summarize the extracted content: {{extractedText}}',
      model: 'gpt-5.6-sol',
      outputVariable: 'aiAnalysis',
      jsonMode: false,
    },
  },
  autonomous_agent: {
    type: 'autonomous_agent',
    label: 'Autonomous Agent',
    category: 'utility',
    description: 'Vision-driven AI agent that clicks, types, and navigates based on a goal',
    icon: 'Bot',
    defaultProperties: {
      goal: 'Find {{query}} on page and extract details',
      maxSteps: 10,
      model: 'gpt-5.6-sol',
      outputVariable: 'agentResult',
    },
  },
};

export const CATEGORIES: { id: NodeCategory; label: string; color: string }[] = [
  { id: 'browser', label: 'Browser', color: '#3b82f6' },
  { id: 'interaction', label: 'Interaction', color: '#6366f1' },
  { id: 'wait', label: 'Wait', color: '#f59e0b' },
  { id: 'extraction', label: 'Extraction', color: '#10b981' },
  { id: 'logic', label: 'Logic', color: '#8b5cf6' },
  { id: 'data', label: 'Data', color: '#ec4899' },
  { id: 'utility', label: 'Utility', color: '#06b6d4' },
];

export function getNodeDefinition(type: NodeType): NodeDefinition {
  return NODE_REGISTRY[type] || NODE_REGISTRY.navigate;
}
