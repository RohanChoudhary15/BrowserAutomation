import {
  AgentAction,
  AgentStep,
  InteractiveElement,
  VisionLlmParams,
  AiConfig,
  HumanGuidanceRequest,
} from './types';
import { queryVisionLlm, getAiConfig, VALID_FALLBACK_IMAGE } from './aiService';
import { WorkflowNode, WorkflowEdge } from '../types/workflow';
import { generateId } from '../utils/id';

/**
 * Controller allowing humans to pause, resume, and inject guidance into running browser agent
 */
export class AgentPauseController {
  private _isPaused = false;
  private _resumeResolver: ((guidance?: string) => void) | null = null;

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public pause(): void {
    this._isPaused = true;
  }

  public resume(guidance?: string): void {
    this._isPaused = false;
    if (this._resumeResolver) {
      const resolver = this._resumeResolver;
      this._resumeResolver = null;
      resolver(guidance);
    }
  }

  /**
   * If paused, halts execution until resumed. Returns any human guidance provided on resume.
   */
  public async waitIfPaused(signal?: AbortSignal): Promise<string | null> {
    if (!this._isPaused) return null;

    return new Promise((resolve) => {
      const onAbort = () => {
        this._isPaused = false;
        this._resumeResolver = null;
        resolve(null);
      };

      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });

      this._resumeResolver = (guidance?: string) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(guidance || null);
      };
    });
  }
}

export interface BrowserAgentOptions {
  goal: string;
  maxSteps?: number;
  tabId?: number;
  config?: Partial<AiConfig>;
  stepDelay?: number;
  pauseController?: AgentPauseController;
  onStep?: (step: AgentStep) => void;
  onStatusUpdate?: (status: string) => void;
  onScreenshot?: (dataUrl: string) => void;
  onRequestHumanGuidance?: (request: HumanGuidanceRequest) => Promise<string>;
  signal?: AbortSignal;
}

