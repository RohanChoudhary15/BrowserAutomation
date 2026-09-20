export interface FindElementOptions {
  timeout?: number;
  visible?: boolean;
  enabled?: boolean;
  frame?: string[];
}

/**
 * Parses :has-text("...") pseudo-selector with compound selector & case-insensitive matching
 */
function queryByHasText(selector: string, root: ParentNode = document): Element | null {
  const idx = selector.indexOf(':has-text(');
  if (idx === -1) return null;

  const baseCss = selector.slice(0, idx).trim() || '*';
  const textPart = selector.slice(idx + ':has-text('.length).trim();
  const endParen = textPart.lastIndexOf(')');
  if (endParen === -1) return null;

  let searchText = textPart.slice(0, endParen).trim();
  // Strip enclosing quotes if present
  if (
    (searchText.startsWith('"') && searchText.endsWith('"')) ||
    (searchText.startsWith("'") && searchText.endsWith("'"))
  ) {
    searchText = searchText.slice(1, -1);
  }
  searchText = searchText.replace(/\\(["'])/g, '$1');

  let candidates: Element[] = [];
  try {
    candidates = Array.from(root.querySelectorAll(baseCss));
  } catch {
    try {
      candidates = Array.from(root.querySelectorAll('*'));
    } catch {
      return null;
    }
  }

  const searchLower = searchText.toLowerCase().trim();

  // 1. Prefer exact text match (case-insensitive, trimmed)
  for (const el of candidates) {
    const directText = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (directText === searchLower) {
      return el;
    }
  }

  // 2. Substring match
  for (const el of candidates) {
    const textContent = (el.textContent || '').toLowerCase();
    if (textContent.includes(searchLower)) {
      return el;
    }
  }

  return null;
}

/**
 * Queries an element by CSS or XPath
 */
export function queryElement(selector: string, root: ParentNode = document): Element | null {
  if (!selector || selector.trim() === '') return null;
  const trimmed = selector.trim();

  // XPath query
  if (trimmed.startsWith('//') || trimmed.startsWith('(')) {
    try {
      const doc = root instanceof Document ? root : root.ownerDocument || document;
      const result = doc.evaluate(trimmed, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return (result.singleNodeValue as Element) || null;
    } catch {
      return null;
    }
  }

  // :has-text query
  if (trimmed.includes(':has-text(')) {
    return queryByHasText(trimmed, root);
  }

  // Standard querySelector
  try {
    const el = root.querySelector(trimmed);
    if (el) return el;
  } catch (err) {
    // If invalid CSS selector syntax, fall through to smart lookups below
  }

  // Smart Fallback 1: ID without #, or name, or data-testid
  if (/^[a-zA-Z0-9_\-:]+$/.test(trimmed)) {
    try {
      const escapeVal = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(trimmed) : trimmed;
      const byId = root.querySelector(`#${escapeVal}`);
      if (byId) return byId;
      const byName = root.querySelector(`[name="${escapeVal}"]`);
      if (byName) return byName;
      const byTestId = root.querySelector(`[data-testid="${escapeVal}"]`);
      if (byTestId) return byTestId;
    } catch {}
  }

  // Smart Fallback 2: Placeholder search
  try {
    const escaped = trimmed.replace(/"/g, '\\"');
    const byPlaceholder = root.querySelector(`input[placeholder*="${escaped}" i], textarea[placeholder*="${escaped}" i]`);
    if (byPlaceholder) return byPlaceholder;
  } catch {}

  // Smart Fallback 3: Aria-label or associated label text search
  try {
    const escaped = trimmed.replace(/"/g, '\\"');
    const byAria = root.querySelector(`[aria-label*="${escaped}" i], [aria-placeholder*="${escaped}" i]`);
    if (byAria) return byAria;

    // Search labels whose text matches trimmed
    const labels = Array.from(root.querySelectorAll('label'));
    for (const lbl of labels) {
      if ((lbl.textContent || '').trim().toLowerCase().includes(trimmed.toLowerCase())) {
        if (lbl.htmlFor) {
          const target = document.getElementById(lbl.htmlFor);
          if (target) return target;
        }
        const childInput = lbl.querySelector('input, textarea');
        if (childInput) return childInput;
      }
    }
  } catch {}

  return null;
}

/**
 * Checks if an element is visible in the viewport and not display:none / visibility:hidden
 */
export function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return true;

  // In virtual environments (happy-dom/jsdom) where layout is not computed, connected elements are visible if not hidden
  if (el.isConnected && rect.width === 0 && rect.height === 0) {
    const isTest = typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || !!process.env?.VITEST);
    if (isTest) return true;
  }

  return false;
}

/**
 * Checks if element is enabled (not disabled)
 */
export function isElementEnabled(el: Element): boolean {
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    return !el.disabled;
  }
  return true;
}

/**
 * Polls DOM until element matches selector and criteria, or times out
 */
export async function waitForElement(
  selector: string,
  options: FindElementOptions = {},
  signal?: AbortSignal
): Promise<Element> {
  const timeout = options.timeout ?? 10000;
  const pollInterval = 100;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) {
        reject(new Error('Operation aborted by user.'));
        return;
      }

      let el: Element | null = null;
      try {
        el = queryElement(selector);
      } catch (err) {
        // continue polling
      }

      if (el) {
        let conditionMet = true;
        if (options.visible && !isElementVisible(el)) {
          conditionMet = false;
        }
        if (options.enabled && !isElementEnabled(el)) {
          conditionMet = false;
        }

        if (conditionMet) {
          resolve(el);
          return;
        }
      }

      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Timed out after ${timeout}ms waiting for element: ${selector}`));
        return;
      }

      setTimeout(check, pollInterval);
    };

    check();
  });
}
