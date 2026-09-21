import { ExecutionContext, NodeResult } from '../../types/execution';
import { WorkflowNode } from '../../types/workflow';
import { interpolateVariables } from '../interpolator';
import {
  evaluateCondition,
  LogicalGate,
  ConditionRule,
} from '../evaluator';
import { queryLlm } from '../../ai/aiService';
import { runBrowserAgent } from '../../ai/browserAgent';
import { getCredentialById } from '../../storage/credentialStore';
import { formatAiAgentDocument, AiAgentOutputFormat } from '../../utils/documentExporter';
import { runInSandbox, safeEvaluateMath } from '../sandboxEvaluator';

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

    if (response.tabId && !ctx.currentTabId) {
      ctx.currentTabId = response.tabId;
    }
    return response;
  } else {
    console.warn(`[AutoFlow Mock] Simulating DOM action: ${action}`, params);
    if (action === 'extract_image') {
      return { success: true, url: 'https://example.com/mock-image.png', dataUrl: 'https://example.com/mock-image.png', items: [] };
    }
    if (action === 'extract_all_images') {
      return {
        success: true,
        count: 2,
        items: [
          { url: 'https://example.com/mock1.png', dataUrl: 'https://example.com/mock1.png', alt: 'Mock 1', width: 200, height: 100, tagName: 'IMG' },
          { url: 'https://example.com/mock2.png', dataUrl: 'https://example.com/mock2.png', alt: 'Mock 2', width: 300, height: 150, tagName: 'IMG' },
        ],
        urls: ['https://example.com/mock1.png', 'https://example.com/mock2.png'],
      };
    }
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
    if (response.tabId) {
      ctx.currentTabId = response.tabId;
    }

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
  const totalSeconds = Number((duration / 1000).toFixed(1));
  const startTime = Date.now();

  ctx.log({ level: 'info', message: `Waiting for ${duration}ms (${totalSeconds}s)`, nodeId: node.id, nodeName: node.data.label });

  // Initial countdown state on canvas
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      remainingSeconds: totalSeconds,
      totalSeconds,
      elapsedSeconds: 0,
      progress: 0,
      message: `${totalSeconds}s remaining`,
    },
  });

  await new Promise<void>((resolve, reject) => {
    const updateInterval = 100;
    const intervalTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(0, duration - elapsed);
      const remainingSec = Number((remainingMs / 1000).toFixed(1));
      const elapsedSec = Number((elapsed / 1000).toFixed(1));
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));

      ctx.updateNodeState(node.id, {
        status: 'running',
        dynamicState: {
          remainingSeconds: remainingSec,
          totalSeconds,
          elapsedSeconds: elapsedSec,
          progress,
          message: `${remainingSec}s remaining`,
        },
      });

      if (remainingMs <= 0) {
        clearInterval(intervalTimer);
      }
    }, updateInterval);

    const timer = setTimeout(() => {
      clearInterval(intervalTimer);
      resolve();
    }, duration);

    if (ctx.signal) {
      ctx.signal.addEventListener('abort', () => {
        clearInterval(intervalTimer);
        clearTimeout(timer);
        reject(new Error('Wait aborted by user.'));
      });
    }
  });

  // Final success state
  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      remainingSeconds: 0,
      totalSeconds,
      elapsedSeconds: totalSeconds,
      progress: 100,
      message: `Waited ${totalSeconds}s`,
    },
  });

  return { success: true, output: { durationMs: duration, seconds: totalSeconds } };
};

export const executeWaitForElement: NodeExecutor = async (node, ctx) => {
  const selector = interpolateVariables(node.data.properties.selector, ctx.variables);
  const timeout = Number(node.data.properties.timeout) || 10000;
  const visible = node.data.properties.visible !== false;
  const enabled = !!node.data.properties.enabled;

  if (!selector) throw new Error('Wait For Element node requires a selector.');

  ctx.log({ level: 'info', message: `Waiting for element: ${selector}`, nodeId: node.id, nodeName: node.data.label });
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Searching for ${selector.slice(0, 20)}...`,
      detail: selector,
    },
  });

  const res = await sendDomAction('wait_for_element', { selector, timeout, visible, enabled }, ctx, timeout);

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: 'Found element',
      detail: selector,
    },
  });

  return { success: true, output: res };
};

export const executeWaitForText: NodeExecutor = async (node, ctx) => {
  const rawText = node.data.properties.text || '';
  const text = String(interpolateVariables(rawText, ctx.variables));
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  const timeout = Number(node.data.properties.timeout) || 10000;
  const matchMode = node.data.properties.matchMode || 'partial';
  const caseSensitive = !!node.data.properties.caseSensitive;

  ctx.log({
    level: 'info',
    message: `Waiting for text: "${text}" (${matchMode === 'exact' ? 'Exact Match' : 'Partial Match'}, ${caseSensitive ? 'case-sensitive' : 'case-insensitive'}, timeout ${timeout}ms)`,
    nodeId: node.id,
    nodeName: node.data.label,
  });
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Waiting for "${text.slice(0, 18)}"...`,
      detail: text,
    },
  });

  const res = await sendDomAction(
    'wait_for_text',
    { text, selector, timeout, matchMode, caseSensitive },
    ctx,
    timeout + 1500
  );

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Found "${text.slice(0, 18)}"`,
      detail: text,
    },
  });

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
  const leftValue = interpolateVariables(node.data.properties.leftValue || '', ctx.variables);
  const operator = node.data.properties.operator || 'equals';
  const rightValue = interpolateVariables(node.data.properties.rightValue || '', ctx.variables);
  const caseSensitive = !!node.data.properties.caseSensitive;

  const rule: ConditionRule = {
    type: 'variable',
    leftValue,
    operator,
    rightValue,
    caseSensitive,
  };

  const result = evaluateCondition(rule, ctx.variables);
  const branch = result ? 'true' : 'false';
  const outputVariable = node.data.properties.outputVariable || 'conditionResult';
  ctx.variables[outputVariable] = result;

  const desc = `${leftValue} ${operator} ${rightValue}`;
  ctx.log({
    level: 'info',
    message: `Condition evaluated: ${result ? 'TRUE' : 'FALSE'} (${desc})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: { result, branch, desc },
    nextBranch: branch,
  };
};