const AGENT_SYSTEM_PROMPT = `You are AutoFlow Autonomous Browser Agent, an expert vision-driven browser automation assistant.
You inspect the live browser webpage through the provided high-resolution screenshot and indexed list of visible interactive elements.
Your mission is to accomplish the user's goal step-by-step with precision.

RESPONSE FORMAT:
You MUST respond with a single valid JSON object strictly matching this schema:
{
  "thought": "Your visual observation of the screenshot and plan for this immediate step",
  "action": {
    "type": "click" | "type" | "press_key" | "shortcut" | "copy_to_clipboard" | "paste" | "navigate" | "scroll" | "wait" | "hover" | "extract" | "ask_human" | "done",
    "elementIndex": 1,
    "selector": "button.submit",
    "coordinates": { "x": 100, "y": 200 },
    "text": "search query",
    "pressEnter": true,
    "clearFirst": true,
    "key": "Enter",
    "shortcut": "ctrl+v",
    "clipboardText": "text to copy to clipboard",
    "url": "https://...",
    "direction": "down",
    "amount": 400,
    "durationMs": 3500,
    "waitForSelector": ".search-results",
    "waitForText": "Results",
    "waitForNavigation": true,
    "waitReason": "Waiting for search results to load",
    "variableName": "result",
    "extractedValue": "...",
    "answer": "Completed task description",
    "question": "Clarification or command request for the human",
    "reason": "Reason why human input is needed (e.g. CAPTCHA, 2FA, ambiguous choices)",
    "suggestedOptions": ["Option A", "Option B"]
  },
  "isComplete": false
}

CRITICAL RULES:
1. Examine the screenshot and the list of interactive elements. Use "elementIndex" whenever an interactive element matches your target.
2. If you want to click something visible on the screenshot that is not in the list, provide "coordinates": { "x": number, "y": number } from the viewport.
3. When typing, specify "elementIndex" of the target input/textarea field. Set "clearFirst": true (default) to replace existing content. For search fields, set "pressEnter": true to submit. For multi-field forms (e.g. username/password, address), only set pressEnter on the final submit or click the submit button.
4. APPROPRIATE WAITING & CONDITIONS (NEVER POLL EVERY 1 SECOND IN A LOOP):
   - DO NOT repeatedly output "wait 1000ms" to check if something loaded.
   - Choose an APPROPRIATE timer based on the expected real-world operation:
     * Quick animations, dropdowns, modal transitions: 1000 - 1500ms
     * Search queries, client filtering, tab switches: 3000 - 5000ms
     * Page navigation, redirects, form/login submissions: 4000 - 6000ms
     * Heavy processing, reports, file downloads/exports, AI generation: 8000 - 15000ms
   - Prefer CONDITIONAL waiting over blind sleeping whenever possible:
     * Set "waitForSelector" to the CSS selector of the element you expect to appear (e.g. ".results-container", "[data-testid='results-list']").
     * Set "waitForText" to the text that should appear when loading finishes (e.g. "Order Confirmed", "Results").
     * Set "waitForNavigation": true if a page redirect or navigation is occurring.
     * When conditional waiting is used, the agent automatically continues the exact instant the element appears without waiting the entire timeout!
5. CLIPBOARD & SHORTCUTS:
   - To copy text to the clipboard, use "action": { "type": "copy_to_clipboard", "clipboardText": "value" }.
   - To paste into an input or field, use "action": { "type": "paste", "elementIndex": 1 } or "shortcut": "ctrl+v".
   - To trigger keyboard shortcuts, use "action": { "type": "shortcut", "shortcut": "ctrl+v" | "ctrl+c" | "ctrl+a" | "enter" | "escape" }.
6. If a page needs scrolling to reveal more content or search results, use "action": { "type": "scroll", "direction": "down", "amount": 500 }.
7. Observe the visual changes from prior steps to confirm if a modal appeared, a dropdown opened, or a page loaded.
8. When the goal is completed, return "type": "done", "isComplete": true, and provide the final answer in "answer".
9. HUMAN-IN-THE-LOOP (ASKING FOR COMMANDS/ASSISTANCE):
   - If you encounter a CAPTCHA, Cloudflare verification, 2FA/SMS code prompt, login credentials gate, unexpected blocker, or are unsure which option the user intends, do NOT guess blindly or loop repeatedly.
   - Output "type": "ask_human", "question": "Clear question describing what you need the human to do or decide", "reason": "Why human input is needed", "suggestedOptions": ["Choice 1", "Choice 2"].
   - The user will be prompted immediately with your question, and their response will be provided to you in the next step to guide you!
10. Return ONLY the JSON object. Do not wrap in markdown or any text outside JSON.
11. For ChatGPT website to type always use #prompt-textarea as the selector for the input field. Also if asked to chat in temporary chat then first click using this selector button[aria-label="Temporary chat"] then have the conversation in #prompt-textarea. Also if you are struck and don't know what to do then ask chatgpt to help you.`;

/**
 * Captures screenshot of the target tab or active window
 */
export async function captureTabScreenshot(tabId?: number): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const res = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      payload: { tabId, format: 'jpeg', quality: 75 },
    });
    if (res && res.success && res.dataUrl) {
      return res.dataUrl;
    }
  }

  // Fallback compliant (>=10x10px) mock screenshot for tests or offline environments
  return VALID_FALLBACK_IMAGE;
}

/**
 * Retrieves indexed interactive elements from the content script
 */
export async function fetchInteractiveSnapshot(tabId?: number): Promise<InteractiveElement[]> {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'EXECUTE_DOM_ACTION',
        payload: {
          action: 'get_interactive_snapshot',
          params: {},
          tabId,
        },
      });
      if (res && res.success && Array.isArray(res.elements)) {
        return res.elements;
      }
    } catch (err) {
      console.warn('Could not fetch interactive snapshot from tab:', err);
    }
  }

  return [];
}

/**
 * Intelligently resolves an appropriate wait timer based on context and backoff
 */
