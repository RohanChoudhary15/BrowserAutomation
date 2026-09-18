import { ExecutionContext, NodeResult } from '../../types/execution';
import { WorkflowNode } from '../../types/workflow';
import { interpolateVariables } from '../interpolator';
import { evaluateCondition } from '../evaluator';
import { queryLlm } from '../../ai/aiService';
import { runBrowserAgent } from '../../ai/browserAgent';

export type NodeExecutor = (node: WorkflowNode, ctx: ExecutionContext) => Promise<NodeResult>;

/**
 * Sends DOM action request to content script via background or directly
 */
async function sendDomAction(
  action: string,
  params: Record<string, any>,
  ctx: ExecutionContext,
  timeout = 10000
): Promise<any> {
  if (ctx.signal?.aborted) throw new Error('Execution aborted by user.');

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_DOM_ACTION',
      payload: {
        action,
        params,
        timeout,
        tabId: ctx.currentTabId,
        ...(ctx.human ? { human: ctx.human } : {}),
      },
    });

    if (!response || response.error) {
      throw new Error(response?.error || `Failed to execute DOM action: ${action}`);
    }
    return response;
  } else {
    // In mock/test environment without chrome API, fallback or simulate
    console.warn(`[AutoFlow Mock] Simulating DOM action: ${action}`, params);
    return { success: true, text: 'Sample Text', html: '<div>Sample</div>', rows: [] };
  }
}

// ----------------- BROWSER EXECUTORS -----------------

