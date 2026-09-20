/**
 * Manifest V3 Safe JavaScript & Formula Evaluation Bridge
 * 
 * In Manifest V3, extension pages strictly prohibit 'unsafe-eval' (eval and new Function).
 * Dynamic user scripts and formulas are executed inside an isolated sandboxed iframe
 * (registered under 'sandbox' in manifest.json), preventing CSP violation errors.
 */
import { getNestedValue } from './interpolator';

let sandboxIframe: HTMLIFrameElement | null = null;
let sandboxReady = false;
let messageCounter = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timer: any;
  }
>();

/**
 * Initializes and lazily mounts the sandboxed iframe into the extension DOM
 */
function ensureSandbox(): Promise<HTMLIFrameElement> {
  if (sandboxIframe && sandboxReady) {
    return Promise.resolve(sandboxIframe);
  }

  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      return resolve(null as any);
    }

    const existing = document.getElementById('autoflow-sandbox-iframe') as HTMLIFrameElement;
    if (existing) {
      sandboxIframe = existing;
      sandboxReady = true;
      return resolve(sandboxIframe);
    }

    // Set up message listener once
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || !data.id) return;

      const pending = pendingRequests.get(data.id);
      if (!pending) return;

      pendingRequests.delete(data.id);
      clearTimeout(pending.timer);

      if (data.success) {
        pending.resolve(data.result);
      } else {
        pending.reject(new Error(data.error || 'Execution failed inside sandbox.'));
      }
    });

    const iframe = document.createElement('iframe');
    iframe.id = 'autoflow-sandbox-iframe';
    iframe.style.display = 'none';
    iframe.setAttribute('sandbox', 'allow-scripts');

    // In Chrome extension context, load sandbox.html via chrome.runtime.getURL
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      iframe.src = chrome.runtime.getURL('sandbox.html');
    } else {
      iframe.src = 'sandbox.html';
    }

    iframe.onload = () => {
      sandboxReady = true;
      resolve(iframe);
    };

    document.body.appendChild(iframe);
    sandboxIframe = iframe;

    // Failsafe if onload doesn't fire immediately
    setTimeout(() => {
      sandboxReady = true;
      resolve(iframe);
    }, 150);
  });
}

/**
 * Executes custom JavaScript code with variable scope in the MV3 sandbox or test fallback
 */
export async function runInSandbox(
  code: string,
  variables: Record<string, any> = {},
  timeoutMs = 10000
): Promise<any> {
  // If running in browser environment with extension APIs, execute via sandbox iframe
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const iframe = await ensureSandbox();
      if (iframe && iframe.contentWindow) {
        const id = `sb_${Date.now()}_${++messageCounter}`;

        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`JavaScript execution timed out after ${timeoutMs / 1000}s.`));
          }, timeoutMs);

          pendingRequests.set(id, { resolve, reject, timer });

          iframe.contentWindow!.postMessage(
            { id, code, variables },
            '*'
          );
        });
      }
    } catch (err: any) {
      console.warn('Sandbox iframe evaluation failed, falling back:', err);
    }
  }

  // Fallback for headless testing environments (Node.js/Vitest) without extension CSP
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('variables', 'context', `return (async () => { ${code} })();`);
    return await fn(variables, {});
  } catch (err: any) {
    throw new Error(err.message || String(err));
  }
}

/**
 * Safely evaluates mathematical arithmetic expressions without new Function / eval
 */
export function safeEvaluateMath(formula: string, variables: Record<string, any> = {}): number {
  if (!formula || typeof formula !== 'string') return 0;

  // 1. First replace {{var}}.length or {{varPath.length}}
  let sanitized = formula.replace(/\{\{([^}]+)\}\}\.length/g, (_, path) => {
    const val = getNestedValue(variables, path.trim());
    return String(val?.length ?? 0);
  });

  // 2. Handle array literal length strings like "[...].length"
  sanitized = sanitized.replace(/\[.*?\]\.length/g, (match) => {
    try {
      const arr = JSON.parse(match.slice(0, -7));
      if (Array.isArray(arr)) return String(arr.length);
    } catch {}
    return '0';
  });

  // 3. Replace remaining variable placeholders: {{varPath}}
  sanitized = sanitized.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const val = getNestedValue(variables, path.trim());
    if (Array.isArray(val)) return String(val.length);
    const num = Number(val);
    return isNaN(num) ? '0' : String(num);
  });

  // Strip anything that is NOT a valid arithmetic character or Math function
  // Only allow numbers, +, -, *, /, %, (, ), ., spaces, and Math.* methods
  sanitized = sanitized.trim();
  if (sanitized === '') return 0;

  // Simple safe arithmetic evaluation using token parsing
  try {
    // Check if expression is pure arithmetic: e.g. "10 + 20 * (5 - 2)"
    if (/^[0-9+\-*/%().\s]+$/.test(sanitized)) {
      // Tokenize and evaluate safely via Shunting-yard or simple recursive parser
      const result = parseArithmetic(sanitized);
      return isNaN(result) ? 0 : result;
    }

    // If formula contains Math constants or functions like Math.floor, Math.round, Math.max
    if (/^Math\.[a-zA-Z0-9]+\([0-9+\-*/%().\s,Math.]+\)$/.test(sanitized)) {
      // Restricted to Math functions
      const funcMatch = sanitized.match(/^Math\.([a-zA-Z0-9]+)\((.*)\)$/);
      if (funcMatch) {
        const [, funcName, argsStr] = funcMatch;
        const fn = (Math as any)[funcName];
        if (typeof fn === 'function') {
          const evaluatedArgs = argsStr
            .split(',')
            .map((arg) => parseArithmetic(arg.trim()));
          return Number(fn(...evaluatedArgs)) || 0;
        }
      }
    }
  } catch {
    return 0;
  }

  return 0;
}

/**
 * Basic precedence arithmetic evaluator for +, -, *, /, %, parentheses
 */
function parseArithmetic(expr: string): number {
  const tokens = expr.match(/\d+(?:\.\d+)?|[+\-*/%()]/g) || [];
  let pos = 0;

  function parseExpression(): number {
    let val = parseTerm();
    while (pos < tokens.length) {
      const op = tokens[pos];
      if (op === '+' || op === '-') {
        pos++;
        const nextVal = parseTerm();
        val = op === '+' ? val + nextVal : val - nextVal;
      } else {
        break;
      }
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (pos < tokens.length) {
      const op = tokens[pos];
      if (op === '*' || op === '/' || op === '%') {
        pos++;
        const nextVal = parseFactor();
        if (op === '*') val *= nextVal;
        else if (op === '/') val = nextVal !== 0 ? val / nextVal : 0;
        else if (op === '%') val = nextVal !== 0 ? val % nextVal : 0;
      } else {
        break;
      }
    }
    return val;
  }

  function parseFactor(): number {
    if (pos >= tokens.length) return 0;
    const token = tokens[pos++];

    if (token === '(') {
      const val = parseExpression();
      if (pos < tokens.length && tokens[pos] === ')') {
        pos++;
      }
      return val;
    }

    if (token === '-') {
      return -parseFactor();
    }

    if (token === '+') {
      return parseFactor();
    }

    const num = Number(token);
    return isNaN(num) ? 0 : num;
  }

  return parseExpression();
}