export function resolveAppropriateWaitDuration(
  action: AgentAction,
  thought: string = '',
  consecutiveWaitCount: number = 0
): number {
  // If explicitly specified by model/user and >= 2000ms, honor it
  if (action.durationMs && action.durationMs >= 2000) {
    let dur = action.durationMs;
    if (consecutiveWaitCount > 1) {
      dur = Math.round(dur * Math.pow(1.3, consecutiveWaitCount - 1));
    }
    return Math.min(dur, 25000);
  }

  const combined = `${thought} ${action.waitReason || ''} ${action.waitForText || ''} ${action.selector || ''}`.toLowerCase();

  let baseDuration = 3000;

  if (
    combined.includes('download') ||
    combined.includes('export') ||
    combined.includes('generat') ||
    combined.includes('process') ||
    combined.includes('ai ') ||
    combined.includes('synthesiz')
  ) {
    baseDuration = 8000;
  } else if (
    combined.includes('search') ||
    combined.includes('query') ||
    combined.includes('filter') ||
    combined.includes('fetch') ||
    combined.includes('loading') ||
    combined.includes('results') ||
    combined.includes('table')
  ) {
    baseDuration = 3500;
  } else if (
    combined.includes('navigat') ||
    combined.includes('redirect') ||
    combined.includes('page load') ||
    combined.includes('login') ||
    combined.includes('auth') ||
    combined.includes('sign in') ||
    combined.includes('checkout') ||
    combined.includes('submit')
  ) {
    baseDuration = 5000;
  } else if (
    combined.includes('modal') ||
    combined.includes('popup') ||
    combined.includes('dropdown') ||
    combined.includes('animat') ||
    combined.includes('menu') ||
    combined.includes('drawer')
  ) {
    baseDuration = 1500;
  }

  // If this is a conditional wait (waitForSelector or waitForText), allow a longer ceiling timeout
  if (action.waitForSelector || action.waitForText || action.waitForNavigation) {
    baseDuration = Math.max(baseDuration, 6000);
  }

  // Apply exponential backoff for consecutive wait steps (e.g. 1.4x)
  if (consecutiveWaitCount > 1) {
    baseDuration = Math.round(baseDuration * Math.pow(1.4, Math.min(consecutiveWaitCount - 1, 4)));
  }

  return Math.min(baseDuration, 25000);
}

/**
 * Waits for active spinners, DOM mutations, or navigation to settle on the tab
 */
export async function smartSettleTab(tabId?: number, defaultDelay = 1500): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      await chrome.runtime.sendMessage({
        type: 'EXECUTE_DOM_ACTION',
        payload: {
          action: 'smart_wait',
          params: { timeout: Math.max(defaultDelay, 4000) },
          tabId,
        },
      });
      return;
    } catch {}
  }
  await new Promise(r => setTimeout(r, defaultDelay));
}

/**
 * Dispatches an agent action to the live browser tab
 */