export const executeNavigate: NodeExecutor = async (node, ctx) => {
  const rawUrl = node.data.properties.url || 'https://example.com';
  const url = interpolateVariables(rawUrl, ctx.variables);
  const waitUntil = node.data.properties.waitUntil || 'load';

  ctx.log({
    level: 'info',
    message: `Navigating to ${url}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  let screenshotUrl: string | undefined;

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: 'NAVIGATE_TAB',
      payload: { tabId: ctx.currentTabId, url, waitUntil },
    });
    if (!response?.success) throw new Error(response?.error || 'Navigation failed.');
    ctx.currentUrl = url;

    screenshotUrl = response.dataUrl || response.screenshotUrl;
    if (!screenshotUrl) {
      const screenRes = await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        payload: { tabId: ctx.currentTabId },
      }).catch(() => null);
      if (screenRes?.success && screenRes.dataUrl) {
        screenshotUrl = screenRes.dataUrl;
      }
    }
  }

  ctx.log({
    level: 'success',
    message: `Navigated to ${url} (website loaded)`,
    nodeId: node.id,
    nodeName: node.data.label,
    screenshotUrl,
  });

  return { success: true, output: { url, screenshotUrl } };
};

export const executeBack: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Navigating back', nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs && ctx.currentTabId) {
    await chrome.tabs.goBack(ctx.currentTabId).catch(() => {});
  }
  return { success: true };
};

export const executeForward: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Navigating forward', nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs && ctx.currentTabId) {
    await chrome.tabs.goForward(ctx.currentTabId).catch(() => {});
  }
  return { success: true };
};

export const executeReload: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Reloading page', nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs && ctx.currentTabId) {
    await chrome.tabs.reload(ctx.currentTabId).catch(() => {});
  }
  return { success: true };
};

export const executeNewTab: NodeExecutor = async (node, ctx) => {
  const url = interpolateVariables(node.data.properties.url || 'about:blank', ctx.variables);
  ctx.log({ level: 'info', message: `Opening new tab: ${url}`, nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    const tab = await chrome.tabs.create({ url });
    ctx.currentTabId = tab.id;
    return { success: true, output: { tabId: tab.id, url } };
  }
  return { success: true };
};

export const executeCloseTab: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Closing current tab', nodeId: node.id, nodeName: node.data.label });
  if (typeof chrome !== 'undefined' && chrome.tabs && ctx.currentTabId) {
    await chrome.tabs.remove(ctx.currentTabId).catch(() => {});
  }
  return { success: true };
};

export const executeSwitchTab: NodeExecutor = async (node, ctx) => {
  return { success: true };
};

// ----------------- INTERACTION EXECUTORS -----------------

export const executeClick: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const clickType = node.data.properties.clickType || 'left';
  const timeout = Number(node.data.properties.timeout) || 10000;

  if (!selector) throw new Error('Click node requires a selector.');

  ctx.log({
    level: 'info',
    message: `Clicking element: ${selector} (${clickType})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction('click', { selector, clickType, timeout }, ctx, timeout);
  return { success: true, output: res };
};

export const executeTypeText: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const rawText = node.data.properties.text ?? '';
  const text = String(interpolateVariables(rawText, ctx.variables));
  const clearExisting = node.data.properties.clearExisting !== false;
  const typingDelay = Number(node.data.properties.typingDelay) || 0;
  const timeout = Number(node.data.properties.timeout) || 10000;

  if (!selector) throw new Error('Type Text node requires a selector.');

  ctx.log({
    level: 'info',
    message: `Typing "${text.length > 25 ? text.substring(0, 22) + '...' : text}" into ${selector}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction('type_text', { selector, text, clearExisting, typingDelay, timeout }, ctx, timeout);
  return { success: true, output: res };
};

export const executeClearInput: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  if (!selector) throw new Error('Clear Input node requires a selector.');
  const res = await sendDomAction('clear_input', { selector }, ctx);
  return { success: true, output: res };
};

export const executeHover: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  if (!selector) throw new Error('Hover node requires a selector.');
  const res = await sendDomAction('hover', { selector }, ctx);
  return { success: true, output: res };
};

export const executePressKey: NodeExecutor = async (node, ctx) => {
  const rawKey = node.data.properties.key || 'Enter';
  const key = String(interpolateVariables(rawKey, ctx.variables));
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  ctx.log({ level: 'info', message: `Pressing key "${key}"`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('press_key', { key, selector }, ctx);
  return { success: true, output: res };
};

export const executeScroll: NodeExecutor = async (node, ctx) => {
  const direction = node.data.properties.direction || 'down';
  const amount = node.data.properties.amount || 400;
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  ctx.log({ level: 'info', message: `Scrolling ${direction} by ${amount}px`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('scroll', { direction, amount, selector }, ctx);
  return { success: true, output: res };
};

export const executeSelectDropdown: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const selectionType = node.data.properties.selectionType || 'value';
  const value = interpolateVariables(node.data.properties.value, ctx.variables);
  const label = interpolateVariables(node.data.properties.label, ctx.variables);
  const index = node.data.properties.index !== undefined ? Number(node.data.properties.index) : undefined;

  ctx.log({ level: 'info', message: `Selecting dropdown option in ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('select_dropdown', { selector, selectionType, value, label, index }, ctx);
  return { success: true, output: res };
};

export const executeDragAndDrop: NodeExecutor = async (node, ctx) => {
  return { success: true };
};

// ----------------- WAIT EXECUTORS -----------------

export const executeWait: NodeExecutor = async (node, ctx) => {
  let duration = Number(node.data.properties.duration ?? node.data.properties.durationMs) || 1000;
  if (node.data.properties.unit === 's' || duration < 50) {
    duration = duration * 1000;
  }
  ctx.log({ level: 'info', message: `Waiting for ${duration}ms`, nodeId: node.id, nodeName: node.data.label });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, duration);
    if (ctx.signal) {
      ctx.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Wait aborted by user.'));
      });
    }
  });

  return { success: true, output: { durationMs: duration } };
};

