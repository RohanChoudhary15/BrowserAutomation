import { SelectorCandidate, ElementSelectionResult } from '../types/selector';

/**
 * Checks if an ID appears to be dynamically generated (e.g., react-aria-123, ember8392, uuid-like)
 */
export function isDynamicId(id: string): boolean {
  if (!id || id.trim() === '') return true;
  // Patterns like :r1:, react-aria-1234, ember123, guid-like, or trailing 4+ random digits/hex
  if (/^(:r[0-9a-z]+:)/i.test(id)) return true;
  if (/^(ember|react-aria|mui-|radix-|headlessui-|chakra-)[0-9a-z_-]+/i.test(id)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(id)) return true;
  if (/[_-][0-9]{4,}/.test(id)) return true;
  if (/^[0-9]+$/.test(id)) return true;
  return false;
}

/**
 * Filters out utility CSS classes like Tailwind or CSS Modules hashes
 */
export function getCleanClasses(el: Element): string[] {
  if (!el.className || typeof el.className !== 'string') return [];
  const classes = el.className.split(/\s+/).filter(c => c.trim().length > 0);
  return classes.filter(cls => {
    // Ignore Tailwind utility classes (e.g., p-4, flex, text-sm, bg-blue-500, w-[100px])
    if (/^(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr)-[0-9a-z\.[\]/]+$/i.test(cls)) return false;
    if (/^(flex|grid|block|inline|relative|absolute|fixed|sticky|hidden)$/i.test(cls)) return false;
    if (/^(w|h|min-w|min-h|max-w|max-h)-[0-9a-z\.[\]/]+$/i.test(cls)) return false;
    if (/^(text|bg|border|shadow|rounded|transition|duration)-[0-9a-z\.[\]/-]+$/i.test(cls)) return false;
    // Ignore CSS modules hash suffixes (e.g., Button__primary___1a2b3)
    if (/_{2,}[0-9a-zA-Z]{5,}/.test(cls)) return false;
    return true;
  });
}

/**
 * Generates an XPath string for an element
 */
export function generateXPath(element: Element): string {
  if (element.id && !isDynamicId(element.id)) {
    return `//*[@id="${element.id}"]`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (current.tagName.toLowerCase() === 'body') {
      parts.unshift('body');
      break;
    }
    let count = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) count++;
      sibling = sibling.previousElementSibling;
    }
    const tag = current.tagName.toLowerCase();
    parts.unshift(`${tag}[${count}]`);
    current = current.parentElement;
  }
  return `//${parts.join('/')}`;
}

/**
 * Generates ranked selector strategies for any DOM element
 */
