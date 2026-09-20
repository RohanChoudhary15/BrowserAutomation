import { SelectorCandidate } from '../types/selector';
import { getCleanClasses, isDynamicId } from './generator';

export interface PatternDetectionResult {
  selector: string;
  itemSelector?: string;
  matchCount: number;
  sampleTexts: string[];
  strategies: SelectorCandidate[];
  item1Selector: string;
  item2Selector: string;
  containerSelector?: string;
  matchedElements?: Element[];
  confidence?: number;
}

/**
 * Finds the Lowest Common Ancestor (LCA) of two DOM elements
 */
export function findLowestCommonAncestor(el1: Element | null, el2: Element | null): Element | null {
  if (!el1 || !el2) return null;
  if (el1 === el2) return el1.parentElement;

  const path1: Element[] = [];
  let curr: Element | null = el1;
  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    path1.unshift(curr);
    curr = curr.parentElement;
  }

  const path2: Element[] = [];
  curr = el2;
  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    path2.unshift(curr);
    curr = curr.parentElement;
  }

  let lca: Element | null = null;
  const minLen = Math.min(path1.length, path2.length);
  for (let i = 0; i < minLen; i++) {
    if (path1[i] === path2[i]) {
      lca = path1[i];
    } else {
      break;
    }
  }

  return lca;
}

/**
 * Computes a relative structural sub-path from a container element to a target element
 * e.g., "div.card > h3.title > a"
 */
export function getRelativePath(container: Element, target: Element): string {
  if (container === target) return '';

  const segments: string[] = [];
  let curr: Element | null = target;

  while (curr && curr !== container && curr.nodeType === Node.ELEMENT_NODE) {
    const tag = curr.tagName.toLowerCase();
    const cleanCls = getCleanClasses(curr);
    let segment = tag;
    if (cleanCls.length > 0) {
      segment += `.${cleanCls.slice(0, 1).map(c => CSS.escape ? CSS.escape(c) : c).join('.')}`;
    }
    segments.unshift(segment);
    curr = curr.parentElement;
  }

  return segments.join(' > ');
}

export const getRelativeSelector = getRelativePath;

/**
 * Generates an element-specific identifying selector (for Item 1 and Item 2)
 */
function getSpecificSelector(el: Element): string {
  if (el.id && !isDynamicId(el.id)) {
    return `#${CSS.escape ? CSS.escape(el.id) : el.id}`;
  }
  const tag = el.tagName.toLowerCase();
  const cleanCls = getCleanClasses(el);
  if (cleanCls.length > 0) {
    return `${tag}.${cleanCls.slice(0, 2).map(c => CSS.escape ? CSS.escape(c) : c).join('.')}`;
  }
  return tag;
}

/**
 * Tests candidate selectors against the DOM to verify they match BOTH elements
 * and ranks candidates by simplicity, semantic clarity, and coverage.
 */