export async function executeAgentAction(
  action: AgentAction,
  elements: InteractiveElement[],
  tabId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Resolve element if elementIndex was specified
    let targetSelector = action.selector;
    let targetCoords = action.coordinates;

    if (action.elementIndex && action.elementIndex > 0) {
      const matched = elements.find(el => el.index === action.elementIndex);
      if (matched) {
        targetSelector = matched.selector || targetSelector;
        targetCoords = targetCoords || { x: matched.rect.x, y: matched.rect.y };
      }
    } else if (targetSelector) {
      const matched = elements.find(el => el.selector === targetSelector || el.selector?.toLowerCase() === targetSelector?.toLowerCase());
      if (matched) {
        targetCoords = targetCoords || { x: matched.rect.x, y: matched.rect.y };
      }
    }

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Mock environment execution
      return { success: true };
    }

    switch (action.type) {
      case 'click': {
        let clickSuccess = false;
        let lastErr: any = null;

        if (targetSelector) {
          try {
            const res = await chrome.runtime.sendMessage({
              type: 'EXECUTE_DOM_ACTION',
              payload: {
                action: 'click',
                params: { selector: targetSelector, clickType: action.clickType || 'left' },
                tabId,
              },
            });
            if (res && res.success) {
              clickSuccess = true;
            } else {
              lastErr = new Error(res?.error || 'Click failed');
            }
          } catch (err: any) {
            lastErr = err;
          }
        }

        // Fallback: If selector click failed and target coordinates exist, try coordinate click
        if (!clickSuccess && targetCoords) {
          try {
            const coordRes = await chrome.runtime.sendMessage({
              type: 'EXECUTE_DOM_ACTION',
              payload: {
                action: 'click_at_coordinates',
                params: { x: targetCoords.x, y: targetCoords.y },
                tabId,
              },
            });
            if (coordRes && coordRes.success) {
              clickSuccess = true;
            } else if (!lastErr) {
              lastErr = new Error(coordRes?.error || 'Coordinate click failed');
            }
          } catch (err: any) {
            if (!lastErr) lastErr = err;
          }
        }

        if (!clickSuccess && !targetSelector && !targetCoords) {
          throw new Error('Click action requires either elementIndex, selector, or coordinates.');
        }

        if (!clickSuccess) {
          throw lastErr || new Error('Failed to click target element.');
        }

        return { success: true };
      }

      case 'type': {
        const textToType = String(action.text ?? (action as any).value ?? (action as any).query ?? '');
        const isSearchField = (targetSelector && /search|query|find|filter/i.test(targetSelector)) ||
          elements.some(el => (el.selector === targetSelector || el.index === action.elementIndex) && /search|query/i.test(el.placeholder || el.name || ''));
        const shouldPressEnter = action.pressEnter !== undefined ? action.pressEnter : isSearchField;

        const res = await chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_ACTION',
          payload: {
            action: 'type_into_element',
            params: {
              selector: targetSelector,
              x: targetCoords?.x,
              y: targetCoords?.y,
              text: textToType,
              pressEnter: shouldPressEnter,
              clearFirst: action.clearFirst ?? true,
            },
            tabId,
          },
        });

        if (res && !res.success && res.error) {
          throw new Error(res.error);
        }

        return { success: true };
      }

      case 'press_key': {
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_ACTION',
          payload: {
            action: 'press_key',
            params: { key: action.key || 'Enter' },
            tabId,
          },
        });
        return { success: true };
      }

      case 'shortcut': {
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_ACTION',
          payload: {
            action: 'press_shortcut',
            params: {
              shortcut: action.shortcut || action.key || 'ctrl+v',
              selector: targetSelector,
            },
            tabId,
          },
        });
        return { success: true };
      }

      case 'copy_to_clipboard': {
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_ACTION',
          payload: {
            action: 'clipboard',
            params: {
              action: 'write',
              text: action.clipboardText || action.text || '',
            },
            tabId,
          },
        });
        return { success: true };
      }

      case 'paste': {
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_ACTION',
          payload: {
            action: 'paste_into_element',
            params: {
              selector: targetSelector,
              x: targetCoords?.x,
              y: targetCoords?.y,
              text: action.clipboardText || action.text,
            },
            tabId,
          },
        });
        return { success: true };
      }

      case 'navigate': {
        if (!action.url) throw new Error('Navigate action missing URL.');
        await chrome.runtime.sendMessage({
          type: 'NAVIGATE_TAB',
          payload: { tabId, url: action.url, waitUntil: 'load' },
        });
        return { success: true };
      }

      case 'scroll': {
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_ACTION',
          payload: {
            action: 'scroll',
            params: {
              direction: action.direction || 'down',
              amount: action.amount || 400,
            },
            tabId,
          },
        });
        return { success: true };
      }

      case 'hover': {
        if (targetSelector) {
          await chrome.runtime.sendMessage({
            type: 'EXECUTE_DOM_ACTION',
            payload: {
              action: 'hover',
              params: { selector: targetSelector },
              tabId,
            },
          });
        }
        return { success: true };
      }

      case 'wait': {
        const duration = action.durationMs || 2500;
        if (
          typeof chrome !== 'undefined' &&
          chrome.runtime &&
          chrome.runtime.sendMessage &&
          (action.waitForSelector || action.waitForText || action.waitForNavigation)
        ) {
          await chrome.runtime.sendMessage({
            type: 'EXECUTE_DOM_ACTION',
            payload: {
              action: 'smart_wait',
              params: {
                timeout: duration,
                waitForSelector: action.waitForSelector,
                waitForText: action.waitForText,
                waitForNavigation: action.waitForNavigation,
              },
              tabId,
            },
          });
        } else {
          await new Promise(r => setTimeout(r, duration));
        }
        return { success: true };
      }

      case 'extract':
      case 'ask_human':
      case 'done':
        return { success: true };

      default:
        return { success: true };
    }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Parses JSON response from Vision model with defensive fallbacks
 */
