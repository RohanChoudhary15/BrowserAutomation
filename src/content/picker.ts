import { buildElementSelectionResult } from '../selectors/generator';
import { detectListPattern, PatternDetectionResult } from '../selectors/patternDetector';
import { ElementSelectionResult } from '../types/selector';

export type PickerMode = 'single' | 'pattern_2click';

let overlayEl: HTMLDivElement | null = null;
let badgeEl: HTMLDivElement | null = null;
let bannerEl: HTMLDivElement | null = null;
let hoveredElement: Element | null = null;
let isPickerActive = false;
let currentPickerMode: PickerMode = 'single';
let currentPickerContext: string = 'selector';
let currentFieldIndex: number | undefined = undefined;

// 2-Click Pattern Detection State
let patternStep: 1 | 2 | 'confirm' = 1;
let item1Element: Element | null = null;
let item2Element: Element | null = null;
let patternMatchedElements: Element[] = [];
let detectedPatternResult: PatternDetectionResult | null = null;

type PickCallback = (result: ElementSelectionResult) => void;
type CancelCallback = () => void;

let onPickCallback: PickCallback | null = null;
let onCancelCallback: CancelCallback | null = null;

function handleMouseMove(e: MouseEvent) {
  if (!isPickerActive) return;

  // Don't target elements during confirmation phase
  if (patternStep === 'confirm') return;

  let target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target || target === overlayEl || target === badgeEl || target === bannerEl || bannerEl?.contains(target)) {
    return;
  }

  // Intelligently snap to real input element if target is an input wrapper, icon, or label (in single mode only)
  if (
    currentPickerMode === 'single' &&
    !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    (target.tagName === 'DIV' || target.tagName === 'SPAN' || target.tagName === 'LABEL' || target.tagName === 'SVG' || target.tagName === 'PATH')
  ) {
    const childInput = target.querySelector<HTMLElement>('input:not([type="hidden"]), textarea');
    const closestInput = target.closest<HTMLElement>('label, form, .relative, div[class*="input"], div[class*="search"]')?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea');
    if (childInput) {
      target = childInput;
    } else if (closestInput) {
      target = closestInput;
    }
  }

  // In card/container mode, auto-ascend from internal card children to card container
  if (
    currentPickerMode === 'single' &&
    (currentPickerContext === 'container' ||
      currentPickerContext === 'card_container' ||
      currentPickerContext === 'card' ||
      currentPickerContext === 'ai_schema')
  ) {
    const cardCandidate = target.closest<HTMLElement>(
      'article, .Box-row, [class*="Box-row"], [class*="card" i], [class*="product" i], [class*="item" i], [class*="listing" i], [class*="row" i], [class*="post" i], li, tr'
    );
    if (cardCandidate && cardCandidate !== document.body && cardCandidate.parentElement !== document.documentElement) {
      target = cardCandidate;
    }
  }

  hoveredElement = target;
  updateOverlay(target);
}