export function detectListPattern(
  el1: Element,
  el2: Element,
  rootDocument: Document | Element = typeof document !== 'undefined' ? document : (el1.ownerDocument || document)
): PatternDetectionResult {
  const item1Selector = getSpecificSelector(el1);
  const item2Selector = getSpecificSelector(el2);

  const tag1 = el1.tagName.toLowerCase();
  const tag2 = el2.tagName.toLowerCase();

  const candidates: { selector: string; score: number; description: string; type: any }[] = [];

  // 1. Shared clean CSS classes
  const cls1 = new Set(getCleanClasses(el1));
  const cls2 = new Set(getCleanClasses(el2));
  const sharedCls = Array.from(cls1).filter(c => cls2.has(c));

  if (sharedCls.length > 0 && tag1 === tag2) {
    const classOnly = `.${sharedCls.map(c => CSS.escape ? CSS.escape(c) : c).join('.')}`;
    const tagAndClass = `${tag1}${classOnly}`;

    candidates.push({
      selector: tagAndClass,
      score: 1,
      description: `Tag and shared class (${tagAndClass})`,
      type: 'css',
    });

    candidates.push({
      selector: classOnly,
      score: 2,
      description: `Shared class only (${classOnly})`,
      type: 'css',
    });
  }

  // 2. Lowest Common Ancestor container analysis
  const lca = findLowestCommonAncestor(el1, el2);
  let containerSelector = '';

  if (lca) {
    // Generate selector for container
    const lcaTag = lca.tagName.toLowerCase();
    const lcaId = lca.id && !isDynamicId(lca.id) ? `#${CSS.escape ? CSS.escape(lca.id) : lca.id}` : '';
    const lcaCls = getCleanClasses(lca);

    if (lcaId) {
      containerSelector = lcaId;
    } else if (lcaCls.length > 0) {
      containerSelector = `${lcaTag}.${lcaCls.slice(0, 2).map(c => CSS.escape ? CSS.escape(c) : c).join('.')}`;
    } else if (['ul', 'ol', 'table', 'tbody', 'section', 'main'].includes(lcaTag)) {
      containerSelector = lcaTag;
    }

    // A. Relative path from LCA
    const rel1 = getRelativePath(lca, el1);
    const rel2 = getRelativePath(lca, el2);

    if (rel1 === rel2 && rel1.length > 0) {
      if (containerSelector) {
        candidates.push({
          selector: `${containerSelector} > ${rel1}`,
          score: 3,
          description: `Container child path (${containerSelector} > ${rel1})`,
          type: 'css',
        });
        candidates.push({
          selector: `${containerSelector} ${rel1}`,
          score: 4,
          description: `Container descendant (${containerSelector} ${rel1})`,
          type: 'css',
        });
      } else {
        candidates.push({
          selector: rel1,
          score: 5,
          description: `Relative element pattern (${rel1})`,
          type: 'css',
        });
      }
    }

    // B. Direct sibling items under container (e.g. ul > li, table tr, etc.)
    if (el1.parentElement === lca && el2.parentElement === lca && tag1 === tag2) {
      if (containerSelector) {
        candidates.push({
          selector: `${containerSelector} > ${tag1}`,
          score: 6,
          description: `Direct container children (${containerSelector} > ${tag1})`,
          type: 'css',
        });
      }
    }
  }

  // 3. Shared semantic data/test attributes (e.g. data-testid, role)
  const testAttrs = ['data-testid', 'data-component', 'data-role', 'role'];
  for (const attr of testAttrs) {
    const val1 = el1.getAttribute(attr);
    const val2 = el2.getAttribute(attr);
    if (val1 && val2 && val1 === val2) {
      candidates.push({
        selector: `[${attr}="${CSS.escape ? CSS.escape(val1) : val1}"]`,
        score: 2,
        description: `Shared attribute [${attr}="${val1}"]`,
        type: 'testid',
      });
    }
  }

  // 4. Tag-only fallback if same tag
  if (tag1 === tag2) {
    if (containerSelector) {
      candidates.push({
        selector: `${containerSelector} ${tag1}`,
        score: 7,
        description: `Container tag descendants (${containerSelector} ${tag1})`,
        type: 'css',
      });
    } else {
      candidates.push({
        selector: tag1,
        score: 9,
        description: `All <${tag1}> elements`,
        type: 'css',
      });
    }
  }

  // Filter and evaluate candidate selectors against rootDocument
  const validStrategies: SelectorCandidate[] = [];
  let bestSelector = '';
  let bestMatchCount = 0;
  let sampleTexts: string[] = [];

  for (const cand of candidates) {
    try {
      const matches = rootDocument.querySelectorAll(cand.selector);
      const matchArray = Array.from(matches);

      // Must match BOTH el1 and el2 to be a valid repeating pattern!
      const matchesBoth = matchArray.includes(el1) && matchArray.includes(el2);

      if (matchesBoth && matchArray.length >= 2) {
        const reliability = Math.max(20, 100 - (cand.score * 5));
        validStrategies.push({
          type: cand.type,
          value: cand.selector,
          reliabilityScore: reliability,
          description: `${cand.description} (${matchArray.length} items)`,
        });

        if (!bestSelector) {
          bestSelector = cand.selector;
          bestMatchCount = matchArray.length;
          sampleTexts = matchArray
            .slice(0, 5)
            .map(m => m.textContent?.trim() || '')
            .filter(Boolean)
            .map(t => t.length > 50 ? t.slice(0, 47) + '...' : t);
        }
      }
    } catch {
      // Invalid selector syntax in current context, skip
    }
  }

  // Sort strategies descending by reliability
  validStrategies.sort((a, b) => (b.reliabilityScore || 0) - (a.reliabilityScore || 0));

  // If no strategy matched both through querySelectorAll, fallback to best common class/tag
  if (!bestSelector) {
    bestSelector = sharedCls.length > 0 ? `.${sharedCls[0]}` : (tag1 === tag2 ? tag1 : `${tag1}, ${tag2}`);
    try {
      const fallbackMatches = Array.from(rootDocument.querySelectorAll(bestSelector));
      bestMatchCount = fallbackMatches.length;
      sampleTexts = fallbackMatches.slice(0, 5).map(m => m.textContent?.trim() || '').filter(Boolean);
    } catch {
      bestMatchCount = 2;
    }

    validStrategies.push({
      type: 'css',
      value: bestSelector,
      reliabilityScore: 10,
      description: `Fallback pattern (${bestSelector})`,
    });
  }

  let matchedElements: Element[] = [];
  try {
    matchedElements = Array.from(rootDocument.querySelectorAll(bestSelector));
  } catch {}

  const topConfidence = validStrategies.length > 0
    ? ((validStrategies[0].reliabilityScore || 80) / 100)
    : 0.8;

  return {
    selector: bestSelector,
    itemSelector: bestSelector,
    matchCount: bestMatchCount,
    sampleTexts,
    strategies: validStrategies,
    item1Selector,
    item2Selector,
    containerSelector: containerSelector || undefined,
    matchedElements,
    confidence: topConfidence,
  };
}