export function parseAgentModelResponse(rawText: string): {
  thought: string;
  action: AgentAction;
  isComplete: boolean;
} {
  try {
    const cleaned = rawText
      .replace(/```(?:json)?\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();

    // Find JSON block if extra text surrounds it
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const jsonStr = (firstBrace !== -1 && lastBrace !== -1)
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;

    const parsed = JSON.parse(jsonStr);
    let parsedAction: AgentAction = parsed.action || { type: 'done', answer: 'Goal accomplished.' };

    if (parsed.question && !parsedAction.question) parsedAction.question = parsed.question;
    if (parsed.reason && !parsedAction.reason) parsedAction.reason = parsed.reason;
    if (parsed.suggestedOptions && !parsedAction.suggestedOptions) parsedAction.suggestedOptions = parsed.suggestedOptions;

    // If model thought identifies CAPTCHA or 2FA verification challenge, auto-convert to ask_human
    const thoughtText = (parsed.thought || '').toLowerCase();
    const isCaptchaOr2Fa = /captcha|recaptcha|hcaptcha|cloudflare|2fa|two-factor|otp|human verification|security check/i.test(thoughtText);
    if (isCaptchaOr2Fa && parsedAction.type !== 'ask_human') {
      parsedAction = {
        type: 'ask_human',
        question: parsed.thought || 'Verification challenge or CAPTCHA detected on screen. Please complete it to continue.',
        reason: 'Verification challenge detected',
        suggestedOptions: ['I completed verification, continue', 'Skip this step'],
      };
    }

    return {
      thought: parsed.thought || 'Inspecting current browser view.',
      action: parsedAction,
      isComplete: !!parsed.isComplete || parsedAction.type === 'done',
    };
  } catch {
    // Semantic heuristic fallback if model returned plain text
    const lower = rawText.toLowerCase();
    if (lower.includes('captcha') || lower.includes('human') || lower.includes('2fa') || lower.includes('verify')) {
      return {
        thought: rawText.slice(0, 150),
        action: {
          type: 'ask_human',
          question: rawText.slice(0, 150),
          reason: 'Encountered verification or roadblock requiring human input',
        },
        isComplete: false,
      };
    }
    if (lower.includes('wait') || lower.includes('loading') || lower.includes('still loading')) {
      return {
        thought: rawText.slice(0, 150),
        action: { type: 'wait', durationMs: 3500 },
        isComplete: false,
      };
    }
    if (lower.includes('click')) {
      return {
        thought: rawText.slice(0, 150),
        action: { type: 'click', selector: 'button' },
        isComplete: false,
      };
    }
    return {
      thought: rawText.slice(0, 200),
      action: { type: 'done', answer: rawText.slice(0, 200) },
      isComplete: true,
    };
  }
}

/**
 * Runs the autonomous browser agent perception-reasoning-action loop
 */
export async function runBrowserAgent(options: BrowserAgentOptions): Promise<AgentStep[]> {
  const {
    goal,
    maxSteps = 10,
    tabId,
    config,
    stepDelay = 1200,
    onStep,
    onStatusUpdate,
    onScreenshot,
    signal,
    pauseController,
    onRequestHumanGuidance,
  } = options;

  const steps: AgentStep[] = [];
  const actionHistory: string[] = [];
  const humanInstructionsHistory: string[] = [];
  let consecutiveWaitCount = 0;

  onStatusUpdate?.('Initializing autonomous browser agent...');

  for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex++) {
    if (signal?.aborted) {
      onStatusUpdate?.('Agent stopped by user.');
      break;
    }

    // Check if human paused the agent before perception/action
    if (pauseController?.isPaused) {
      onStatusUpdate?.('Agent paused by human. Waiting for instructions or resume...');
    }
    const resumedGuidance = await pauseController?.waitIfPaused(signal);
    if (resumedGuidance && resumedGuidance.trim()) {
      humanInstructionsHistory.push(`Human added guidance: "${resumedGuidance.trim()}"`);
      onStatusUpdate?.(`Resumed with human guidance: "${resumedGuidance.trim()}"`);
    }

    if (signal?.aborted) {
      onStatusUpdate?.('Agent stopped by user.');
      break;
    }

    onStatusUpdate?.(`Step ${stepIndex}/${maxSteps}: Perceiving page & taking screenshot...`);

    // 1. Capture live screenshot before action
    const screenshotBefore = await captureTabScreenshot(tabId);
    onScreenshot?.(screenshotBefore);

    // 2. Fetch interactive element snapshot from DOM
    const elements = await fetchInteractiveSnapshot(tabId);

    // 3. Construct elements table prompt snippet
    const elementsSummary = elements.length > 0
      ? elements
          .slice(0, 45)
          .map(el => `[#${el.index}] <${el.tag}> ${el.text ? `text="${el.text}"` : ''} ${el.placeholder ? `placeholder="${el.placeholder}"` : ''} ${el.selector ? `selector="${el.selector}"` : ''} pos:(${el.rect.x}, ${el.rect.y})`)
          .join('\n')
      : 'No interactive elements detected (page might be static or loading).';

    const historySummary = actionHistory.length > 0
      ? actionHistory.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'None (First step)';

    const guidanceSummary = humanInstructionsHistory.length > 0
      ? humanInstructionsHistory.map((g, i) => `${i + 1}. ${g}`).join('\n')
      : '';

    const userPrompt = `GOAL: "${goal}"

${guidanceSummary ? `HUMAN GUIDANCE & INSTRUCTIONS (MUST PRIORITIZE):\n${guidanceSummary}\n\n` : ''}PREVIOUS ACTIONS TAKEN:
${historySummary}

VISIBLE INTERACTIVE ELEMENTS IN VIEWPORT:
${elementsSummary}

Analyze the attached live screenshot and output the single next JSON action to accomplish the goal:`;

    onStatusUpdate?.(`Step ${stepIndex}/${maxSteps}: Reasoning with Vision AI...`);

    let modelResponseText = '';
    try {
      modelResponseText = await queryVisionLlm({
        prompt: userPrompt,
        systemInstruction: AGENT_SYSTEM_PROMPT,
        imageBase64: screenshotBefore,
        config,
        temperature: 0.2,
      });
    } catch (err: any) {
      const errorStep: AgentStep = {
        stepNumber: stepIndex,
        timestamp: Date.now(),
        thought: `Vision query encountered an error: ${err.message}`,
        action: { type: 'done', answer: `Stopped due to error: ${err.message}` },
        screenshotBefore,
        success: false,
        error: err.message,
        isComplete: true,
      };
      steps.push(errorStep);
      onStep?.(errorStep);
      onStatusUpdate?.(`Error: ${err.message}`);
      break;
    }

    // Check if human paused while model was reasoning
    if (pauseController?.isPaused) {
      onStatusUpdate?.('Agent paused by human before action execution. Waiting...');
      const preExecGuidance = await pauseController.waitIfPaused(signal);
      if (preExecGuidance && preExecGuidance.trim()) {
        humanInstructionsHistory.push(`Human added guidance: "${preExecGuidance.trim()}"`);
      }
      if (signal?.aborted) {
        onStatusUpdate?.('Agent stopped by user.');
        break;
      }
    }

    // 4. Parse action
    const parsed = parseAgentModelResponse(modelResponseText);

    let execResult: { success: boolean; data?: any; error?: string } = { success: true };
    let humanResponseRecorded = '';

    // If AI explicitly requested human guidance (e.g. CAPTCHA, 2FA, ambiguous selection)
    if (parsed.action.type === 'ask_human') {
      const question = parsed.action.question || parsed.thought || 'The agent requested your assistance to continue.';
      const reason = parsed.action.reason;
      const suggestedOptions = parsed.action.suggestedOptions;
      onStatusUpdate?.(`AI is asking for human guidance: "${question}"`);

      if (onRequestHumanGuidance) {
        try {
          const humanResponse = await onRequestHumanGuidance({
            question,
            reason,
            suggestedOptions,
            screenshot: screenshotBefore,
            stepIndex,
          });
          humanResponseRecorded = humanResponse;
          humanInstructionsHistory.push(`AI asked: "${question}". Human instructed: "${humanResponse}"`);
          onStatusUpdate?.(`Received human instructions: "${humanResponse}". Processing next step...`);
        } catch (guidanceErr: any) {
          execResult = { success: false, error: guidanceErr.message || 'Human guidance cancelled' };
        }
      } else {
        humanInstructionsHistory.push(`AI asked: "${question}" (No interactive human handler available)`);
        execResult = { success: true };
      }
    } else if (parsed.action.type === 'wait') {
      consecutiveWaitCount++;
      parsed.action.durationMs = resolveAppropriateWaitDuration(
        parsed.action,
        parsed.thought,
        consecutiveWaitCount
      );
      const waitConditionDesc = parsed.action.waitForSelector
        ? ` until "${parsed.action.waitForSelector}" appears`
        : (parsed.action.waitForText
          ? ` until text "${parsed.action.waitForText}" appears`
          : ` (${(parsed.action.durationMs / 1000).toFixed(1)}s)`);
      onStatusUpdate?.(`Step ${stepIndex}/${maxSteps}: Waiting${waitConditionDesc}...`);
      execResult = await executeAgentAction(parsed.action, elements, tabId);
    } else {
      consecutiveWaitCount = 0;
      onStatusUpdate?.(`Step ${stepIndex}/${maxSteps}: Executing ${parsed.action.type}...`);
      // 5. Execute action on live browser tab
      execResult = await executeAgentAction(parsed.action, elements, tabId);
    }

    // Record action description for history
    const actionDesc = parsed.action.type === 'ask_human'
      ? `ASK_HUMAN: "${parsed.action.question || 'Help required'}" -> "${humanResponseRecorded || 'pending'}"`
      : `${parsed.action.type.toUpperCase()}${parsed.action.text ? ` text="${parsed.action.text}"` : ''}${parsed.action.selector ? ` on ${parsed.action.selector}` : ''}${parsed.action.elementIndex ? ` on [#${parsed.action.elementIndex}]` : ''}${parsed.action.durationMs ? ` (${parsed.action.durationMs}ms)` : ''}`;
    actionHistory.push(actionDesc);

    // 6. Settle delay to let DOM / network update
    if (['click', 'type', 'navigate'].includes(parsed.action.type)) {
      await smartSettleTab(tabId, Math.max(stepDelay, 1200));
    } else {
      await new Promise(r => setTimeout(r, stepDelay));
    }

    // 7. Capture updated screenshot to verify effect
    const screenshotAfter = await captureTabScreenshot(tabId);
    onScreenshot?.(screenshotAfter);

    const step: AgentStep = {
      stepNumber: stepIndex,
      timestamp: Date.now(),
      thought: parsed.thought,
      action: parsed.action,
      humanGuidance: humanResponseRecorded || undefined,
      screenshotBefore,
      screenshotAfter,
      success: execResult.success,
      error: execResult.error,
      isComplete: parsed.isComplete || parsed.action.type === 'done',
    };

    steps.push(step);
    onStep?.(step);

    if (step.isComplete) {
      onStatusUpdate?.(`Goal completed! ${parsed.action.answer || ''}`);
      break;
    }

    if (stepIndex === maxSteps) {
      onStatusUpdate?.(`Reached maximum step limit (${maxSteps} steps).`);
    }
  }

  return steps;
}

/**
 * Converts executed agent steps into a visual AutoFlow workflow with nodes and edges
 */
export function convertAgentStepsToWorkflow(
  steps: AgentStep[],
  goal: string
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  let currentY = 100;
  const baseX = 300;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const act = step.action;
    const nodeId = generateId('agent_node');

    let nodeType: any = 'click';
    let label = 'Browser Action';
    let category: any = 'interaction';
    let properties: Record<string, any> = {};

    switch (act.type) {
      case 'navigate':
        nodeType = 'navigate';
        label = `Navigate: ${act.url || 'URL'}`;
        category = 'browser';
        properties = { url: act.url, waitUntil: 'load' };
        break;

      case 'type':
        nodeType = 'type_text';
        label = `Type: "${act.text || ''}"`;
        category = 'interaction';
        properties = {
          selector: act.selector || 'input',
          text: act.text || '',
          clearExisting: act.clearFirst ?? true,
          typingDelay: 40,
        };
        break;

      case 'click':
        nodeType = 'click';
        label = `Click: ${act.selector || `Index #${act.elementIndex || 1}`}`;
        category = 'interaction';
        properties = {
          selector: act.selector || 'button',
          clickType: act.clickType || 'left',
        };
        break;

      case 'scroll':
        nodeType = 'scroll';
        label = `Scroll ${act.direction || 'down'}`;
        category = 'interaction';
        properties = {
          direction: act.direction || 'down',
          amount: act.amount || 400,
        };
        break;

      case 'press_key':
        nodeType = 'press_key';
        label = `Press Key: ${act.key || 'Enter'}`;
        category = 'interaction';
        properties = { key: act.key || 'Enter' };
        break;

      case 'shortcut':
        nodeType = 'press_key';
        label = `Shortcut: ${act.shortcut || act.key || 'Ctrl+V'}`;
        category = 'interaction';
        properties = { key: act.shortcut || act.key || 'Ctrl+V', selector: act.selector };
        break;

      case 'copy_to_clipboard':
        nodeType = 'clipboard';
        label = `Copy to Clipboard`;
        category = 'utility';
        properties = { text: act.clipboardText || act.text || '', action: 'write' };
        break;

      case 'paste':
        nodeType = 'press_key';
        label = `Paste (Ctrl+V)`;
        category = 'interaction';
        properties = { key: 'Ctrl+V', selector: act.selector };
        break;

      case 'wait':
        if (act.waitForSelector) {
          nodeType = 'wait_for_element';
          label = `Wait for ${act.waitForSelector}`;
          category = 'wait';
          properties = {
            selector: act.waitForSelector,
            timeout: act.durationMs || 5000,
            visible: true,
          };
        } else if (act.waitForText) {
          nodeType = 'wait_for_text';
          label = `Wait for "${act.waitForText}"`;
          category = 'wait';
          properties = {
            text: act.waitForText,
            timeout: act.durationMs || 5000,
          };
        } else if (act.waitForNavigation) {
          nodeType = 'wait_for_navigation';
          label = `Wait for Navigation`;
          category = 'wait';
          properties = {
            timeout: act.durationMs || 10000,
          };
        } else {
          // If previous node was also a pure duration wait node, merge them!
          const lastNode = nodes[nodes.length - 1];
          if (lastNode && lastNode.data.type === 'wait' && !lastNode.data.properties.selector && !lastNode.data.properties.text) {
            const addedMs = act.durationMs || 2000;
            const currentDuration = Number(lastNode.data.properties.duration ?? lastNode.data.properties.durationMs) || 1000;
            const newDuration = currentDuration + addedMs;
            lastNode.data.properties.duration = newDuration;
            lastNode.data.properties.durationMs = newDuration;
            lastNode.data.label = `Wait ${(newDuration / 1000).toFixed(1)}s`;
            continue; // Skip creating redundant adjacent node
          }
          nodeType = 'wait';
          label = `Wait ${((act.durationMs || 2000) / 1000).toFixed(1)}s`;
          category = 'wait';
          properties = { duration: act.durationMs || 2000, durationMs: act.durationMs || 2000, unit: 'ms' };
        }
        break;

      case 'extract':
        nodeType = 'extract_text';
        label = `Extract: ${act.variableName || 'Data'}`;
        category = 'extraction';
        properties = {
          selector: act.selector || 'body',
          variableName: act.variableName || 'extractedData',
        };
        break;

      case 'done':
        continue; // Don't create an execution node for done
    }

    const newNode: WorkflowNode = {
      id: nodeId,
      type: 'customNode',
      position: { x: baseX, y: currentY },
      data: {
        label,
        category,
        type: nodeType,
        properties,
      },
    };

    nodes.push(newNode);

    if (nodes.length > 1) {
      const prevNode = nodes[nodes.length - 2];
      edges.push({
        id: generateId('edge'),
        source: prevNode.id,
        target: newNode.id,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
      });
    }

    currentY += 130;
  }

  // If no action nodes were created (e.g. done immediately), add an autonomous_agent node
  if (nodes.length === 0) {
    const singleNodeId = generateId('agent_node');
    nodes.push({
      id: singleNodeId,
      type: 'customNode',
      position: { x: baseX, y: 100 },
      data: {
        label: 'Autonomous Agent',
        category: 'utility',
        type: 'autonomous_agent',
        properties: {
          goal,
          maxSteps: 10,
          model: 'gpt-5.6-sol',
          outputVariable: 'agentResult',
        },
      },
    });
  }

  return { nodes, edges };
}