/**
 * Logic Gate executor for AND, OR, NAND, NOR nodes.
 * Combines multiple incoming branches into 1 branch according to boolean logic.
 */
export const executeLogicGate: NodeExecutor = async (node, ctx) => {
  const rawType = String(node.data.type || '').toLowerCase();
  let gate = String(node.data.properties.gate || '').toUpperCase() as LogicalGate;
  if (!gate) {
    if (rawType.includes('and') && !rawType.includes('nand')) gate = 'AND';
    else if (rawType.includes('nand')) gate = 'NAND';
    else if (rawType.includes('nor')) gate = 'NOR';
    else gate = 'OR';
  }

  const incomingInputs: Array<{ id: string; name?: string; result: boolean; output?: any }> =
    ctx._gateInputs?.[node.id] || node.data.properties._evaluatedInputs || [];

  let result = false;
  let summary = '';

  if (incomingInputs.length > 0) {
    const inputBools = incomingInputs.map((i) => Boolean(i.result));
    if (gate === 'AND') {
      result = inputBools.every((b) => b === true);
      summary = `All ${inputBools.length} branches: [${inputBools.join(', ')}]`;
    } else if (gate === 'OR') {
      result = inputBools.some((b) => b === true);
      summary = `Any of ${inputBools.length} branches: [${inputBools.join(', ')}]`;
    } else if (gate === 'NAND') {
      result = !inputBools.every((b) => b === true);
      summary = `NOT (${inputBools.join(' AND ')})`;
    } else if (gate === 'NOR') {
      result = !inputBools.some((b) => b === true);
      summary = `NOT (${inputBools.join(' OR ')})`;
    }
  } else {
    // If executed standalone (e.g. debugging without connected edges)
    result = gate === 'AND' || gate === 'OR';
    summary = 'Standalone execution (no incoming branches attached)';
  }

  const outputVariable = node.data.properties.outputVariable || `${gate.toLowerCase()}Result`;
  ctx.variables[outputVariable] = result;

  const branch = result ? 'true' : 'false';

  ctx.log({
    level: 'info',
    message: `${gate} Gate evaluated: ${result ? 'TRUE' : 'FALSE'} (${summary}) -> Combining branches to 1 output`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: {
      result,
      gate,
      branch,
      inputs: incomingInputs,
      summary,
    },
    nextBranch: 'output',
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
  const textMatchMode = (node.data.properties.textMatchMode as 'exact' | 'partial') || 'partial';
  const caseSensitive = !!node.data.properties.caseSensitive;
  const visibleOnly = node.data.properties.visibleOnly !== false;
  const timeout = Number(node.data.properties.timeout) || 5000;
  const outputVariable = node.data.properties.outputVariable || 'elementPresent';

  ctx.log({
    level: 'info',
    message: `Checking if page contains element: ${selector}${text ? ` (text "${text}", mode: ${textMatchMode}, case: ${caseSensitive ? 'sensitive' : 'insensitive'})` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'check_element_presence',
    {
      selector,
      timeout,
      visibleOnly,
      text: matchMode === 'text' ? text : '',
      matchMode: textMatchMode,
      caseSensitive,
    },
    ctx,
    timeout + 1500
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

/**
 * "Contains Text" node: checks whether a particular text exists on the page (or within a container).
 * Non-throwing condition node: branches to TRUE when the text is found, FALSE otherwise.
 */
export const executeContainsText: NodeExecutor = async (node, ctx) => {
  const rawText = node.data.properties.text || '';
  const text = rawText ? String(interpolateVariables(rawText, ctx.variables)) : '';
  if (!text) {
    throw new Error('Contains Text node requires text to search for.');
  }

  const rawSelector = node.data.properties.selector || '';
  const selector = rawSelector ? String(interpolateVariables(rawSelector, ctx.variables)) : '';
  const matchMode = (node.data.properties.matchMode as 'exact' | 'partial') || 'partial';
  const caseSensitive = Boolean(node.data.properties.caseSensitive);
  const timeout = Math.max(0, Number(node.data.properties.timeout) || 3000);
  const outputVariable = node.data.properties.outputVariable || 'containsText';

  ctx.log({
    level: 'info',
    message: `Checking if page contains text "${text}" (match: ${matchMode}, case: ${caseSensitive ? 'sensitive' : 'insensitive'}, timeout: ${timeout}ms${selector ? `, container: ${selector}` : ''})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'check_element_presence',
    {
      selector: selector || 'body',
      timeout,
      visibleOnly: false,
      text,
      matchMode,
      caseSensitive,
    },
    ctx,
    timeout + 1500
  );

  const present = res?.present === true;
  const branch = present ? 'true' : 'false';

  ctx.log({
    level: present ? 'success' : 'warn',
    message: present
      ? `Text "${text}" FOUND - taking TRUE branch`
      : `Text "${text}" NOT FOUND - taking FALSE branch`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: {
      present,
      text,
      matchMode,
      caseSensitive,
      branch,
      matchedText: res?.matchedText,
    },
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
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: { message: 'Capturing screenshot...' },
  });

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

    ctx.updateNodeState(node.id, {
      status: 'success',
      dynamicState: {
        message: 'Screenshot captured',
        previewUrl: res.dataUrl,
      },
    });

    return {
      success: true,
      output: res.dataUrl,
      variables: { [outputVariable]: res.dataUrl },
    };
  }

  const mockUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: { message: 'Screenshot captured', previewUrl: mockUrl },
  });
  return { success: true, output: mockUrl };
};

export const executeJavaScript: NodeExecutor = async (node, ctx) => {
  const rawCode = node.data.properties.code || 'return true;';
  const code = interpolateVariables(rawCode, ctx.variables);
  const outputVariable = node.data.properties.outputVariable || 'scriptResult';

  ctx.log({ level: 'info', message: 'Executing custom JavaScript in safe sandbox', nodeId: node.id, nodeName: node.data.label });

  const result = await runInSandbox(code, ctx.variables);

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
  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: { message: `${method} ${url.slice(0, 20)}...` },
  });

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

  ctx.updateNodeState(node.id, {
    status: response.ok ? 'success' : 'error',
    dynamicState: { message: `${response.status} ${response.statusText}` },
  });

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