function updateOverlay(el: Element) {
  if (!overlayEl || !badgeEl) return;

  const rect = el.getBoundingClientRect();
  overlayEl.style.display = 'block';
  overlayEl.style.top = `${rect.top}px`;
  overlayEl.style.left = `${rect.left}px`;
  overlayEl.style.width = `${rect.width}px`;
  overlayEl.style.height = `${rect.height}px`;

  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0] || ''}` : '';
  
  if (currentPickerMode === 'pattern_2click') {
    const prefix = patternStep === 1 ? 'Select Item #1: ' : 'Select Item #2: ';
    badgeEl.textContent = `${prefix}${tag}${id}${cls}`;
  } else {
    badgeEl.textContent = `${tag}${id}${cls} (${Math.round(rect.width)} × ${Math.round(rect.height)})`;
  }
}

function renderBanner() {
  if (!bannerEl) return;

  if (currentPickerMode === 'single') {
    if (currentPickerContext === 'ai_schema') {
      bannerEl.innerHTML = `
        <span class="autoflow-pattern-badge-pill" style="background:#4338ca; border-color:#6366f1; color:#c7d2fe;">✨ AI Schema Mode</span>
        <span>Click any <strong>card or item</strong> to generate its extraction schema with AI</span>
        <span class="autoflow-picker-kbd">Esc</span> to cancel
      `;
      return;
    }
    if (
      currentPickerContext === 'container' ||
      currentPickerContext === 'card_container' ||
      currentPickerContext === 'card'
    ) {
      bannerEl.innerHTML = `
        <span class="autoflow-pattern-badge-pill" style="background:#065f46; border-color:#10b981; color:#a7f3d0;">🎯 Card Container</span>
        <span>Click any <strong>repeating card or item</strong> on the webpage</span>
        <span class="autoflow-picker-kbd">Esc</span> to cancel
      `;
      return;
    }
    if (currentPickerContext === 'field') {
      bannerEl.innerHTML = `
        <span class="autoflow-pattern-badge-pill" style="background:#1e3a8a; border-color:#3b82f6; color:#bfdbfe;">Field Selector</span>
        <span>Click the element on the page for this field</span>
        <span class="autoflow-picker-kbd">Esc</span> to cancel
      `;
      return;
    }
    bannerEl.innerHTML = `
      <span class="autoflow-picker-banner-indicator"></span>
      <span><strong>Element Picker:</strong> Click any element to select it</span>
      <button class="autoflow-pattern-btn-secondary" id="autoflow-toggle-mode" style="margin-left: 6px;">✨ Switch to 2-Click Pattern</button>
      <span class="autoflow-picker-kbd">Esc</span> to cancel
    `;
    bannerEl.querySelector('#autoflow-toggle-mode')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setPickerMode('pattern_2click');
    });
    return;
  }

  // 2-Click Pattern Mode Banners
  if (patternStep === 1) {
    bannerEl.innerHTML = `
      <span class="autoflow-pattern-badge-pill">Step 1 of 2</span>
      <span><strong>Click Item #1</strong> in the repeating list (e.g. 1st card or row)</span>
      <button class="autoflow-pattern-btn-secondary" id="autoflow-toggle-single">Single Mode</button>
      <span class="autoflow-picker-kbd">Esc</span>
    `;
    bannerEl.querySelector('#autoflow-toggle-single')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setPickerMode('single');
    });
  } else if (patternStep === 2) {
    bannerEl.innerHTML = `
      <span class="autoflow-pattern-badge-pill" style="background:#4338ca; border-color:#6366f1; color:#c7d2fe;">Step 2 of 2</span>
      <span>Item #1 set! Now <strong>Click Item #2</strong> (similar item) to discover repeating pattern</span>
      <button class="autoflow-pattern-btn-secondary" id="autoflow-pattern-reset">Reset</button>
      <span class="autoflow-picker-kbd">Esc</span>
    `;
    bannerEl.querySelector('#autoflow-pattern-reset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      resetPatternState();
    });
  } else if (patternStep === 'confirm' && detectedPatternResult) {
    const { matchCount, selector } = detectedPatternResult;
    bannerEl.innerHTML = `
      <span class="autoflow-pattern-badge-pill">✨ ${matchCount} Items Found</span>
      <span style="font-family: monospace; font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${selector}">
        ${selector}
      </span>
      <button class="autoflow-pattern-btn" id="autoflow-pattern-confirm">✓ Confirm Pattern (${matchCount})</button>
      <button class="autoflow-pattern-btn-secondary" id="autoflow-pattern-retry">↺ Re-pick</button>
    `;

    bannerEl.querySelector('#autoflow-pattern-confirm')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmPatternSelection();
    });

    bannerEl.querySelector('#autoflow-pattern-retry')?.addEventListener('click', (e) => {
      e.stopPropagation();
      resetPatternState();
    });
  }
}

function setPickerMode(mode: PickerMode) {
  currentPickerMode = mode;
  resetPatternState();
  renderBanner();
}

function resetPatternState() {
  patternStep = 1;
  if (item1Element) {
    item1Element.classList.remove('autoflow-item1-highlight');
    item1Element = null;
  }
  if (item2Element) {
    item2Element = null;
  }
  for (const el of patternMatchedElements) {
    el.classList.remove('autoflow-pattern-match');
  }
  patternMatchedElements = [];
  detectedPatternResult = null;
  if (overlayEl) overlayEl.style.display = 'none';
  renderBanner();
}

function confirmPatternSelection() {
  if (!detectedPatternResult || !item1Element) return;

  const rect = item1Element.getBoundingClientRect();
  const result: ElementSelectionResult = {
    selector: detectedPatternResult.selector,
    strategies: detectedPatternResult.strategies,
    tagName: item1Element.tagName.toLowerCase(),
    patternMode: true,
    matchCount: detectedPatternResult.matchCount,
    sampleTexts: detectedPatternResult.sampleTexts,
    item1Selector: detectedPatternResult.item1Selector,
    item2Selector: detectedPatternResult.item2Selector,
    textSnippet: detectedPatternResult.sampleTexts[0] || item1Element.textContent?.trim().slice(0, 60),
    rect: {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
  };

  stopElementPicker();
  onPickCallback?.(result);
}

function handleClick(e: MouseEvent) {
  if (!isPickerActive) return;

  // If clicking on banner controls, let event through to buttons
  if (bannerEl?.contains(e.target as Node)) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (!hoveredElement) return;

  // 1. Single Mode: Pick immediately
  if (currentPickerMode === 'single') {
    let pickTarget = hoveredElement;
    if (
      currentPickerContext === 'container' ||
      currentPickerContext === 'card_container' ||
      currentPickerContext === 'card' ||
      currentPickerContext === 'ai_schema'
    ) {
      const cardCandidate = pickTarget.closest<HTMLElement>(
        'article, .Box-row, [class*="Box-row"], [class*="card" i], [class*="product" i], [class*="item" i], [class*="listing" i], [class*="row" i], [class*="post" i], li, tr'
      );
      if (cardCandidate && cardCandidate !== document.body && cardCandidate.parentElement !== document.documentElement) {
        pickTarget = cardCandidate;
      }
    }
    const result = buildElementSelectionResult(pickTarget, currentPickerContext);
    result.context = currentPickerContext;
    result.fieldIndex = currentFieldIndex;
    stopElementPicker();
    onPickCallback?.(result);
    return;
  }

  // 2. Pattern 2-Click Mode
  if (patternStep === 1) {
    item1Element = hoveredElement;
    item1Element.classList.add('autoflow-item1-highlight');
    patternStep = 2;
    renderBanner();
    return;
  }

  if (patternStep === 2) {
    if (hoveredElement === item1Element) {
      // Prompt user to select a second, distinct item in the list
      return;
    }

    item2Element = hoveredElement;
    const result = detectListPattern(item1Element!, item2Element);
    detectedPatternResult = result;

    // Highlight all discovered matching elements
    try {
      const allMatches = Array.from(document.querySelectorAll(result.selector));
      patternMatchedElements = allMatches;
      for (const match of allMatches) {
        match.classList.add('autoflow-pattern-match');
      }
    } catch {
      patternMatchedElements = [item1Element!, item2Element];
      item1Element!.classList.add('autoflow-pattern-match');
      item2Element.classList.add('autoflow-pattern-match');
    }

    // Hide single hover overlay during pattern preview
    if (overlayEl) overlayEl.style.display = 'none';

    patternStep = 'confirm';
    renderBanner();
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isPickerActive) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    stopElementPicker();
    onCancelCallback?.();
  } else if (e.key === 'Enter' && patternStep === 'confirm') {
    e.preventDefault();
    confirmPatternSelection();
  }
}

export function startElementPicker(
  onPick: PickCallback,
  onCancel: CancelCallback,
  mode: PickerMode = 'single',
  context: string = 'selector',
  fieldIndex?: number
) {
  if (isPickerActive) {
    stopElementPicker();
  }

  isPickerActive = true;
  currentPickerMode = mode;
  currentPickerContext = context;
  currentFieldIndex = fieldIndex;
  onPickCallback = onPick;
  onCancelCallback = onCancel;
  patternStep = 1;
  item1Element = null;
  item2Element = null;
  patternMatchedElements = [];
  detectedPatternResult = null;

  // Create overlay element
  overlayEl = document.createElement('div');
  overlayEl.className = 'autoflow-picker-overlay';

  badgeEl = document.createElement('div');
  badgeEl.className = 'autoflow-picker-badge';
  overlayEl.appendChild(badgeEl);

  // Create instructions banner
  bannerEl = document.createElement('div');
  bannerEl.className = 'autoflow-picker-banner';
  renderBanner();

  document.body.appendChild(overlayEl);
  document.body.appendChild(bannerEl);

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
}

export function stopElementPicker() {
  if (!isPickerActive) return;
  isPickerActive = false;

  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);

  if (item1Element) {
    item1Element.classList.remove('autoflow-item1-highlight');
    item1Element = null;
  }
  item2Element = null;

  for (const el of patternMatchedElements) {
    el.classList.remove('autoflow-pattern-match');
  }
  patternMatchedElements = [];
  detectedPatternResult = null;

  overlayEl?.remove();
  bannerEl?.remove();
  overlayEl = null;
  badgeEl = null;
  bannerEl = null;
  hoveredElement = null;
}