export const executeWaitForElement: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const timeout = Number(node.data.properties.timeout) || 10000;
  const visible = node.data.properties.visible !== false;
  const enabled = !!node.data.properties.enabled;

  if (!selector) throw new Error('Wait For Element node requires a selector.');

  ctx.log({ level: 'info', message: `Waiting for element: ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('wait_for_element', { selector, timeout, visible, enabled }, ctx, timeout);
  return { success: true, output: res };
};

export const executeWaitForText: NodeExecutor = async (node, ctx) => {
  const rawText = node.data.properties.text || '';
  const text = String(interpolateVariables(rawText, ctx.variables));
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  const timeout = Number(node.data.properties.timeout) || 10000;

  ctx.log({ level: 'info', message: `Waiting for text: "${text}"`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('wait_for_text', { text, selector, timeout }, ctx, timeout);
  return { success: true, output: res };
};

// ----------------- EXTRACTION EXECUTORS -----------------

export const executeExtractText: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'extractedText';
  const timeout = Number(node.data.properties.timeout) || 10000;

  if (!selector) throw new Error('Extract Text requires a selector.');

  ctx.log({ level: 'info', message: `Extracting text from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_text', { selector, timeout }, ctx, timeout);

  return {
    success: true,
    output: res.text,
    variables: { [outputVariable]: res.text },
  };
};

export const executeExtractAttribute: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const attribute = node.data.properties.attribute || 'href';
  const outputVariable = node.data.properties.outputVariable || 'extractedAttr';

  ctx.log({ level: 'info', message: `Extracting attribute "${attribute}" from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_attribute', { selector, attribute }, ctx);

  return {
    success: true,
    output: res.value,
    variables: { [outputVariable]: res.value },
  };
};

export const executeExtractHtml: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const mode = node.data.properties.mode || 'outer';
  const outputVariable = node.data.properties.outputVariable || 'extractedHtml';

  ctx.log({ level: 'info', message: `Extracting HTML from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_html', { selector, mode }, ctx);

  return {
    success: true,
    output: res.html,
    variables: { [outputVariable]: res.html },
  };
};

export const executeExtractTable: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'extractedTable';

  ctx.log({ level: 'info', message: `Extracting table from ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_table', { selector }, ctx);

  return {
    success: true,
    output: res.rows,
    variables: { [outputVariable]: res.rows },
  };
};

// ----------------- LOGIC EXECUTORS -----------------

export const executeCondition: NodeExecutor = async (node, ctx) => {
  const leftValue = node.data.properties.leftValue;
  const operator = node.data.properties.operator || 'equals';
  const rightValue = node.data.properties.rightValue;

  const result = evaluateCondition({ leftValue, operator, rightValue }, ctx.variables);
  const branch = result ? 'true' : 'false';

  ctx.log({
    level: 'info',
    message: `Condition evaluated: ${result ? 'TRUE' : 'FALSE'} (${leftValue} ${operator} ${rightValue})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: { result, branch },
    nextBranch: branch,
  };
};

/**
 * "Contains" node: checks whether a particular element is present on the page.
 * Branches to TRUE when the element is found, FALSE otherwise.
 */
export const executeContains: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  if (!selector) throw new Error('Contains node requires a selector.');

  const matchMode = node.data.properties.matchMode || 'element';
  const rawText = node.data.properties.text || '';
  const text = rawText ? String(interpolateVariables(rawText, ctx.variables)) : '';
  const visibleOnly = node.data.properties.visibleOnly !== false;
  const timeout = Number(node.data.properties.timeout) || 5000;
  const outputVariable = node.data.properties.outputVariable || 'elementPresent';

  ctx.log({
    level: 'info',
    message: `Checking if page contains element: ${selector}${text ? ` (text "${text}")` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'check_element_presence',
    { selector, timeout, visibleOnly, text: matchMode === 'text' ? text : '' },
    ctx,
    timeout
  );

  const present = res?.present === true;
  const branch = present ? 'true' : 'false';

  ctx.log({
    level: present ? 'success' : 'warn',
    message: present
      ? `Element FOUND - taking TRUE branch (${selector})`
      : `Element NOT FOUND - taking FALSE branch (${selector})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: { present, branch, matchedText: res?.matchedText },
    nextBranch: branch,
    variables: { [outputVariable]: present },
  };
};

export const executeBreak: NodeExecutor = async () => ({ success: true, breakLoop: true });
export const executeContinue: NodeExecutor = async () => ({ success: true, continueLoop: true });

// ----------------- DATA EXECUTORS -----------------

export const executeSetVariable: NodeExecutor = async (node, ctx) => {
  const name = node.data.properties.name;
  if (!name) throw new Error('Set Variable requires a variable name.');

  const rawVal = node.data.properties.value;
  const value = interpolateVariables(rawVal, ctx.variables);

  ctx.log({
    level: 'info',
    message: `Set variable "${name}" = ${JSON.stringify(value)}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: value,
    variables: { [name]: value },
  };
};

export const executeGetVariable: NodeExecutor = async (node, ctx) => {
  const name = node.data.properties.name;
  const val = ctx.variables[name];
  return { success: true, output: val };
};

export const executeTransform: NodeExecutor = async (node, ctx) => {
  const input = interpolateVariables(node.data.properties.input, ctx.variables);
  const operation = node.data.properties.operation || 'trim';
  const outputVariable = node.data.properties.outputVariable || 'transformedValue';

  let result: any = input;
  const str = String(input ?? '');

  switch (operation) {
    case 'lowercase': result = str.toLowerCase(); break;
    case 'uppercase': result = str.toUpperCase(); break;
    case 'trim': result = str.trim(); break;
    case 'replace': {
      const search = node.data.properties.search || '';
      const replaceWith = node.data.properties.replaceWith || '';
      result = str.replaceAll(search, replaceWith);
      break;
    }
    case 'split': {
      const delimiter = node.data.properties.delimiter || ',';
      result = str.split(delimiter).map(s => s.trim());
      break;
    }
    case 'join': {
      const delimiter = node.data.properties.delimiter || ', ';
      result = Array.isArray(input) ? input.join(delimiter) : str;
      break;
    }
    case 'substring': {
      const start = Number(node.data.properties.start) || 0;
      const length = node.data.properties.length !== undefined ? Number(node.data.properties.length) : undefined;
      result = length !== undefined ? str.substring(start, start + length) : str.substring(start);
      break;
    }
    case 'parseNumber': {
      const cleaned = str.replace(/[^0-9.-]/g, '');
      result = Number(cleaned);
      break;
    }
    case 'parseJSON': {
      result = JSON.parse(str);
      break;
    }
  }

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeRegex: NodeExecutor = async (node, ctx) => {
  const text = String(interpolateVariables(node.data.properties.text, ctx.variables) ?? '');
  const pattern = node.data.properties.pattern || '';
  const flags = node.data.properties.flags || 'g';
  const outputVariable = node.data.properties.outputVariable || 'regexMatch';

  const reg = new RegExp(pattern, flags);
  const matches = Array.from(text.matchAll(reg)).map(m => m[0]);

  return {
    success: true,
    output: matches,
    variables: { [outputVariable]: matches },
  };
};

export const executeJsonParse: NodeExecutor = async (node, ctx) => {
  const text = String(interpolateVariables(node.data.properties.text, ctx.variables) ?? '');
  const outputVariable = node.data.properties.outputVariable || 'parsedJson';
  const parsed = JSON.parse(text);

  return {
    success: true,
    output: parsed,
    variables: { [outputVariable]: parsed },
  };
};

// ----------------- UTILITY EXECUTORS -----------------

export const executeScreenshot: NodeExecutor = async (node, ctx) => {
  ctx.log({ level: 'info', message: 'Capturing screenshot', nodeId: node.id, nodeName: node.data.label });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const res = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      payload: { tabId: ctx.currentTabId },
    });

    if (!res?.success) throw new Error(res?.error || 'Screenshot capture failed.');

    const outputVariable = node.data.properties.outputVariable || 'screenshotUrl';
    ctx.log({
      level: 'success',
      message: 'Screenshot captured successfully',
      nodeId: node.id,
      nodeName: node.data.label,
      screenshotUrl: res.dataUrl,
    });

    return {
      success: true,
      output: res.dataUrl,
      variables: { [outputVariable]: res.dataUrl },
    };
  }

  return { success: true, output: 'data:image/png;base64,mock' };
};

export const executeJavaScript: NodeExecutor = async (node, ctx) => {
  const rawCode = node.data.properties.code || 'return true;';
  const code = interpolateVariables(rawCode, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'scriptResult';

  ctx.log({ level: 'info', message: 'Executing custom JavaScript in page context', nodeId: node.id, nodeName: node.data.label });

  // Safe execution with wrapped AsyncFunction
  const func = new Function('variables', 'context', `return (async () => { ${code} })();`);
  const result = await func(ctx.variables, ctx);

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeHttpRequest: NodeExecutor = async (node, ctx) => {
  const method = node.data.properties.method || 'GET';
  const rawUrl = node.data.properties.url || 'https://httpbin.org/get';
  const url = interpolateVariables(rawUrl, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'httpResponse';

  let headers: Record<string, string> = {};
  if (node.data.properties.headers) {
    headers = interpolateVariables(node.data.properties.headers, ctx.variables);
  }

  let body: any = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method) && node.data.properties.body) {
    body = typeof node.data.properties.body === 'string'
      ? interpolateVariables(node.data.properties.body, ctx.variables)
      : JSON.stringify(interpolateVariables(node.data.properties.body, ctx.variables));
  }

  ctx.log({ level: 'info', message: `HTTP ${method} ${url}`, nodeId: node.id, nodeName: node.data.label });

  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: ctx.signal,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  const result = {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    data,
  };

  return {
    success: response.ok,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeExtractMultiple: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const attribute = node.data.properties.attribute ? interpolateVariables(node.data.properties.attribute, ctx.variables) : undefined;
  const outputVariable = node.data.properties.outputVariable || 'extractedList';
  const timeout = Number(node.data.properties.timeout) || 10000;

  if (!selector) throw new Error('Extract Multiple requires a selector.');

  ctx.log({ level: 'info', message: `Extracting elements matching ${selector}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_multiple', { selector, attribute, timeout }, ctx, timeout);

  return {
    success: true,
    output: res.items,
    variables: { [outputVariable]: res.items },
  };
};

export const executeExtractLinks: NodeExecutor = async (node, ctx) => {
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  const outputVariable = node.data.properties.outputVariable || 'extractedLinks';
  const timeout = Number(node.data.properties.timeout) || 10000;

  ctx.log({ level: 'info', message: `Extracting links from ${selector || 'page'}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_links', { selector, timeout }, ctx, timeout);

  return {
    success: true,
    output: res.links,
    variables: { [outputVariable]: res.links },
  };
};

export const executeStorageManage: NodeExecutor = async (node, ctx) => {
  const storageType = node.data.properties.type || 'local';
  const action = node.data.properties.action || 'get';
  const key = node.data.properties.key ? interpolateVariables(node.data.properties.key, ctx.variables) : undefined;
  const rawValue = node.data.properties.value;
  const value = rawValue !== undefined ? interpolateVariables(rawValue, ctx.variables) : undefined;
  const outputVariable = node.data.properties.outputVariable || 'storageValue';

  ctx.log({ level: 'info', message: `${action.toUpperCase()} ${storageType}Storage [${key || '*'}]`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('storage_manage', { type: storageType, action, key, value }, ctx);

  const vars: Record<string, any> = {};
  if (action === 'get' && res.data !== undefined) {
    vars[outputVariable] = res.data;
  }

  return {
    success: true,
    output: res.data,
    variables: vars,
  };
};

export const executeGenerateData: NodeExecutor = async (node, ctx) => {
  const dataType = node.data.properties.dataType || 'email';
  const outputVariable = node.data.properties.outputVariable || 'generatedData';

  let value: any = '';
  const randId = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now();

  switch (dataType) {
    case 'email':
      value = `test.user_${randId}@example.com`;
      break;
    case 'name': {
      const names = ['Alex Mercer', 'Jordan Hayes', 'Taylor Swift', 'Morgan Reed', 'Sam Fisher', 'Elena Ramos'];
      value = names[Math.floor(Math.random() * names.length)];
      break;
    }
    case 'uuid':
      value = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      break;
    case 'number': {
      const min = Number(node.data.properties.min) || 1;
      const max = Number(node.data.properties.max) || 100;
      value = Math.floor(Math.random() * (max - min + 1)) + min;
      break;
    }
    case 'timestamp':
      value = timestamp;
      break;
    case 'date':
      value = new Date().toISOString();
      break;
    default:
      value = `mock_${randId}`;
  }

  ctx.log({ level: 'info', message: `Generated ${dataType}: "${value}"`, nodeId: node.id, nodeName: node.data.label });

  return {
    success: true,
    output: value,
    variables: { [outputVariable]: value },
  };
};

export const executeClipboard: NodeExecutor = async (node, ctx) => {
  const action = node.data.properties.action || 'write';
  const outputVariable = node.data.properties.outputVariable || 'clipboardText';

  if (action === 'read') {
    ctx.log({ level: 'info', message: 'Reading from system clipboard', nodeId: node.id, nodeName: node.data.label });
    const res = await sendDomAction('clipboard', { action: 'read' }, ctx);
    const text = res?.text || '';
    ctx.log({ level: 'info', message: `Read ${text.length} chars from clipboard into {{${outputVariable}}}`, nodeId: node.id, nodeName: node.data.label });
    return {
      success: true,
      output: text,
      variables: { [outputVariable]: text },
    };
  }

  const rawText = node.data.properties.text || '';
  const text = String(interpolateVariables(rawText, ctx.variables));

  ctx.log({ level: 'info', message: `Writing to clipboard (${text.length} chars)`, nodeId: node.id, nodeName: node.data.label });
  await sendDomAction('clipboard', { action: 'write', text }, ctx);

  return { success: true, output: text };
};

export const executeWaitForNavigation: NodeExecutor = async (node, ctx) => {
  const urlPattern = node.data.properties.urlPattern ? interpolateVariables(node.data.properties.urlPattern, ctx.variables) : undefined;
  const timeout = Number(node.data.properties.timeout) || 15000;

  ctx.log({ level: 'info', message: `Waiting for navigation${urlPattern ? ' to ' + urlPattern : ''}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('wait_for_navigation', { urlPattern, timeout }, ctx, timeout);

  return { success: true, output: res };
};

export const executeAiAgent: NodeExecutor = async (node, ctx) => {
  const rawPrompt = node.data.properties.prompt || 'Analyze this content: {{extractedText}}';
  const prompt = interpolateVariables(rawPrompt, ctx.variables);
  const systemInstruction = node.data.properties.systemInstruction
    ? interpolateVariables(node.data.properties.systemInstruction, ctx.variables)
    : undefined;
  const outputVariable = node.data.properties.outputVariable || 'aiAnalysis';
  const jsonMode = !!node.data.properties.jsonMode;

  const customModel = node.data.properties.model;
  const customProvider = node.data.properties.provider;
  const customOpenaiBaseUrl = node.data.properties.openaiBaseUrl;

  const responseText = await queryLlm(prompt, systemInstruction, {
    ...(customModel ? { model: customModel } : {}),
    ...(customProvider ? { provider: customProvider } : {}),
    ...(customOpenaiBaseUrl ? { openaiBaseUrl: customOpenaiBaseUrl } : {}),
  });

  let output: any = responseText;
  if (jsonMode) {
    try {
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      output = JSON.parse(cleanJson);
    } catch {
      output = responseText;
    }
  }

  ctx.log({
    level: 'success',
    message: `AI Agent finished analysis`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output,
    variables: { [outputVariable]: output },
  };
};

export const executeAutonomousAgent: NodeExecutor = async (node, ctx) => {
  const rawGoal = node.data.properties.goal || 'Inspect page and extract key information';
  const goal = interpolateVariables(rawGoal, ctx.variables);
  const maxSteps = Number(node.data.properties.maxSteps) || 10;
  const outputVariable = node.data.properties.outputVariable || 'agentResult';
  const customModel = node.data.properties.model;

  ctx.log({
    level: 'info',
    message: `Launching Autonomous Browser Agent: "${goal}" (Max steps: ${maxSteps})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const steps = await runBrowserAgent({
    goal,
    maxSteps,
    tabId: ctx.currentTabId,
    config: customModel ? { model: customModel } : undefined,
    signal: ctx.signal,
    onStatusUpdate: (status) => {
      ctx.log({
        level: 'info',
        message: status,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    },
    onStep: (step) => {
      ctx.log({
        level: step.success ? 'info' : 'warn',
        message: `Step #${step.stepNumber} [${step.action.type.toUpperCase()}]: ${step.thought}`,
        nodeId: node.id,
        nodeName: node.data.label,
        data: {
          action: step.action,
          screenshot: step.screenshotAfter || step.screenshotBefore,
        },
      });
    },
  });

  const lastStep = steps[steps.length - 1];
  const finalAnswer = lastStep?.action.answer || `Completed ${steps.length} steps`;

  ctx.log({
    level: 'success',
    message: `Autonomous Agent completed in ${steps.length} steps: ${finalAnswer}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: finalAnswer,
    variables: {
      [outputVariable]: finalAnswer,
      [`${outputVariable}_steps`]: steps,
    },
  };
};

export const executors: Record<string, NodeExecutor> = {
  navigate: executeNavigate,
  back: executeBack,
  forward: executeForward,
  reload: executeReload,
  new_tab: executeNewTab,
  close_tab: executeCloseTab,
  switch_tab: executeSwitchTab,
  click: executeClick,
  type_text: executeTypeText,
  clear_input: executeClearInput,
  hover: executeHover,
  press_key: executePressKey,
  scroll: executeScroll,
  select_dropdown: executeSelectDropdown,
  drag_and_drop: executeDragAndDrop,
  wait: executeWait,
  wait_for_element: executeWaitForElement,
  wait_for_text: executeWaitForText,
  wait_for_navigation: executeWaitForNavigation,
  extract_text: executeExtractText,
  extract_attribute: executeExtractAttribute,
  extract_html: executeExtractHtml,
  extract_table: executeExtractTable,
  extract_multiple: executeExtractMultiple,
  extract_links: executeExtractLinks,
  condition: executeCondition,
  contains: executeContains,
  break: executeBreak,
  continue: executeContinue,
  set_variable: executeSetVariable,
  get_variable: executeGetVariable,
  transform: executeTransform,
  regex: executeRegex,
  json_parse: executeJsonParse,
  generate_data: executeGenerateData,
  screenshot: executeScreenshot,
  execute_javascript: executeJavaScript,
  http_request: executeHttpRequest,
  storage_manage: executeStorageManage,
  clipboard: executeClipboard,
  ai_agent: executeAiAgent,
  autonomous_agent: executeAutonomousAgent,
};