export const executeCrawlPagination: NodeExecutor = async (node, ctx) => {
  const mode = node.data.properties.mode || 'auto_detect';
  const rawItemSelector = node.data.properties.itemSelector || node.data.properties.selector || '';
  const itemSelector = interpolateVariables(rawItemSelector, ctx.variables);
  const rawNextSelector = node.data.properties.nextButtonSelector || node.data.properties.nextSelector || '';
  const nextButtonSelector = rawNextSelector ? interpolateVariables(rawNextSelector, ctx.variables) : undefined;
  const rawAttr = node.data.properties.attribute || '';
  const attribute = rawAttr ? interpolateVariables(rawAttr, ctx.variables) : undefined;
  const maxPages = Math.min(Math.max(1, Number(node.data.properties.maxPages) || 5), 100);
  const pageDelay = Math.max(10, Number(node.data.properties.pageDelay ?? 1500));
  const stopOnNoNewItems = node.data.properties.stopOnNoNewItems !== false;
  const deduplicate = node.data.properties.deduplicate !== false;
  const outputVariable = node.data.properties.outputVariable || 'crawledDataset';
  const totalExtractedVariable = node.data.properties.totalExtractedVariable || 'totalCrawledItems';

  if (!itemSelector) {
    throw new Error('Auto-Crawler requires a repeating item selector (e.g. .product-item, .card, or list pattern).');
  }

  ctx.log({
    level: 'info',
    message: `Starting Auto-Crawler (${mode}, max ${maxPages} pages, selector: "${itemSelector}")`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Crawling page 1/${maxPages}...`,
      currentIteration: 1,
      totalIterations: maxPages,
      progress: 0,
    },
  });

  const aggregatedList: any[] = [];
  const seenKeys = new Set<string>();
  let consecutiveZeroNewCount = 0;
  let pagesCrawled = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (ctx.signal?.aborted) throw new Error('Auto-Crawler aborted by user.');
    pagesCrawled = page;

    ctx.updateNodeState(node.id, {
      status: 'running',
      dynamicState: {
        message: `Scraping page ${page}/${maxPages} (${aggregatedList.length} items)...`,
        currentIteration: page,
        totalIterations: maxPages,
        progress: Math.round(((page - 1) / maxPages) * 100),
      },
    });

    // 1. Extract items on current page
    let pageItems: any[] = [];
    try {
      const res = await sendDomAction(
        'extract_multiple',
        {
          selector: itemSelector,
          attribute,
          timeout: 8000,
        },
        ctx,
        9000
      );
      pageItems = Array.isArray(res?.items) ? res.items : [];
    } catch (extractErr: any) {
      ctx.log({
        level: 'warn',
        message: `Page ${page} item extraction warning: ${extractErr.message}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }

    // 2. Accumulate items with optional deduplication
    let newItemsThisPage = 0;
    for (const item of pageItems) {
      const key = typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item);
      if (deduplicate) {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          aggregatedList.push(item);
          newItemsThisPage++;
        }
      } else {
        aggregatedList.push(item);
        newItemsThisPage++;
      }
    }

    ctx.log({
      level: 'info',
      message: `Page ${page}/${maxPages}: Scraped ${pageItems.length} items (+${newItemsThisPage} new, total: ${aggregatedList.length})`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    // Check stop condition: no new items
    if (newItemsThisPage === 0 && page > 1 && stopOnNoNewItems) {
      consecutiveZeroNewCount++;
      if (consecutiveZeroNewCount >= 2) {
        ctx.log({
          level: 'info',
          message: `Auto-Crawler stopping: No new items found across 2 consecutive passes.`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        break;
      }
    } else {
      consecutiveZeroNewCount = 0;
    }

    // Stop if maxPages reached
    if (page >= maxPages) {
      break;
    }

    // 3. Move to next page (via scroll or button click)
    if (mode === 'infinite_scroll') {
      ctx.log({
        level: 'info',
        message: `Infinite scroll pass: scrolling down...`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
      await sendDomAction(
        'scroll',
        {
          direction: 'down',
          amount: 800,
          smooth: true,
        },
        ctx
      );
      await new Promise((r) => setTimeout(r, pageDelay));
    } else {
      // 'next_button' or 'auto_detect'
      ctx.log({
        level: 'info',
        message: `Navigating to next page (${nextButtonSelector || 'auto-detect'})...`,
        nodeId: node.id,
        nodeName: node.data.label,
      });

      let navResult: any;
      try {
        navResult = await sendDomAction(
          'find_and_click_next_page',
          {
            nextButtonSelector,
          },
          ctx,
          10000
        );
      } catch (err: any) {
        ctx.log({
          level: 'info',
          message: `Pagination navigation ended: ${err.message}`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        break;
      }

      if (navResult?.reachedEnd || !navResult?.clicked) {
        ctx.log({
          level: 'info',
          message: `Reached end of pagination: ${navResult?.reason || 'No further next button found'}`,
          nodeId: node.id,
          nodeName: node.data.label,
        });
        break;
      }

      // Wait for page transition / delay
      await new Promise((r) => setTimeout(r, pageDelay));
    }
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Crawled ${pagesCrawled} pages (${aggregatedList.length} items)`,
      progress: 100,
    },
  });

  ctx.log({
    level: 'success',
    message: `Auto-Crawler finished: aggregated ${aggregatedList.length} items across ${pagesCrawled} pages into {{${outputVariable}}}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.variables[outputVariable] = aggregatedList;
  ctx.variables[totalExtractedVariable] = aggregatedList.length;
  ctx.variables['crawlTotalCount'] = aggregatedList.length;
  ctx.variables['crawlPageCount'] = pagesCrawled;
  ctx.variables['totalPagesCrawled'] = pagesCrawled;

  const output = Object.assign([...aggregatedList], {
    items: aggregatedList,
    pageCount: pagesCrawled,
    totalCount: aggregatedList.length,
  });

  return {
    success: true,
    output,
    items: aggregatedList,
    variables: {
      [outputVariable]: aggregatedList,
      [totalExtractedVariable]: aggregatedList.length,
      crawlTotalCount: aggregatedList.length,
      crawlPageCount: pagesCrawled,
      totalPagesCrawled: pagesCrawled,
    },
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

export const executeExtractImage: NodeExecutor = async (node, ctx) => {
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : 'img';
  const mode = node.data.properties.mode || 'single';
  const asBase64 = !!node.data.properties.asBase64;
  const includeBackground = node.data.properties.includeBackground !== false;
  const outputVariable = node.data.properties.outputVariable || 'extractedImage';
  const timeout = Number(node.data.properties.timeout) || 10000;

  ctx.log({ level: 'info', message: `Extracting image(s) from ${selector || 'page'}`, nodeId: node.id, nodeName: node.data.label });
  const res = await sendDomAction('extract_image', { selector, mode, asBase64, includeBackground, timeout }, ctx, timeout);

  const mainValue = mode === 'multiple' ? (res?.items || []) : (res?.dataUrl || res?.url || '');

  ctx.log({
    level: 'success',
    message: mode === 'multiple'
      ? `Extracted ${res?.items?.length || 0} images`
      : `Extracted image: ${res?.url ? res.url.slice(0, 50) : (res?.dataUrl ? 'base64 data' : 'none')}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: mainValue,
    variables: {
      [outputVariable]: mainValue,
      [`${outputVariable}_details`]: res,
    },
  };
};

export const executeExtractAllImages: NodeExecutor = async (node, ctx) => {
  const containerSelector = node.data.properties.containerSelector
    ? interpolateVariables(node.data.properties.containerSelector, ctx.variables)
    : undefined;
  const includeBackground = node.data.properties.includeBackground !== false;
  const asBase64 = !!node.data.properties.asBase64;
  const minWidth = Number(node.data.properties.minWidth) || 10;
  const minHeight = Number(node.data.properties.minHeight) || 10;
  const maxImages = Number(node.data.properties.maxImages) || 100;
  const outputVariable = node.data.properties.outputVariable || 'allImages';
  const timeout = Number(node.data.properties.timeout) || 10000;

  ctx.log({
    level: 'info',
    message: `Finding all images on page${containerSelector ? ` in ${containerSelector}` : ''}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const res = await sendDomAction(
    'extract_all_images',
    {
      containerSelector,
      includeBackground,
      asBase64,
      minWidth,
      minHeight,
      maxImages,
      timeout,
    },
    ctx,
    timeout
  );

  const items = res?.items || [];
  const urls = res?.urls || items.map((i: any) => i.url || i);

  ctx.log({
    level: 'success',
    message: `Found ${items.length} images on page`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: items,
    items,
    variables: {
      [outputVariable]: items,
      [`${outputVariable}_urls`]: urls,
      [`${outputVariable}_count`]: items.length,
    },
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
  const outputFormat = (node.data.properties.outputFormat || (jsonMode ? 'json' : 'text')) as AiAgentOutputFormat;
  const autoDownload = !!node.data.properties.autoDownload;
  const rawDownloadFilename = node.data.properties.downloadFilename || `${outputVariable}_output`;
  const downloadFilename = interpolateVariables(rawDownloadFilename, ctx.variables);

  const customModel = node.data.properties.model;
  const customProvider = node.data.properties.provider;
  const customOpenaiBaseUrl = node.data.properties.openaiBaseUrl;

  let responseText = '';
  try {
    responseText = await queryLlm(prompt, systemInstruction, {
      ...(customModel ? { model: customModel } : {}),
      ...(customProvider ? { provider: customProvider } : {}),
      ...(customOpenaiBaseUrl ? { openaiBaseUrl: customOpenaiBaseUrl } : {}),
    });
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    ctx.log({
      level: 'error',
      message: `AI Agent "${node.data.label}" failed: ${errorMsg}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });
    throw new Error(`AI Agent (${node.data.label}): ${errorMsg}`);
  }

  const docResult = formatAiAgentDocument(responseText, outputFormat, downloadFilename);
  const output = docResult.parsedOutput;

  if (autoDownload && docResult.dataUrl) {
    try {
      if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
        await new Promise<number | undefined>((resolve, reject) => {
          chrome.downloads.download(
            {
              url: docResult.dataUrl,
              filename: docResult.defaultFilename,
              saveAs: false,
            },
            (downloadId) => {
              if (chrome.runtime?.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(downloadId);
              }
            }
          );
        });
      } else if (typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = docResult.dataUrl;
        a.download = docResult.defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      ctx.log({
        level: 'warn',
        message: `Auto-download failed: ${err.message}`,
        nodeId: node.id,
        nodeName: node.data.label,
      });
    }
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `${outputFormat.toUpperCase()}${autoDownload ? ' (saved)' : ''}`,
    },
  });

  ctx.log({
    level: 'success',
    message: `AI Agent finished analysis (${outputFormat.toUpperCase()})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output,
    variables: {
      [outputVariable]: output,
      [`${outputVariable}_dataUrl`]: docResult.dataUrl,
      [`${outputVariable}_content`]: docResult.formattedContent,
      [`${outputVariable}_filename`]: docResult.defaultFilename,
    },
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

// ----------------- MESSAGING & NOTIFICATION EXECUTORS -----------------

// ----------------- MESSAGING & NOTIFICATION EXECUTORS -----------------

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

export const executeTelegramMessage: NodeExecutor = async (node, ctx) => {
  const credentialId = node.data.properties.credentialId;
  const savedCred = credentialId ? await getCredentialById(credentialId) : undefined;

  const rawBotToken = node.data.properties.botToken || savedCred?.botToken || '';
  const rawChatId = node.data.properties.chatId || savedCred?.defaultChatId || '';
  const messageType = node.data.properties.messageType || 'text'; // 'text' | 'photo' | 'document'
  const rawMessage = node.data.properties.message || '';
  const rawCaption = node.data.properties.caption || '';
  const rawImageUrl = node.data.properties.imageUrl || '';
  const parseMode = node.data.properties.parseMode || 'HTML';
  const silent = !!node.data.properties.silent;
  const protectContent = !!node.data.properties.protectContent;
  const outputVariable = node.data.properties.outputVariable || 'telegramResponse';

  const botToken = String(interpolateVariables(rawBotToken, ctx.variables)).trim();
  const chatId = String(interpolateVariables(rawChatId, ctx.variables)).trim();
  const message = String(interpolateVariables(rawMessage, ctx.variables));
  const caption = String(interpolateVariables(rawCaption, ctx.variables));
  const imageUrl = rawImageUrl ? String(interpolateVariables(rawImageUrl, ctx.variables)).trim() : '';

  if (!botToken) {
    throw new Error('Telegram Bot Token is required. Select a saved account or provide a token.');
  }
  if (!chatId) {
    throw new Error('Telegram Chat ID is required. Use your chat ID or @channel.');
  }

  const isPhoto = messageType === 'photo' || (!!imageUrl && messageType !== 'document');
  const isDocument = messageType === 'document';

  let endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
  let fetchOptions: RequestInit = { method: 'POST', signal: ctx.signal };

  const captionText = caption || message || '';

  if (isPhoto && imageUrl) {
    endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    if (imageUrl.startsWith('data:')) {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = dataUrlToBlob(imageUrl);
      formData.append('photo', blob, 'screenshot.png');
      if (captionText) formData.append('caption', captionText);
      if (parseMode && parseMode !== 'None') formData.append('parse_mode', parseMode);
      if (silent) formData.append('disable_notification', 'true');
      if (protectContent) formData.append('protect_content', 'true');
      fetchOptions.body = formData;
    } else {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify({
        chat_id: chatId,
        photo: imageUrl,
        ...(captionText ? { caption: captionText } : {}),
        ...(parseMode && parseMode !== 'None' ? { parse_mode: parseMode } : {}),
        ...(silent ? { disable_notification: true } : {}),
        ...(protectContent ? { protect_content: true } : {}),
      });
    }
  } else if (isDocument && imageUrl) {
    endpoint = `https://api.telegram.org/bot${botToken}/sendDocument`;
    if (imageUrl.startsWith('data:')) {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = dataUrlToBlob(imageUrl);
      formData.append('document', blob, 'document.png');
      if (captionText) formData.append('caption', captionText);
      if (parseMode && parseMode !== 'None') formData.append('parse_mode', parseMode);
      if (silent) formData.append('disable_notification', 'true');
      fetchOptions.body = formData;
    } else {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify({
        chat_id: chatId,
        document: imageUrl,
        ...(captionText ? { caption: captionText } : {}),
        ...(parseMode && parseMode !== 'None' ? { parse_mode: parseMode } : {}),
        ...(silent ? { disable_notification: true } : {}),
      });
    }
  } else {
    if (!message) {
      throw new Error('Telegram message text cannot be empty.');
    }
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify({
      chat_id: chatId,
      text: message,
      ...(parseMode && parseMode !== 'None' ? { parse_mode: parseMode } : {}),
      ...(silent ? { disable_notification: true } : {}),
      ...(protectContent ? { protect_content: true } : {}),
    });
  }

  ctx.log({
    level: 'info',
    message: `Sending Telegram ${isPhoto ? 'photo' : isDocument ? 'document' : 'message'} to ${chatId}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const response = await fetch(endpoint, fetchOptions);
  const contentType = response.headers.get('content-type') || '';
  const resData = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok || (typeof resData === 'object' && resData.ok === false)) {
    const errMsg =
      (typeof resData === 'object' && resData.description) ||
      response.statusText ||
      'Telegram message dispatch failed';
    throw new Error(`Telegram error (${response.status}): ${errMsg}`);
  }

  ctx.log({
    level: 'success',
    message: `Telegram ${isPhoto ? 'photo' : 'message'} delivered successfully to ${chatId}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: resData,
    variables: { [outputVariable]: resData },
  };
};

export const executeDiscordMessage: NodeExecutor = async (node, ctx) => {
  const credentialId = node.data.properties.credentialId;
  const savedCred = credentialId ? await getCredentialById(credentialId) : undefined;

  const mode = node.data.properties.mode || savedCred?.mode || 'webhook';
  const rawWebhookUrl = node.data.properties.webhookUrl || savedCred?.webhookUrl || '';
  const rawBotToken = node.data.properties.botToken || savedCred?.botToken || '';
  const rawChannelId = node.data.properties.channelId || savedCred?.channelId || '';
  const rawContent = node.data.properties.content || '';
  const rawUsername = node.data.properties.username || savedCred?.username || '';
  const rawAvatarUrl = node.data.properties.avatarUrl || savedCred?.avatarUrl || '';
  const rawImageUrl = node.data.properties.imageUrl || '';
  const rawEmbedTitle = node.data.properties.embedTitle || '';
  const rawEmbedDescription = node.data.properties.embedDescription || '';
  const rawEmbedFooter = node.data.properties.embedFooter || node.data.properties.footerText || '';
  const rawEmbedThumbnail = node.data.properties.embedThumbnail || node.data.properties.thumbnailUrl || '';
  const embedColor = node.data.properties.embedColor || '#5865F2';
  const rawFields = node.data.properties.embedFields || [];
  const outputVariable = node.data.properties.outputVariable || 'discordResponse';

  const webhookUrl = String(interpolateVariables(rawWebhookUrl, ctx.variables)).trim();
  const botToken = String(interpolateVariables(rawBotToken, ctx.variables)).trim();
  const channelId = String(interpolateVariables(rawChannelId, ctx.variables)).trim();
  const content = rawContent ? String(interpolateVariables(rawContent, ctx.variables)) : '';
  const username = rawUsername ? String(interpolateVariables(rawUsername, ctx.variables)).trim() : undefined;
  const avatarUrl = rawAvatarUrl ? String(interpolateVariables(rawAvatarUrl, ctx.variables)).trim() : undefined;
  const imageUrl = rawImageUrl ? String(interpolateVariables(rawImageUrl, ctx.variables)).trim() : '';
  const embedTitle = rawEmbedTitle ? String(interpolateVariables(rawEmbedTitle, ctx.variables)) : '';
  const embedDescription = rawEmbedDescription ? String(interpolateVariables(rawEmbedDescription, ctx.variables)) : '';
  const embedFooter = rawEmbedFooter ? String(interpolateVariables(rawEmbedFooter, ctx.variables)) : '';
  const embedThumbnail = rawEmbedThumbnail ? String(interpolateVariables(rawEmbedThumbnail, ctx.variables)) : '';

  if (!content && !embedTitle && !embedDescription && !imageUrl) {
    throw new Error('Discord message must include at least message content, an embed, or an image.');
  }

  let targetUrl = '';
  let authHeaders: Record<string, string> = {};

  if (mode === 'webhook') {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      throw new Error('Discord Webhook URL is required in webhook mode (e.g. https://discord.com/api/webhooks/...).');
    }
    targetUrl = webhookUrl;
  } else {
    if (!botToken) {
      throw new Error('Discord Bot Token is required in Bot mode.');
    }
    if (!channelId) {
      throw new Error('Discord Channel ID is required in Bot mode.');
    }
    targetUrl = `https://discord.com/api/v10/channels/${channelId}/messages`;
    authHeaders['Authorization'] = `Bot ${botToken}`;
  }

  let colorNum = 0x5865f2;
  if (embedColor) {
    const hex = embedColor.replace('#', '');
    const parsed = parseInt(hex, 16);
    if (!isNaN(parsed)) colorNum = parsed;
  }

  const fields = Array.isArray(rawFields)
    ? rawFields
        .filter((f) => f && f.name && f.value)
        .map((f) => ({
          name: String(interpolateVariables(f.name, ctx.variables)),
          value: String(interpolateVariables(f.value, ctx.variables)),
          inline: f.inline !== false,
        }))
    : [];

  const hasEmbed = !!(embedTitle || embedDescription || embedFooter || embedThumbnail || fields.length > 0 || (imageUrl && !imageUrl.startsWith('data:')));

  let fetchOptions: RequestInit = { method: 'POST', signal: ctx.signal };

  if (imageUrl && imageUrl.startsWith('data:')) {
    const formData = new FormData();
    const blob = dataUrlToBlob(imageUrl);
    formData.append('files[0]', blob, 'screenshot.png');

    const payloadJson: Record<string, any> = {};
    if (content) payloadJson.content = content;
    if (mode === 'webhook') {
      if (username) payloadJson.username = username;
      if (avatarUrl) payloadJson.avatar_url = avatarUrl;
    }

    const embedObj: Record<string, any> = {
      color: colorNum,
      image: { url: 'attachment://screenshot.png' },
      timestamp: new Date().toISOString(),
      ...(embedTitle ? { title: embedTitle } : {}),
      ...(embedDescription ? { description: embedDescription } : {}),
      ...(embedFooter ? { footer: { text: embedFooter } } : {}),
      ...(embedThumbnail ? { thumbnail: { url: embedThumbnail } } : {}),
      ...(fields.length > 0 ? { fields } : {}),
    };
    payloadJson.embeds = [embedObj];

    formData.append('payload_json', JSON.stringify(payloadJson));
    fetchOptions.headers = authHeaders;
    fetchOptions.body = formData;
  } else {
    const payload: Record<string, any> = {};
    if (content) payload.content = content;
    if (mode === 'webhook') {
      if (username) payload.username = username;
      if (avatarUrl) payload.avatar_url = avatarUrl;
    }

    if (hasEmbed) {
      payload.embeds = [
        {
          color: colorNum,
          timestamp: new Date().toISOString(),
          ...(embedTitle ? { title: embedTitle } : {}),
          ...(embedDescription ? { description: embedDescription } : {}),
          ...(imageUrl ? { image: { url: imageUrl } } : {}),
          ...(embedFooter ? { footer: { text: embedFooter } } : {}),
          ...(embedThumbnail ? { thumbnail: { url: embedThumbnail } } : {}),
          ...(fields.length > 0 ? { fields } : {}),
        },
      ];
    }

    fetchOptions.headers = { ...authHeaders, 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(payload);
  }

  ctx.log({
    level: 'info',
    message: `Sending Discord ${imageUrl ? 'image/screenshot' : 'message'} (${mode === 'webhook' ? 'Webhook' : `Channel #${channelId}`})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const response = await fetch(targetUrl, fetchOptions);

  let resData: any = { ok: true, status: response.status };
  if (response.status !== 204) {
    const contentType = response.headers.get('content-type') || '';
    resData = contentType.includes('application/json') ? await response.json() : await response.text();
  }

  if (!response.ok) {
    const errMsg =
      typeof resData === 'object' && resData.message
        ? resData.message
        : response.statusText || 'Discord notification failed';
    throw new Error(`Discord error (${response.status}): ${errMsg}`);
  }

  ctx.log({
    level: 'success',
    message: 'Discord message delivered successfully',
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: resData,
    variables: { [outputVariable]: resData },
  };
};

export const executeSlackMessage: NodeExecutor = async (node, ctx) => {
  const credentialId = node.data.properties.credentialId;
  const savedCred = credentialId ? await getCredentialById(credentialId) : undefined;

  const mode = node.data.properties.mode || savedCred?.mode || 'webhook';
  const rawWebhookUrl = node.data.properties.webhookUrl || savedCred?.webhookUrl || '';
  const rawBotToken = node.data.properties.botToken || savedCred?.botToken || '';
  const rawChannel = node.data.properties.channel || savedCred?.channel || '';
  const rawText = node.data.properties.text || '';
  const rawHeaderText = node.data.properties.headerText || '';
  const rawImageUrl = node.data.properties.imageUrl || '';
  const rawImageAlt = node.data.properties.imageAltText || node.data.properties.imageAlt || 'AutoFlow Image';
  const rawFooterText = node.data.properties.footerText || '';
  const rawFields = node.data.properties.fields || [];
  const rawUsername = node.data.properties.username || savedCred?.username || '';
  const iconEmoji = node.data.properties.iconEmoji || savedCred?.iconEmoji || '';
  const outputVariable = node.data.properties.outputVariable || 'slackResponse';

  const webhookUrl = String(interpolateVariables(rawWebhookUrl, ctx.variables)).trim();
  const botToken = String(interpolateVariables(rawBotToken, ctx.variables)).trim();
  const channel = rawChannel ? String(interpolateVariables(rawChannel, ctx.variables)).trim() : undefined;
  const text = String(interpolateVariables(rawText, ctx.variables));
  const headerText = rawHeaderText ? String(interpolateVariables(rawHeaderText, ctx.variables)) : '';
  const imageUrl = rawImageUrl ? String(interpolateVariables(rawImageUrl, ctx.variables)).trim() : '';
  const imageAlt = String(interpolateVariables(rawImageAlt, ctx.variables));
  const footerText = rawFooterText ? String(interpolateVariables(rawFooterText, ctx.variables)) : '';
  const username = rawUsername ? String(interpolateVariables(rawUsername, ctx.variables)).trim() : undefined;

  if (!text && !headerText && !imageUrl) {
    throw new Error('Slack message text or image is required.');
  }

  // Uploading base64 image/screenshot with Slack Bot token
  if (imageUrl && imageUrl.startsWith('data:') && mode === 'bot' && botToken && channel) {
    ctx.log({
      level: 'info',
      message: `Uploading screenshot image to Slack channel ${channel}`,
      nodeId: node.id,
      nodeName: node.data.label,
    });

    const formData = new FormData();
    const blob = dataUrlToBlob(imageUrl);
    formData.append('file', blob, 'screenshot.png');
    formData.append('channels', channel);
    formData.append('filename', 'screenshot.png');
    formData.append('title', headerText || 'AutoFlow Screenshot');
    if (text) formData.append('initial_comment', text);

    const uploadRes = await fetch('https://slack.com/api/files.upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}` },
      body: formData,
      signal: ctx.signal,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.ok) {
      throw new Error(`Slack file upload error: ${uploadData.error || uploadRes.statusText}`);
    }

    ctx.log({
      level: 'success',
      message: 'Slack screenshot uploaded successfully',
      nodeId: node.id,
      nodeName: node.data.label,
    });

    return {
      success: true,
      output: uploadData,
      variables: { [outputVariable]: uploadData },
    };
  }

  let targetUrl = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (mode === 'webhook') {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      throw new Error('Slack Webhook URL is required in webhook mode (e.g. https://hooks.slack.com/services/...).');
    }
    targetUrl = webhookUrl;
  } else {
    if (!botToken) {
      throw new Error('Slack Bot Token is required in Bot mode (e.g. xoxb-...).');
    }
    if (!channel) {
      throw new Error('Slack channel is required in Bot mode (e.g. #general or C1234567890).');
    }
    targetUrl = 'https://slack.com/api/chat.postMessage';
    headers['Authorization'] = `Bearer ${botToken}`;
  }

  const payload: Record<string, any> = {
    text: text || headerText || 'AutoFlow Notification',
  };
  if (channel) payload.channel = channel;
  if (username) payload.username = username;
  if (iconEmoji) payload.icon_emoji = iconEmoji;

  // Build Block Kit blocks for rich layouts
  const blocks: any[] = [];

  if (headerText) {
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: headerText.slice(0, 150), emoji: true },
    });
  }

  if (text) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text },
    });
  }

  // Image block (for web URLs)
  if (imageUrl && !imageUrl.startsWith('data:')) {
    blocks.push({
      type: 'image',
      image_url: imageUrl,
      alt_text: imageAlt || 'Image preview',
      title: { type: 'plain_text', text: imageAlt.slice(0, 100) },
    });
  }

  // Key-value fields
  const fieldList = Array.isArray(rawFields) ? rawFields.filter((f) => f && (f.label || f.name)) : [];
  if (fieldList.length > 0) {
    const formattedFields = fieldList.slice(0, 10).map((f) => {
      const label = String(interpolateVariables(f.label || f.name || '', ctx.variables));
      const val = String(interpolateVariables(f.value || '', ctx.variables));
      return { type: 'mrkdwn', text: `*${label}:*\n${val}` };
    });
    blocks.push({
      type: 'section',
      fields: formattedFields,
    });
  }

  if (footerText) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: footerText }],
    });
  }

  if (blocks.length > 0) {
    payload.blocks = blocks;
  }

  ctx.log({
    level: 'info',
    message: `Sending Slack notification (${mode === 'webhook' ? 'Webhook' : `Channel ${channel}`})`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: ctx.signal,
  });

  const contentType = response.headers.get('content-type') || '';
  let resData: any;
  if (contentType.includes('application/json')) {
    resData = await response.json();
  } else {
    const textResp = await response.text();
    resData = { ok: response.ok && (textResp === 'ok' || textResp.includes('"ok":true')), response: textResp };
  }

  if (!response.ok || (typeof resData === 'object' && resData.ok === false)) {
    const errMsg =
      (typeof resData === 'object' && (resData.error || resData.response)) ||
      response.statusText ||
      'Slack message dispatch failed';
    throw new Error(`Slack error (${response.status}): ${errMsg}`);
  }

  ctx.log({
    level: 'success',
    message: 'Slack message sent successfully',
    nodeId: node.id,
    nodeName: node.data.label,
  });

  return {
    success: true,
    output: resData,
    variables: { [outputVariable]: resData },
  };
};

// ----------------- NEW DYNAMIC EXECUTORS -----------------

export const executeSmartScroll: NodeExecutor = async (node, ctx) => {
  const mode = node.data.properties.mode || 'to_bottom';
  const selector = node.data.properties.selector ? interpolateVariables(node.data.properties.selector, ctx.variables) : undefined;
  const maxScrolls = Math.min(Number(node.data.properties.maxScrolls) || 5, 50);
  const distance = Number(node.data.properties.distance) || 600;
  const scrollDelay = Number(node.data.properties.scrollDelay) || 800;
  const outputVariable = node.data.properties.outputVariable || 'scrollResult';

  ctx.log({
    level: 'info',
    message: `Starting Smart Scroll (${mode}, max ${maxScrolls} passes)`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Scrolling (${mode})...`,
      currentIteration: 0,
      totalIterations: maxScrolls,
      progress: 0,
    },
  });

  let totalScrolls = 0;
  for (let pass = 1; pass <= maxScrolls; pass++) {
    if (ctx.signal?.aborted) throw new Error('Smart Scroll aborted by user.');

    ctx.updateNodeState(node.id, {
      status: 'running',
      dynamicState: {
        message: `Scroll pass ${pass}/${maxScrolls}`,
        currentIteration: pass,
        totalIterations: maxScrolls,
        progress: Math.round((pass / maxScrolls) * 100),
      },
    });

    await sendDomAction(
      'scroll',
      {
        direction: 'down',
        amount: distance,
        selector,
        smooth: true,
      },
      ctx
    );

    totalScrolls++;

    if (pass < maxScrolls) {
      await new Promise((r) => setTimeout(r, scrollDelay));
    }
  }

  const result = { totalScrolls, mode, maxScrolls };

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Finished ${totalScrolls} passes`,
      progress: 100,
    },
  });

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeMathCalculate: NodeExecutor = async (node, ctx) => {
  const operation = node.data.properties.operation || 'add';
  const outputVariable = node.data.properties.outputVariable || 'counter';
  const leftRaw = interpolateVariables(node.data.properties.leftOperand ?? '0', ctx.variables);
  const rightRaw = interpolateVariables(node.data.properties.rightOperand ?? '1', ctx.variables);

  let result = 0;
  const left = Number(leftRaw) || 0;
  const right = Number(rightRaw) || 0;

  switch (operation) {
    case 'add':
    case 'increment':
      result = left + right;
      break;
    case 'subtract':
    case 'decrement':
      result = left - right;
      break;
    case 'multiply':
      result = left * right;
      break;
    case 'divide':
      result = right !== 0 ? left / right : 0;
      break;
    case 'formula': {
      const formulaRaw = String(node.data.properties.formula || '');
      const formula = interpolateVariables(formulaRaw, ctx.variables);
      try {
        result = safeEvaluateMath(formula, ctx.variables);
      } catch (e) {
        result = 0;
      }
      break;
    }
    default:
      result = left + right;
  }

  ctx.log({
    level: 'info',
    message: `Math Calculate: ${outputVariable} = ${result}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `${outputVariable} = ${result}`,
      detail: `${left} ${operation} ${right} = ${result}`,
    },
  });

  return {
    success: true,
    output: result,
    variables: { [outputVariable]: result },
  };
};

export const executeDownloadFile: NodeExecutor = async (node, ctx) => {
  const sourceType = node.data.properties.sourceType || 'variable';
  const rawUrl = node.data.properties.url || '';
  const rawContent = node.data.properties.content || '';
  const rawFilename = node.data.properties.filename || 'download.txt';
  const saveAs = !!node.data.properties.saveAs;
  const outputVariable = node.data.properties.outputVariable || 'downloadResult';

  const filename = String(interpolateVariables(rawFilename, ctx.variables));
  let downloadUrl = String(interpolateVariables(rawUrl, ctx.variables));

  if (sourceType === 'content' || (!downloadUrl && rawContent)) {
    const content = String(interpolateVariables(rawContent, ctx.variables));
    downloadUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
  }

  ctx.log({
    level: 'info',
    message: `Downloading file: ${filename}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: `Downloading ${filename}...`,
      progress: 50,
    },
  });

  let downloadId: any = 1;
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    try {
      downloadId = await chrome.downloads.download({
        url: downloadUrl,
        filename,
        saveAs,
      });
    } catch (e: any) {
      downloadId = 'download_fallback';
    }
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Saved: ${filename}`,
      progress: 100,
    },
  });

  return {
    success: true,
    output: { filename, downloadId },
    variables: { [outputVariable]: { filename, downloadId } },
  };
};

export const executeShowNotification: NodeExecutor = async (node, ctx) => {
  const rawTitle = node.data.properties.title || 'AutoFlow Alert';
  const rawMsg = node.data.properties.message || 'Workflow finished!';
  const title = String(interpolateVariables(rawTitle, ctx.variables));
  const message = String(interpolateVariables(rawMsg, ctx.variables));
  const outputVariable = node.data.properties.outputVariable || 'notificationResult';

  ctx.log({
    level: 'info',
    message: `Showing notification: ${title} - ${message}`,
    nodeId: node.id,
    nodeName: node.data.label,
  });

  ctx.updateNodeState(node.id, {
    status: 'running',
    dynamicState: {
      message: 'Displaying alert...',
    },
  });

  const notificationId = `notif_${Date.now()}`;
  if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create) {
    try {
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: node.data.properties.iconUrl || 'icons/icon128.png',
        title,
        message,
        priority: 2,
      });
    } catch (e) {
      console.warn('Chrome notification warning:', e);
    }
  }

  ctx.updateNodeState(node.id, {
    status: 'success',
    dynamicState: {
      message: `Alerted: ${title.slice(0, 18)}`,
    },
  });

  return {
    success: true,
    output: { notificationId, title, message },
    variables: { [outputVariable]: { notificationId, title, message } },
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
  smart_scroll: executeSmartScroll,
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
  crawl_pagination: executeCrawlPagination,
  extract_links: executeExtractLinks,
  extract_image: executeExtractImage,
  extract_all_images: executeExtractAllImages,
  condition: executeCondition,
  contains: executeContains,
  contains_text: executeContainsText,
  and: executeLogicGate,
  or: executeLogicGate,
  nand: executeLogicGate,
  nor: executeLogicGate,
  logic_and: executeLogicGate,
  logic_or: executeLogicGate,
  logic_nand: executeLogicGate,
  logic_nor: executeLogicGate,
  logic_gate: executeLogicGate,
  break: executeBreak,
  continue: executeContinue,
  set_variable: executeSetVariable,
  get_variable: executeGetVariable,
  transform: executeTransform,
  regex: executeRegex,
  json_parse: executeJsonParse,
  generate_data: executeGenerateData,
  math_calculate: executeMathCalculate,
  screenshot: executeScreenshot,
  execute_javascript: executeJavaScript,
  http_request: executeHttpRequest,
  storage_manage: executeStorageManage,
  clipboard: executeClipboard,
  download_file: executeDownloadFile,
  show_notification: executeShowNotification,
  ai_agent: executeAiAgent,
  autonomous_agent: executeAutonomousAgent,
  telegram_message: executeTelegramMessage,
  discord_message: executeDiscordMessage,
  slack_message: executeSlackMessage,
};