export function generateSelectors(el: Element): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];
  const tag = el.tagName.toLowerCase();

  // 1. Test IDs (Highest reliability)
  const testIdAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-test-id'];
  for (const attr of testIdAttrs) {
    const val = el.getAttribute(attr);
    if (val) {
      candidates.push({
        type: 'testid',
        value: `[${attr}="${val}"]`,
        reliabilityScore: 1,
        description: `Test ID (${attr})`,
      });
      break;
    }
  }

  // 2. Stable ID
  const id = el.getAttribute('id');
  if (id && !isDynamicId(id)) {
    candidates.push({
      type: 'id',
      value: `#${CSS.escape ? CSS.escape(id) : id}`,
      reliabilityScore: 2,
      description: 'Element ID',
    });
  }

  // 3. Form Name or Type
  const name = el.getAttribute('name');
  if (name) {
    candidates.push({
      type: 'name',
      value: `${tag}[name="${name}"]`,
      reliabilityScore: 3,
      description: 'Form Name',
    });
  }

  // 4. Accessibility attributes (Aria-label, role)
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim().length > 0) {
    candidates.push({
      type: 'aria',
      value: `${tag}[aria-label="${ariaLabel}"]`,
      reliabilityScore: 4,
      description: 'ARIA Label',
    });
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) {
    candidates.push({
      type: 'aria',
      value: `${tag}[placeholder="${placeholder}"]`,
      reliabilityScore: 5,
      description: 'Placeholder',
    });
  }

  // 5. Semantic text matching (for buttons, links, labels, headings)
  const textContent = el.textContent?.trim();
  if (textContent && textContent.length > 0 && textContent.length < 50) {
    const cleanText = textContent.replace(/"/g, '\\"');
    if (['button', 'a', 'label', 'h1', 'h2', 'h3', 'h4', 'span'].includes(tag)) {
      candidates.push({
        type: 'text',
        value: `${tag}:has-text("${cleanText}")`,
        reliabilityScore: 6,
        description: `Text Content ("${cleanText.length > 20 ? cleanText.substring(0, 17) + '...' : cleanText}")`,
      });
    }
  }

  // 6. Meaningful CSS Class hierarchy
  const cleanClasses = getCleanClasses(el);
  if (cleanClasses.length > 0) {
    const classSelector = `${tag}.${cleanClasses.slice(0, 2).map(c => CSS.escape ? CSS.escape(c) : c).join('.')}`;
    candidates.push({
      type: 'css',
      value: classSelector,
      reliabilityScore: 7,
      description: 'Class Selector',
    });
  }

  // 7. Hierarchical CSS path
  const parent = el.parentElement;
  if (parent) {
    const parentId = parent.getAttribute('id');
    if (parentId && !isDynamicId(parentId)) {
      candidates.push({
        type: 'css',
        value: `#${parentId} > ${tag}`,
        reliabilityScore: 8,
        description: 'Parent ID + Tag',
      });
    }
  }

  // 8. XPath Fallback
  candidates.push({
    type: 'xpath',
    value: generateXPath(el),
    reliabilityScore: 9,
    description: 'XPath Structure',
  });

  // Sort by reliability score
  candidates.sort((a, b) => a.reliabilityScore - b.reliabilityScore);

  return candidates;
}

/**
 * Extracts a lightweight, clean HTML snippet of an element for AI analysis
 */
export function getCleanHtmlSnippet(el: Element, maxLength = 3500): string {
  try {
    const clone = el.cloneNode(true) as Element;
    // Remove heavy scripts, styles, iframes
    const junk = clone.querySelectorAll('script, style, noscript, iframe, template');
    junk.forEach(j => j.remove());
    // Truncate long base64 image data to prevent prompt bloat
    const imgs = clone.querySelectorAll('img[src]');
    imgs.forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('data:image')) {
        img.setAttribute('src', '[data-url]');
      }
    });
    return clone.outerHTML.slice(0, maxLength);
  } catch {
    return (el.outerHTML || '').slice(0, maxLength);
  }
}

/**
 * Builds complete ElementSelectionResult
 */
export function buildElementSelectionResult(el: Element, context?: string): ElementSelectionResult {
  const strategies = generateSelectors(el);
  let best = strategies[0]?.value || el.tagName.toLowerCase();

  // If selecting a repeating container or generating an AI schema, prefer class / css over unique text
  if (context === 'container' || context === 'ai_schema') {
    const classCandidate = strategies.find(s => s.type === 'css');
    if (classCandidate) {
      best = classCandidate.value;
    } else {
      best = el.tagName.toLowerCase();
    }
  }

  const rect = el.getBoundingClientRect();
  const htmlSnippet = getCleanHtmlSnippet(el);

  return {
    selector: best,
    strategies,
    tagName: el.tagName.toLowerCase(),
    id: el.getAttribute('id') || undefined,
    name: el.getAttribute('name') || undefined,
    testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || undefined,
    textSnippet: el.textContent ? el.textContent.trim().substring(0, 80) : undefined,
    outerHtmlSnippet: htmlSnippet,
    ariaLabel: el.getAttribute('aria-label') || undefined,
    context,
    rect: {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
  };
}
