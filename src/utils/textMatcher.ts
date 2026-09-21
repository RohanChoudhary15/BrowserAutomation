/**
 * Text Matching Utility
 * Provides flexible text matching with support for:
 * - Partial (substring / contains) vs. Exact match modes
 * - Case-sensitive vs. Case-insensitive matching
 * - Unicode whitespace normalization (including non-breaking spaces \u00A0)
 */

export interface TextMatchOptions {
  matchMode?: 'partial' | 'exact';
  caseSensitive?: boolean;
  trim?: boolean;
  normalizeWhitespace?: boolean;
}

/**
 * Normalizes text for comparison by collapsing multiple whitespace characters
 * (including non-breaking spaces \u00A0) and optionally trimming.
 */
export function normalizeText(text: string | null | undefined, trim = true, collapseSpaces = true): string {
  if (text === null || text === undefined) return '';
  let s = String(text);
  if (collapseSpaces) {
    // Replace non-breaking spaces (\u00A0) and sequences of whitespace with a single space
    s = s.replace(/[\s\u00A0]+/g, ' ');
  }
  return trim ? s.trim() : s;
}

/**
 * Evaluates whether actual text matches the target text under given options.
 */
export function matchesText(
  actual: string | null | undefined,
  target: string | null | undefined,
  options: TextMatchOptions = {}
): boolean {
  if (actual === null || actual === undefined) return false;
  if (target === null || target === undefined) return false;

  const trim = options.trim !== false;
  const normalize = options.normalizeWhitespace !== false;
  const caseSensitive = options.caseSensitive === true;
  const matchMode = options.matchMode || 'partial';

  let a = normalizeText(actual, trim, normalize);
  let t = normalizeText(target, trim, normalize);

  if (!caseSensitive) {
    a = a.toLowerCase();
    t = t.toLowerCase();
  }

  if (matchMode === 'exact') {
    return a === t;
  }

  // Default: partial match (contains)
  return a.includes(t);
}

/**
 * Searches a DOM root container for the best matching element for given target text.
 * Finds the innermost matching element for accurate highlighting and interaction.
 */
export function findMatchingElement(
  root: Element | Document,
  target: string,
  options: TextMatchOptions = {}
): Element | null {
  const matchMode = options.matchMode || 'partial';
  const container = root instanceof Document ? root.body : root;
  if (!container) return null;

  // 1. If searching for exact match
  if (matchMode === 'exact') {
    // Check all child elements from leaf up to find innermost match
    const elements = Array.from(container.querySelectorAll('*'));
    // Reverse to check innermost (leaf) elements first
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (matchesText(el.textContent, target, { ...options, matchMode: 'exact' })) {
        return el;
      }
    }
    // Also check container itself if no child matched
    if (matchesText(container.textContent, target, { ...options, matchMode: 'exact' })) {
      return container;
    }
    return null;
  }

  // 2. If partial match (contains)
  if (!matchesText(container.textContent, target, { ...options, matchMode: 'partial' })) {
    return null;
  }

  // Find the deepest element that contains the target text
  const elements = Array.from(container.querySelectorAll('*'));
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    // Check if this element directly or through children contains target
    if (matchesText(el.textContent, target, { ...options, matchMode: 'partial' })) {
      return el;
    }
  }

  return container;
}
