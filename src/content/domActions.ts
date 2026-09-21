import { waitForElement, queryElement, isElementVisible } from '../selectors/finder';
import { InteractiveElement } from '../ai/types';
import { HumanConfig, randomBetween, wait } from '../utils/human';
import {
  approachElement,
  getCursorPosition,
  humanActionPause,
  humanTypingDelay,
  markCursorClick,
  moveCursorTo,
} from './humanizer';
import { matchesText, findMatchingElement, TextMatchOptions } from '../utils/textMatcher';
export { waitForElement, queryElement };

export async function clickElement(
  selector: string,
  params: {
    clickType?: 'left' | 'double' | 'right';
    timeout?: number;
    delay?: number;
    retries?: number;
    human?: HumanConfig;
  } = {},
  signal?: AbortSignal
): Promise<{ success: boolean }> {
  const maxRetries = params.retries ?? 3;
  const human = params.human;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('Click operation aborted.');

    try {
      const waitTimeout = attempt === 0 ? (params.timeout ?? 8000) : 3000;
      const el = await waitForElement(selector, { timeout: waitTimeout, visible: true }, signal);

      // Scroll into view smoothly
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }

      // Highlight briefly
      flashHighlight(el);

      if (params.delay) {
        await new Promise(r => setTimeout(r, params.delay));
      }

      // Human mode: glide the synthetic cursor onto the element and hover a beat
      // before pressing, like a real user aiming at a target.
      if (human) {
        await approachElement(el, human, signal, { pause: attempt === 0 ? undefined : 0 });
      }

      const clickType = params.clickType || 'left';
      const rect = el.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;

      const eventInit: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        button: clickType === 'right' ? 2 : 0,
        buttons: clickType === 'right' ? 2 : 1,
      };

      if (clickType === 'right') {
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        el.dispatchEvent(new MouseEvent('contextmenu', eventInit));
      } else if (clickType === 'double') {
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        el.dispatchEvent(new MouseEvent('click', eventInit));
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        el.dispatchEvent(new MouseEvent('click', eventInit));
        el.dispatchEvent(new MouseEvent('dblclick', eventInit));
      } else {
        // Left click
        try {
          el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        } catch {
          el.dispatchEvent(new MouseEvent('pointerdown', eventInit));
        }
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        if (el instanceof HTMLElement) {
          try {
            el.focus();
          } catch {}
        }
        try {
          el.dispatchEvent(new PointerEvent('pointerup', eventInit));
        } catch {
          el.dispatchEvent(new MouseEvent('pointerup', eventInit));
        }
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        if (el instanceof HTMLElement && typeof el.click === 'function') {
          el.click();
        } else {
          el.dispatchEvent(new MouseEvent('click', eventInit));
        }
      }

      // Human mode: show the press ripple, then linger before the next action.
      if (human) {
        markCursorClick(human);
        await humanActionPause(human, 1.1, signal);
      }

      return { success: true };
    } catch (err: any) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 300));
      }
    }
  }

  throw lastErr || new Error(`Failed to click element "${selector}" after ${maxRetries} retries.`);
}

export function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const isTextArea = element instanceof HTMLTextAreaElement;
  const targetProto = isTextArea
    ? (typeof window !== 'undefined' ? window.HTMLTextAreaElement?.prototype : undefined)
    : (typeof window !== 'undefined' ? window.HTMLInputElement?.prototype : undefined);
  const prototype = Object.getPrototypeOf(element);

  const descriptor = (targetProto && Object.getOwnPropertyDescriptor(targetProto, 'value')) ||
    (prototype && Object.getOwnPropertyDescriptor(prototype, 'value')) ||
    Object.getOwnPropertyDescriptor(element, 'value');

  const tracker = (element as any)._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') {
    try {
      tracker.setValue('');
    } catch {}
  }

  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  // React internal _valueTracker synchronization
  if (tracker && typeof tracker.setValue === 'function') {
    tracker.setValue(value);
  }
}

export function resolveTargetInputElement(initial: Element | null): HTMLElement | null {
  if (!initial) return null;

  // 1. If it's already an editable field or text input
  if (
    initial instanceof HTMLInputElement ||
    initial instanceof HTMLTextAreaElement ||
    (initial instanceof HTMLElement && (
      initial.isContentEditable ||
      initial.getAttribute('contenteditable') === 'true' ||
      initial.getAttribute('role') === 'textbox' ||
      initial.getAttribute('role') === 'combobox' ||
      initial.getAttribute('role') === 'searchbox'
    ))
  ) {
    return initial;
  }

  // 2. Check shadowRoot if present (Web Components / custom inputs)
  if (initial.shadowRoot) {
    const shadowInput = initial.shadowRoot.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"], [role="textbox"]'
    );
    if (shadowInput) return shadowInput;
  }

  // 3. If it's a label with htmlFor
  if (initial instanceof HTMLLabelElement && initial.htmlFor) {
    const target = document.getElementById(initial.htmlFor);
    if (target) return resolveTargetInputElement(target);
  }

  // 4. Search children for the actual input or contenteditable
  const childInput = initial.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"]'
  );
  if (childInput) return childInput;

  // 5. Search closest ancestor if clicked inside an icon/span/wrapper
  const closestInput = initial.closest<HTMLElement>(
    'input, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"], label, form, .relative, div[class*="input"], div[class*="search"]'
  );
  if (closestInput && closestInput !== initial) {
    return resolveTargetInputElement(closestInput);
  }

  return initial instanceof HTMLElement ? initial : null;
}

export function activateElementForTyping(el: HTMLElement): void {
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch {}
  flashHighlight(el);

  try {
    el.focus({ preventScroll: true });
  } catch {}

  const rect = el.getBoundingClientRect();
  const clientX = Math.max(0, rect.left + rect.width / 2);
  const clientY = Math.max(0, rect.top + rect.height / 2);

  const mouseInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
  };

  try {
    el.dispatchEvent(new PointerEvent('pointerdown', mouseInit));
    el.dispatchEvent(new MouseEvent('mousedown', mouseInit));
    el.focus();
    el.dispatchEvent(new PointerEvent('pointerup', mouseInit));
    el.dispatchEvent(new MouseEvent('mouseup', mouseInit));
    el.dispatchEvent(new MouseEvent('click', mouseInit));
  } catch {}
}

export function clearElementValue(el: HTMLElement): void {
  activateElementForTyping(el);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    try {
      el.setSelectionRange(0, el.value.length);
    } catch {}
    setNativeInputValue(el, '');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward', data: null }));
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  } else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('delete');
    } catch {}
    if (el.textContent) {
      el.textContent = '';
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward', data: null }));
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }
}

export async function performRobustTyping(
  el: HTMLElement,
  text: string,
  options: {
    clearFirst?: boolean;
    typingDelay?: number;
    pressEnter?: boolean;
    signal?: AbortSignal;
    human?: HumanConfig;
  } = {}
): Promise<{ success: boolean }> {
  activateElementForTyping(el);

  if (options.clearFirst) {
    clearElementValue(el);
  }

  const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const isEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
  const delay = options.typingDelay || 0;
  const human = options.human;

  // Human mode: settle onto the field before the first keystroke.
  if (human) {
    await humanActionPause(human, 0.9, options.signal);
  }

  // 1. Character-by-character realistic input
  for (let i = 0; i < text.length; i++) {
    if (options.signal?.aborted) throw new Error('Typing aborted.');
    const char = text[i];
    const isLetter = /^[a-zA-Z]$/.test(char);
    const code = isLetter ? `Key${char.toUpperCase()}` : (/^[0-9]$/.test(char) ? `Digit${char}` : (char === ' ' ? 'Space' : ''));

    const keyInit: KeyboardEventInit = {
      key: char,
      code,
      bubbles: true,
      cancelable: true,
      composed: true,
    };

    el.dispatchEvent(new KeyboardEvent('keydown', keyInit));
    el.dispatchEvent(new KeyboardEvent('keypress', keyInit));

    let charInserted = false;

    if (isInput) {
      const input = el as HTMLInputElement | HTMLTextAreaElement;
      let start = input.value.length;
      let end = input.value.length;
      try {
        if (input.selectionStart !== null && input.selectionStart !== undefined) {
          start = input.selectionStart;
          end = input.selectionEnd ?? start;
        }
      } catch {
        // HTMLInputElement.selectionStart throws on type="number", "email", "date" etc. in Chrome
      }
      const current = input.value || '';
      const nextVal = current.substring(0, start) + char + current.substring(end);
      setNativeInputValue(input, nextVal);
      try {
        input.setSelectionRange?.(start + 1, start + 1);
      } catch {}
      input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, cancelable: false, data: char, inputType: 'insertText' }));
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      charInserted = true;
    } else if (isEditable) {
      try {
        charInserted = document.execCommand('insertText', false, char);
      } catch {}
      if (!charInserted) {
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, cancelable: true, data: char, inputType: 'insertText' }));
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(char);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          el.textContent = (el.textContent || '') + char;
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, cancelable: false, data: char, inputType: 'insertText' }));
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    }

    el.dispatchEvent(new KeyboardEvent('keyup', keyInit));

    // Explicit per-node typingDelay always wins; otherwise Human Mode paces the keystrokes.
    const stepDelay = delay > 0 ? delay : human ? humanTypingDelay(human, char) : 0;
    if (stepDelay > 0) {
      await new Promise(r => setTimeout(r, stepDelay));
    }
  }

  if (isInput) {
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true }));
  }

  // 2. Self-Healing Verification
  let verificationPassed = false;
  if (isInput) {
    verificationPassed = (el as HTMLInputElement | HTMLTextAreaElement).value.includes(text);
  } else if (isEditable) {
    verificationPassed = (el.innerText || el.textContent || '').includes(text);
  } else {
    verificationPassed = true;
  }

  if (!verificationPassed) {
    // Fallback A: Atomic native set for input elements
    if (isInput) {
      setNativeInputValue(el as HTMLInputElement | HTMLTextAreaElement, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      verificationPassed = (el as HTMLInputElement | HTMLTextAreaElement).value.includes(text);
    }
    // Fallback B: execCommand insertText
    if (!verificationPassed) {
      try {
        el.focus();
        document.execCommand('insertText', false, text);
        verificationPassed = isInput
          ? (el as HTMLInputElement | HTMLTextAreaElement).value.includes(text)
          : (el.innerText || el.textContent || '').includes(text);
      } catch {}
    }
    // Fallback C: Clipboard paste
    if (!verificationPassed) {
      await pasteIntoElement({ text });
    }
  }

  // 3. Handle Enter submission if requested
  if (options.pressEnter) {
    // Human mode: a beat between finishing the text and hitting Enter.
    await new Promise(r => setTimeout(r, human ? Math.max(90, Math.round(human.actionPauseMax * 1.2)) : 60));
    const enterInit: KeyboardEventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new KeyboardEvent('keydown', enterInit));
    el.dispatchEvent(new KeyboardEvent('keypress', enterInit));
    el.dispatchEvent(new KeyboardEvent('keyup', enterInit));

    const form = el.closest('form');
    if (form) {
      const submitBtn = form.querySelector<HTMLElement>('button[type="submit"], input[type="submit"], button:not([type])');
      if (submitBtn) {
        try {
          submitBtn.click();
        } catch {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }
      } else {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }
    }
  }

  return { success: true };
}

export async function typeText(
  selector: string,
  params: {
    text: string;
    clearExisting?: boolean;
    typingDelay?: number;
    timeout?: number;
    pressEnter?: boolean;
    human?: HumanConfig;
  },
  signal?: AbortSignal
): Promise<{ success: boolean }> {
  const rawEl = await waitForElement(selector, { timeout: params.timeout ?? 10000, visible: true }, signal);
  const el = resolveTargetInputElement(rawEl) || (rawEl as HTMLElement);

  // Human mode: travel the cursor to the field before typing into it.
  if (params.human) {
    await approachElement(el, params.human, signal, { center: false, pause: 0 });
  }

  return await performRobustTyping(el, params.text, {
    clearFirst: params.clearExisting,
    typingDelay: params.typingDelay,
    pressEnter: params.pressEnter,
    signal,
    human: params.human,
  });
}

export async function clearInput(
  selector: string,
  timeout = 10000,
  signal?: AbortSignal,
  human?: HumanConfig
): Promise<{ success: boolean }> {
  const rawEl = await waitForElement(selector, { timeout, visible: true }, signal);
  const el = resolveTargetInputElement(rawEl) || (rawEl as HTMLElement);
  if (human) {
    await approachElement(el, human, signal, { center: false, pause: 0 });
  }
  flashHighlight(el);
  clearElementValue(el);
  if (human) {
    await humanActionPause(human, 1, signal);
  }
  return { success: true };
}

export async function hoverElement(
  selector: string,
  timeout = 10000,
  signal?: AbortSignal,
  human?: HumanConfig
): Promise<{ success: boolean }> {
  const el = await waitForElement(selector, { timeout, visible: true }, signal);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashHighlight(el);

  // Human mode: approach along a curved path first, so the page sees the
  // intermediate mousemove events a real pointer would generate.
  if (human) {
    await approachElement(el, human, signal);
  }

  const rect = el.getBoundingClientRect();
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  el.dispatchEvent(new MouseEvent('mouseover', init));
  el.dispatchEvent(new MouseEvent('mouseenter', init));
  el.dispatchEvent(new MouseEvent('mousemove', init));

  if (human) {
    // Dwell on the hovered element for a moment, like a user inspecting it.
    await humanActionPause(human, 1.4, signal);
  }
  return { success: true };
}

let inMemoryClipboard = '';

export async function pressKey(
  keyInput: string,
  selectorOrOptions?: string | { selector?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean },
  modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {},
  human?: HumanConfig,
  signal?: AbortSignal
): Promise<{ success: boolean }> {
  let selector: string | undefined;
  const effectiveModifiers = { ...modifiers };

  if (typeof selectorOrOptions === 'string') {
    selector = selectorOrOptions;
  } else if (selectorOrOptions && typeof selectorOrOptions === 'object') {
    selector = selectorOrOptions.selector;
    if (selectorOrOptions.ctrl !== undefined) effectiveModifiers.ctrl = selectorOrOptions.ctrl;
    if (selectorOrOptions.alt !== undefined) effectiveModifiers.alt = selectorOrOptions.alt;
    if (selectorOrOptions.shift !== undefined) effectiveModifiers.shift = selectorOrOptions.shift;
    if (selectorOrOptions.meta !== undefined) effectiveModifiers.meta = selectorOrOptions.meta;
  }

  let target = selector ? queryElement(selector) : null;
  if (!target) target = document.activeElement || document.body;

  // Human mode: land on the field and pause before the keystroke.
  if (human && target) {
    await approachElement(target, human, signal, { pause: 0 });
    await humanActionPause(human, 1, signal);
  }

  if (target instanceof HTMLElement && target !== document.body) {
    target.focus();
  }

  // Parse shortcut combinations if keyInput contains '+' (e.g. "ctrl+v", "Control+v", "Cmd+V", "Ctrl+Shift+A")
  let effectiveKey = keyInput;

  if (keyInput && keyInput.includes('+')) {
    const parts = keyInput.split('+').map(p => p.trim().toLowerCase());
    effectiveKey = parts[parts.length - 1]; // last item is the actual key
    for (let i = 0; i < parts.length - 1; i++) {
      const mod = parts[i];
      if (mod === 'ctrl' || mod === 'control') effectiveModifiers.ctrl = true;
      if (mod === 'alt' || mod === 'option') effectiveModifiers.alt = true;
      if (mod === 'shift') effectiveModifiers.shift = true;
      if (mod === 'meta' || mod === 'cmd' || mod === 'command') effectiveModifiers.meta = true;
    }
  }

  const isCtrlOrMeta = effectiveModifiers.ctrl || effectiveModifiers.meta;
  const lowerKey = effectiveKey ? effectiveKey.toLowerCase() : '';

  // Special shortcut: Ctrl+V (Paste)
  if (isCtrlOrMeta && lowerKey === 'v') {
    return await pasteIntoElement({ selector, text: inMemoryClipboard });
  }

  // Special shortcut: Ctrl+C (Copy)
  if (isCtrlOrMeta && lowerKey === 'c') {
    let textToCopy = window.getSelection()?.toString() || '';
    if (!textToCopy && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? target.value.length;
      textToCopy = target.value.substring(start, end) || target.value;
    }
    if (textToCopy) {
      await copyToClipboard(textToCopy);
    }
    return { success: true };
  }

  // Special shortcut: Ctrl+A (Select All)
  if (isCtrlOrMeta && lowerKey === 'a') {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.select();
    } else {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  const isLetter = effectiveKey.length === 1;
  const init: KeyboardEventInit = {
    key: isLetter ? effectiveKey : (effectiveKey.charAt(0).toUpperCase() + effectiveKey.slice(1)),
    code: isLetter ? `Key${effectiveKey.toUpperCase()}` : effectiveKey,
    bubbles: true,
    cancelable: true,
    ctrlKey: !!effectiveModifiers.ctrl,
    altKey: !!effectiveModifiers.alt,
    shiftKey: !!effectiveModifiers.shift,
    metaKey: !!effectiveModifiers.meta,
  };

  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keypress', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));

  return { success: true };
}

export async function scrollPage(params: {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number | 'page';
  selector?: string;
  smooth?: boolean;
  human?: HumanConfig;
  signal?: AbortSignal;
}): Promise<{ success: boolean }> {
  const target = params.selector ? queryElement(params.selector) : null;
  const direction = params.direction || 'down';
  const behavior: ScrollBehavior = params.smooth !== false ? 'smooth' : 'auto';

  let dx = 0;
  let dy = 0;
  const scrollAmount = params.amount === 'page' ? window.innerHeight : (typeof params.amount === 'number' ? params.amount : 400);

  if (direction === 'down') dy = scrollAmount;
  if (direction === 'up') dy = -scrollAmount;
  if (direction === 'right') dx = scrollAmount;
  if (direction === 'left') dx = -scrollAmount;

  // Human mode: break one big jump into several wheel-sized nudges, so the page
  // sees a series of scroll events (lazy-loaded content behaves more naturally).
  if (params.human) {
    const human = params.human;
    const steps = Math.min(8, Math.max(3, Math.round((Math.abs(dy) + Math.abs(dx)) / 160)));
    const stepX = dx / steps;
    const stepY = dy / steps;

    // Drift the cursor slightly while scrolling, like a hand on the wheel.
    if (human.cursor) {
      const base = getCursorPosition();
      await moveCursorTo(
        {
          x: Math.min(window.innerWidth - 20, Math.max(20, base.x + (Math.random() * 30 - 15))),
          y: Math.min(window.innerHeight - 20, Math.max(20, base.y + (Math.random() * 24 - 12))),
        },
        human,
        params.signal
      );
    }

    for (let i = 0; i < steps; i++) {
      if (params.signal?.aborted) break;
      if (target) {
        target.scrollBy({ left: stepX, top: stepY, behavior });
      } else {
        window.scrollBy({ left: stepX, top: stepY, behavior });
      }
      await wait(randomBetween(40, 130), params.signal);
    }

    await humanActionPause(human, 1, params.signal);
    return { success: true };
  }

  if (target) {
    target.scrollBy({ left: dx, top: dy, behavior });
  } else {
    window.scrollBy({ left: dx, top: dy, behavior });
  }

  return { success: true };
}

export async function selectDropdown(
  selector: string,
  params: {
    selectionType?: 'value' | 'label' | 'index';
    value?: string;
    label?: string;
    index?: number;
    timeout?: number;
    human?: HumanConfig;
  },
  signal?: AbortSignal
): Promise<{ success: boolean; selectedValue: string }> {
  const el = await waitForElement(selector, { timeout: params.timeout ?? 10000, visible: true }, signal);
  flashHighlight(el);

  // Human mode: move onto the control and pause before choosing an option.
  if (params.human) {
    await approachElement(el, params.human, signal);
  }

  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Element ${selector} is not a <select> element.`);
  }

  let matchedOption: HTMLOptionElement | null = null;
  const options = Array.from(el.options);

  if (params.selectionType === 'index' && typeof params.index === 'number') {
    matchedOption = options[params.index] || null;
  } else if (params.selectionType === 'label' && params.label) {
    matchedOption = options.find(o => o.text.trim().toLowerCase() === params.label?.trim().toLowerCase()) || null;
  } else if (params.value) {
    matchedOption = options.find(o => o.value === params.value) || null;
  }

  if (!matchedOption && options.length > 0) {
    matchedOption = options[0];
  }

  if (matchedOption) {
    el.value = matchedOption.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (params.human) {
      markCursorClick(params.human);
      await humanActionPause(params.human, 1.2, signal);
    }
    return { success: true, selectedValue: matchedOption.value };
  }

  throw new Error(`Could not find matching option in <select> dropdown.`);
}

/**
 * Non-throwing presence check for the "Contains" logic node.
 * Reports whether the given selector currently matches an element on the page
 * (CSS, XPath `//...`, or `:has-text("...")`), optionally waiting up to
 * `timeout` ms for it to appear and optionally requiring visibility.
 */
export async function checkElementPresence(
  selector: string,
  params: {
    timeout?: number;
    visibleOnly?: boolean;
    text?: string;
    matchMode?: 'exact' | 'partial';
    caseSensitive?: boolean;
  } = {},
  signal?: AbortSignal
): Promise<{ present: boolean; matchedText?: string; reason?: string }> {
  const timeout = Math.max(0, params.timeout ?? 5000);
  const visibleOnly = params.visibleOnly !== false;
  const expectedText = params.text ? String(params.text) : '';
  const matchMode = params.matchMode || 'partial';
  const caseSensitive = params.caseSensitive === true;
  const pollInterval = 100;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      if (signal?.aborted) {
        resolve({ present: false, reason: 'aborted' });
        return;
      }

      // If selector is empty or 'body', perform whole-page text search
      const isWholePage = !selector || selector.trim() === '' || selector.trim().toLowerCase() === 'body';

      if (isWholePage && expectedText) {
        const root = document.body || document.documentElement;
        if (root) {
          const matchedEl = findMatchingElement(root, expectedText, { matchMode, caseSensitive });
          if (matchedEl) {
            if (matchedEl instanceof Element) flashHighlight(matchedEl);
            resolve({ present: true, matchedText: (matchedEl.textContent || '').trim().slice(0, 200) });
            return;
          }
        }
      } else {
        let el: Element | null = null;
        try {
          el = queryElement(selector);
        } catch {
          el = null;
        }

        if (el && (!visibleOnly || isElementVisible(el))) {
          if (expectedText) {
            const matchedEl = findMatchingElement(el, expectedText, { matchMode, caseSensitive });
            if (matchedEl) {
              if (matchedEl instanceof Element) flashHighlight(matchedEl);
              resolve({ present: true, matchedText: (matchedEl.textContent || '').trim().slice(0, 200) });
              return;
            }
          } else {
            flashHighlight(el);
            resolve({ present: true, matchedText: (el.textContent || '').trim().slice(0, 200) });
            return;
          }
        }
      }

      if (Date.now() - startTime >= timeout) {
        resolve({ present: false, reason: 'not_found' });
        return;
      }

      setTimeout(check, pollInterval);
    };

    check();
  });
}

/**
 * Helper to convert relative URLs to absolute URLs using current document location
 */
export function toAbsoluteUrl(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  try {
    const base = typeof window !== 'undefined' && window.location?.href ? window.location.href : 'http://localhost';
    return new URL(trimmed, base).href;
  } catch {
    return trimmed;
  }
}

/**
 * Smart attribute resolver that handles:
 * - Image URLs ('src', 'image', 'image_url', 'img'): handles <img> (currentSrc, src, data-src, data-lazy-src, data-original, srcset), nested <img> in container, CSS background-image
 * - Link URLs ('href', 'link', 'url'): resolves absolute URLs, checks nested <a>
 * - Paragraphs / multi-text ('paragraphs', 'all_text', 'text_all'): aggregates all <p> or child text
 * - Form values ('value'): input, textarea, select
 * - HTML ('innerHTML', 'outerHTML')
 * - Standard and custom attributes ('data-*', 'title', 'alt', 'aria-label', etc.)
 */
/**
 * Cleans and extracts visible human-readable text from an element,
 * stripping internal scripts/styles/SVGs, checking innerText, and falling back
 * to aria-label, title, or child alt attributes if text is empty.
 */
export function extractCleanText(el: Element): string {
  if (!el) return '';

  // Direct textContent
  let raw = (el.textContent || '').trim();

  // If element contains script, style, noscript, or svg, strip them using a clone to get pure text
  if (el.querySelector('script, style, noscript, svg')) {
    try {
      const clone = el.cloneNode(true) as Element;
      const junk = clone.querySelectorAll('script, style, noscript, svg');
      junk.forEach((j) => j.remove());
      raw = (clone.textContent || '').trim();
    } catch {}
  }

  // Fallback 1: innerText if textContent is empty or whitespace
  if (!raw && 'innerText' in el) {
    raw = String((el as HTMLElement).innerText || '').trim();
  }

  // Fallback 2: aria-label, title, or alt on the element itself
  if (!raw) {
    raw = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '';
  }

  // Fallback 3: check child elements with aria-label, title, or img[alt]
  if (!raw) {
    const childWithText = el.querySelector('[aria-label], [title], img[alt]');
    if (childWithText) {
      raw = childWithText.getAttribute('aria-label') ||
            childWithText.getAttribute('title') ||
            childWithText.getAttribute('alt') || '';
    }
  }

  // Clean up whitespace: normalize internal newlines/spaces
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Smart attribute resolver that handles:
 * - Image URLs ('src', 'image', 'image_url', 'img'): handles <img> (currentSrc, src, data-src, data-lazy-src, data-original, srcset), nested <img> in container, CSS background-image
 * - Link URLs ('href', 'link', 'url'): resolves absolute URLs, checks nested <a>
 * - Paragraphs / multi-text ('paragraphs', 'all_text', 'text_all'): aggregates all <p> or child text
 * - Form values ('value'): input, textarea, select
 * - HTML ('innerHTML', 'outerHTML')
 * - Standard and custom attributes ('data-*', 'title', 'alt', 'aria-label', etc.)
 */
export function resolveElementAttribute(el: Element, attributeType?: string): string {
  if (!el) return '';
  const attr = (attributeType || 'text').trim().toLowerCase();

  // 1. Text & Paragraphs
  if (attr === 'text' || attr === 'innertext' || attr === 'textcontent' || !attributeType) {
    return extractCleanText(el);
  }

  if (attr === 'paragraphs' || attr === 'all_paragraphs' || attr === 'all_text' || attr === 'text_all') {
    const pEls = Array.from(el.querySelectorAll('p'));
    if (pEls.length > 0) {
      return pEls.map(p => extractCleanText(p)).filter(Boolean).join('\n\n');
    }
    const liEls = Array.from(el.querySelectorAll('li'));
    if (liEls.length > 0) {
      return liEls.map(li => `• ${extractCleanText(li)}`).filter(Boolean).join('\n');
    }
    return extractCleanText(el);
  }

  // 2. Image URL (Smart fallback for lazy loading, data-src, srcset, background-image)
  if (attr === 'src' || attr === 'image' || attr === 'image_url' || attr === 'img') {
    let imgEl: HTMLImageElement | null = null;
    if (el instanceof HTMLImageElement || el.tagName.toLowerCase() === 'img') {
      imgEl = el as HTMLImageElement;
    } else {
      imgEl = el.querySelector('img');
    }

    if (imgEl) {
      // Check data-src / data-lazy / data-original (common lazy loaders)
      const dataSrc = imgEl.getAttribute('data-src') ||
        imgEl.getAttribute('data-original') ||
        imgEl.getAttribute('data-lazy-src') ||
        imgEl.getAttribute('data-url');
      if (dataSrc && !dataSrc.startsWith('data:image')) {
        return toAbsoluteUrl(dataSrc);
      }

      // Check srcset (pick highest resolution candidate)
      const srcset = imgEl.getAttribute('srcset');
      if (srcset) {
        const candidates = srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
        if (candidates.length > 0) {
          return toAbsoluteUrl(candidates[candidates.length - 1]);
        }
      }

      // Check direct src / currentSrc
      const directSrc = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src');
      if (directSrc && !directSrc.startsWith('data:image/svg+xml') && !directSrc.startsWith('data:image/gif')) {
        return toAbsoluteUrl(directSrc);
      }

      if (dataSrc) return toAbsoluteUrl(dataSrc);
    }

    // Check CSS background-image (inline or computed)
    const inlineBg = (el as HTMLElement).style?.backgroundImage;
    let computedBg = '';
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      try {
        computedBg = window.getComputedStyle(el).backgroundImage;
      } catch {}
    }
    const bg = inlineBg || computedBg;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\(['"]?(.*?)['"]?\)/i);
      if (match && match[1]) {
        return toAbsoluteUrl(match[1]);
      }
    }

    // Raw attribute fallback
    const rawSrc = el.getAttribute('src');
    if (rawSrc) return toAbsoluteUrl(rawSrc);
    return '';
  }

  // 3. Link URL (href)
  if (attr === 'href' || attr === 'link' || attr === 'url') {
    let anchor: HTMLAnchorElement | null = null;
    if (el instanceof HTMLAnchorElement || el.tagName.toLowerCase() === 'a') {
      anchor = el as HTMLAnchorElement;
    } else {
      anchor = el.querySelector('a[href]');
    }

    if (anchor && anchor.href) {
      return anchor.href;
    }

    const rawHref = el.getAttribute('href');
    if (rawHref) return toAbsoluteUrl(rawHref);
    return '';
  }

  // 4. Form values
  if (attr === 'value') {
    if ('value' in el) {
      return String((el as HTMLInputElement).value ?? '');
    }
    return el.getAttribute('value') || '';
  }

  // 5. HTML Content
  if (attr === 'html' || attr === 'outerhtml') {
    return el.outerHTML;
  }
  if (attr === 'innerhtml') {
    return el.innerHTML;
  }

  // 6. Standard and custom attributes (data-*, title, alt, aria-label, etc.)
  return el.getAttribute(attributeType || '') || (el as any)[attributeType || ''] || '';
}

export async function extractText(selector: string, timeout = 10000, signal?: AbortSignal): Promise<{ text: string }> {
  const el = await waitForElement(selector, { timeout }, signal);
  flashHighlight(el);
  let text = resolveElementAttribute(el, 'text');
  // If first matched element is empty, check other elements matching selector for non-empty text
  if (!text) {
    const allMatches = safeQueryElements(document, selector);
    for (const candidate of allMatches) {
      const candidateText = resolveElementAttribute(candidate, 'text');
      if (candidateText && candidateText.trim() !== '') {
        flashHighlight(candidate);
        text = candidateText;
        break;
      }
    }
  }
  return { text };
}

export async function extractAttribute(selector: string, attribute: string, timeout = 10000, signal?: AbortSignal): Promise<{ value: string | null }> {
  const el = await waitForElement(selector, { timeout }, signal);
  flashHighlight(el);
  const val = resolveElementAttribute(el, attribute);
  return { value: val };
}

export async function extractHtml(selector: string, mode: 'outer' | 'inner' = 'outer', timeout = 10000, signal?: AbortSignal): Promise<{ html: string }> {
  const el = await waitForElement(selector, { timeout }, signal);
  flashHighlight(el);
  return { html: mode === 'inner' ? el.innerHTML : el.outerHTML };
}

export async function extractTable(selector: string, timeout = 10000, signal?: AbortSignal): Promise<{ rows: Record<string, string>[] }> {
  const el = await waitForElement(selector, { timeout }, signal);
  flashHighlight(el);

  if (!(el instanceof HTMLTableElement) && el.tagName.toLowerCase() !== 'table') {
    const tableEl = el.querySelector('table');
    if (!tableEl) throw new Error(`Element is not a table and does not contain a table.`);
    return parseTableElement(tableEl);
  }

  return parseTableElement(el as HTMLTableElement);
}

function parseTableElement(table: HTMLTableElement): { rows: Record<string, string>[] } {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return { rows: [] };

  // Determine headers
  const headerCells = rows[0].querySelectorAll('th, td');
  const headers = Array.from(headerCells).map((cell, idx) => {
    const text = cell.textContent?.trim();
    return text && text.length > 0 ? text : `col_${idx + 1}`;
  });

  const dataRows: Record<string, string>[] = [];
  const startIdx = rows[0].querySelectorAll('th').length > 0 ? 1 : 0;

  for (let i = startIdx; i < rows.length; i++) {
    const cells = Array.from(rows[i].querySelectorAll('td, th'));
    if (cells.length === 0) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cells[idx]?.textContent?.trim() || '';
    });
    dataRows.push(rowObj);
  }

  return { rows: dataRows };
}

export async function waitForText(
  text: string,
  selector?: string,
  timeout = 10000,
  signal?: AbortSignal,
  options: { matchMode?: 'exact' | 'partial'; caseSensitive?: boolean } = {}
): Promise<{ success: boolean; matchedText?: string }> {
  const startTime = Date.now();
  const pollInterval = 100;
  const matchMode = options.matchMode || 'partial';
  const caseSensitive = options.caseSensitive === true;

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) return reject(new Error('Wait for text aborted.'));

      let root: Element | null = null;
      if (selector) {
        try {
          root = queryElement(selector);
        } catch {
          root = null;
        }
      } else {
        root = document.body || document.documentElement;
      }

      if (root) {
        const matchedEl = findMatchingElement(root, text, { matchMode, caseSensitive });
        if (matchedEl) {
          if (matchedEl instanceof Element) flashHighlight(matchedEl);
          return resolve({ success: true, matchedText: (matchedEl.textContent || '').trim().slice(0, 200) });
        }
      }

      if (Date.now() - startTime >= timeout) {
        return reject(
          new Error(
            `Timed out after ${timeout}ms waiting for text: "${text}" (${matchMode === 'exact' ? 'Exact Match' : 'Partial Match'}, ${
              caseSensitive ? 'Case Sensitive' : 'Case Insensitive'
            }${selector ? ` within "${selector}"` : ''})`
          )
        );
      }
      setTimeout(check, pollInterval);
    };
    check();
  });
}

export async function extractMultipleElements(
  selector: string,
  params: { attribute?: string; timeout?: number } = {},
  signal?: AbortSignal
): Promise<{ items: string[] }> {
  const timeout = params.timeout || 10000;
  const startTime = Date.now();
  const pollInterval = 100;

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) return reject(new Error('Extract multiple aborted.'));
      const elements = Array.from(document.querySelectorAll(selector));
      if (elements.length > 0) {
        elements.slice(0, 3).forEach(el => flashHighlight(el));
        const items = elements.map(el => resolveElementAttribute(el, params.attribute || 'text'));
        return resolve({ items });
      }

      if (Date.now() - startTime >= timeout) {
        return resolve({ items: [] });
      }
      setTimeout(check, pollInterval);
    };
    check();
  });
}

export interface ExtractDatasetField {
  name: string;
  selector?: string;
  attribute?: string;
}

function matchesSafe(el: Element, sel: string): boolean {
  if (!el || !sel || !sel.trim()) return false;
  try {
    return el.matches(sel);
  } catch {
    return false;
  }
}

export function safeQueryElements(root: ParentNode, sel: string): Element[] {
  if (!sel || !sel.trim()) return [];
  const results: Element[] = [];

  // If root is itself an Element matching the selector, include it as candidate
  if (root instanceof Element && matchesSafe(root, sel)) {
    results.push(root);
  }

  try {
    const queried = Array.from(root.querySelectorAll(sel));
    for (const q of queried) {
      if (!results.includes(q)) {
        results.push(q);
      }
    }
    return results;
  } catch {
    try {
      if (sel.startsWith('//') || sel.startsWith('(')) {
        const doc = root instanceof Document ? root : root.ownerDocument || document;
        const res = doc.evaluate(sel, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < res.snapshotLength; i++) {
          const item = res.snapshotItem(i);
          if (item instanceof Element && !results.includes(item)) {
            results.push(item);
          }
        }
        return results;
      }
    } catch {}
    return results;
  }
}

export function safeQuerySingleElement(root: ParentNode, sel: string): Element | null {
  if (!sel || !sel.trim()) return null;
  const list = safeQueryElements(root, sel);
  return list[0] || null;
}

/**
 * Robustly extracts a field from a card container element.
 * - Iterates through all matching elements, finding the first that yields a non-empty value.
 * - If selector is a bare heading tag (h3, h4, etc.) or title field and returns empty,
 *   smartly falls back to sibling headings (h1-h6, [role="heading"], .title) with text.
 * - Handles nested links and images when extracted attribute is href/src.
 */
export function extractFieldFromElement(
  container: Element,
  field: ExtractDatasetField
): string {
  if (!container) return '';
  const attrType = (field.attribute || 'text').trim().toLowerCase();
  const rawSel = (field.selector || '').trim();

  // Paragraphs / multi-text aggregation mode
  if (attrType === 'paragraphs' || attrType === 'all_paragraphs') {
    const pEls = safeQueryElements(container, rawSel || 'p');
    if (pEls.length > 0) {
      const texts = pEls.map(p => resolveElementAttribute(p, 'text')).filter(Boolean);
      if (texts.length > 0) return texts.join('\n\n');
    }
    const liEls = safeQueryElements(container, 'li');
    if (liEls.length > 0) {
      const texts = liEls.map(li => `• ${resolveElementAttribute(li, 'text')}`).filter(Boolean);
      if (texts.length > 0) return texts.join('\n');
    }
  }

  // If no selector provided, extract directly from container
  if (!rawSel) {
    return resolveElementAttribute(container, attrType);
  }

  // 1. Direct query within container
  const candidateEls = safeQueryElements(container, rawSel);

  // Check candidate elements in order, finding the first that yields a non-empty value
  for (const el of candidateEls) {
    const val = resolveElementAttribute(el, attrType);
    if (val && val.trim() !== '') {
      return val;
    }
  }

  // 2. Heading fallback for text fields (handles h3, h4, h2, h1, etc.)
  const isHeadingTarget =
    /\b(h1|h2|h3|h4|h5|h6)\b/i.test(rawSel) ||
    /^(title|headline|name|heading|product|header)/i.test(field.name || '');

  if (isHeadingTarget && (attrType === 'text' || attrType === 'innertext' || attrType === 'textcontent')) {
    const headingFallbacks = [
      'h3',
      'h4',
      'h2',
      'h1',
      'h5',
      'h6',
      'h3 a',
      'h4 a',
      'h2 a',
      '[role="heading"]',
      'header',
      '.title',
      '[class*="title" i]',
      '[class*="name" i]',
      '[class*="heading" i]',
      'strong',
      'b',
    ];

    for (const hSel of headingFallbacks) {
      if (hSel.toLowerCase() === rawSel.toLowerCase()) continue;
      const fallbackEls = safeQueryElements(container, hSel);
      for (const el of fallbackEls) {
        const val = resolveElementAttribute(el, 'text');
        if (val && val.trim() !== '') {
          return val;
        }
      }
    }
  }

  // 3. Fallback for link/href when selector targeted a heading or container
  if ((attrType === 'href' || attrType === 'link' || attrType === 'url') && candidateEls.length > 0) {
    for (const el of candidateEls) {
      const aEl = el.querySelector('a[href]');
      if (aEl) {
        const href = resolveElementAttribute(aEl, 'href');
        if (href && href.trim() !== '') return href;
      }
    }
  }

  // 4. Fallback for image/src when selector targeted a container
  if ((attrType === 'src' || attrType === 'image' || attrType === 'image_url') && candidateEls.length > 0) {
    for (const el of candidateEls) {
      const imgEl = el.querySelector('img, picture source');
      if (imgEl) {
        const src = resolveElementAttribute(imgEl, 'src');
        if (src && src.trim() !== '') return src;
      }
    }
  }

  // 5. If candidates were found but returned empty string, return the first candidate's raw result
  if (candidateEls.length > 0) {
    return resolveElementAttribute(candidateEls[0], attrType) || '';
  }

  return '';
}

export async function extractDataset(
  params: {
    containerSelector?: string;
    fields: ExtractDatasetField[];
    timeout?: number;
    excludeEmpty?: boolean;
    filterEmptyMode?: 'any' | 'all';
  },
  signal?: AbortSignal
): Promise<{ success: boolean; items: Record<string, any>[]; rowCount: number; headers: string[] }> {
  const timeout = params.timeout || 10000;
  const startTime = Date.now();
  const pollInterval = 100;
  const fields = params.fields && params.fields.length > 0 ? params.fields : [{ name: 'value', selector: '' }];
  const headers = fields.map((f) => f.name || 'field');

  const filterEmptyRows = (dataRows: Record<string, any>[]): Record<string, any>[] => {
    if (!params.excludeEmpty) return dataRows;
    const mode = params.filterEmptyMode || 'any';
    const isValEmpty = (v: any) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
    return dataRows.filter((row) => {
      if (!row || typeof row !== 'object') return false;
      const keys = headers.length > 0 ? headers : Object.keys(row);
      if (keys.length === 0) return false;
      if (mode === 'any') {
        return !keys.some((k) => isValEmpty(row[k]));
      } else {
        return !keys.every((k) => isValEmpty(row[k]));
      }
    });
  };

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) return reject(new Error('Extract dataset aborted.'));

      if (params.containerSelector) {
        // Mode 1: Extract from container elements (e.g. .product-card, tr)
        const containers = safeQueryElements(document, params.containerSelector);
        if (containers.length > 0) {
          containers.slice(0, 3).forEach((el) => flashHighlight(el));
          const items: Record<string, any>[] = containers.map((container) => {
            const row: Record<string, any> = {};
            for (const field of fields) {
              row[field.name] = extractFieldFromElement(container, field);
            }
            return row;
          });
          const finalItems = filterEmptyRows(items);
          return resolve({ success: true, items: finalItems, rowCount: finalItems.length, headers });
        }
      } else {
        // Mode 2: Extract globally per field and zip
        const fieldValues: Record<string, string[]> = {};
        let maxLen = 0;
        let anyFound = false;

        for (const field of fields) {
          if (!field.selector) {
            fieldValues[field.name] = [];
            continue;
          }
          const els = safeQueryElements(document, field.selector);
          if (els.length > 0) {
            anyFound = true;
            els.slice(0, 3).forEach((el) => flashHighlight(el));
            const vals = els.map((el) => resolveElementAttribute(el, field.attribute || 'text'));
            fieldValues[field.name] = vals;
            if (vals.length > maxLen) maxLen = vals.length;
          } else {
            fieldValues[field.name] = [];
          }
        }

        if (anyFound) {
          const items: Record<string, any>[] = [];
          for (let i = 0; i < maxLen; i++) {
            const row: Record<string, any> = {};
            for (const field of fields) {
              const vals = fieldValues[field.name] || [];
              row[field.name] = i < vals.length ? vals[i] : '';
            }
            items.push(row);
          }
          const finalItems = filterEmptyRows(items);
          return resolve({ success: true, items: finalItems, rowCount: finalItems.length, headers });
        }
      }

      if (Date.now() - startTime >= timeout) {
        return resolve({ success: true, items: [], rowCount: 0, headers });
      }
      setTimeout(check, pollInterval);
    };
    check();
  });
}

export async function extractLinks(
  selector?: string,
  timeout = 10000,
  signal?: AbortSignal
): Promise<{ links: { text: string; href: string }[] }> {
  const root = selector ? queryElement(selector) || document : document;
  const anchors = Array.from(root.querySelectorAll('a[href]'));
  const links = anchors.map(a => ({
    text: (a.textContent || '').trim(),
    href: (a as HTMLAnchorElement).href,
  })).filter(l => l.href && !l.href.startsWith('javascript:'));

  return { links };
}

export async function extractImageElement(
  selector = 'img',
  params: {
    mode?: 'single' | 'multiple';
    asBase64?: boolean;
    includeBackground?: boolean;
    timeout?: number;
  } = {},
  signal?: AbortSignal
): Promise<{
  success: boolean;
  url?: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  dataUrl?: string;
  items?: Array<{ url: string; alt?: string; title?: string; width?: number; height?: number; dataUrl?: string }>;
}> {
  const timeout = params.timeout || 10000;
  const startTime = Date.now();
  const pollInterval = 100;
  const isMultiple = params.mode === 'multiple';

  const resolveUrl = (src: string): string => {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return src;
    }
  };

  const getElementImageSrc = (el: Element): { src: string; isBackground?: boolean } => {
    if (el instanceof HTMLImageElement) {
      const src = el.currentSrc || el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.srcset || '';
      if (src) return { src: resolveUrl(src) };
    }
    if (el instanceof HTMLSourceElement) {
      const src = el.srcset || el.getAttribute('src') || '';
      if (src) return { src: resolveUrl(src) };
    }
    // Check for child img
    const childImg = el.querySelector('img');
    if (childImg) {
      const src = childImg.currentSrc || childImg.getAttribute('src') || childImg.getAttribute('data-src') || childImg.getAttribute('data-lazy-src') || '';
      if (src) return { src: resolveUrl(src) };
    }
    // Check background image
    if (params.includeBackground !== false) {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const match = bg.match(/url\(['"]?(.*?)['"]?\)/i);
        if (match && match[1]) {
          return { src: resolveUrl(match[1]), isBackground: true };
        }
      }
    }
    // Check src or href attribute
    const rawAttr = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data-src') || '';
    if (rawAttr) return { src: resolveUrl(rawAttr) };

    return { src: '' };
  };

  const toDataUrl = async (el: Element, src: string): Promise<string | undefined> => {
    if (src.startsWith('data:image/')) return src;
    if (el instanceof HTMLImageElement && el.naturalWidth > 0 && el.naturalHeight > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = el.naturalWidth;
        canvas.height = el.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(el, 0, 0);
          return canvas.toDataURL('image/png');
        }
      } catch {
        // Cross-origin image without CORS might error on canvas export
      }
    }
    return undefined;
  };

  return new Promise((resolve, reject) => {
    const check = async () => {
      if (signal?.aborted) return reject(new Error('Extract image aborted.'));

      let elements = selector ? Array.from(document.querySelectorAll(selector)) : [];
      if (elements.length === 0 && (!selector || selector === 'img')) {
        elements = Array.from(document.querySelectorAll('img, picture, [style*="background-image"]'));
      }

      if (elements.length > 0) {
        flashHighlight(elements[0]);

        if (isMultiple) {
          const items: any[] = [];
          for (const el of elements.slice(0, 50)) {
            const { src } = getElementImageSrc(el);
            if (src) {
              const alt = el.getAttribute('alt') || '';
              const title = el.getAttribute('title') || '';
              const width = (el as HTMLImageElement).naturalWidth || (el as HTMLElement).offsetWidth || undefined;
              const height = (el as HTMLImageElement).naturalHeight || (el as HTMLElement).offsetHeight || undefined;
              let dataUrl: string | undefined;
              if (params.asBase64) {
                dataUrl = await toDataUrl(el, src);
              }
              items.push({ url: src, alt, title, width, height, dataUrl: dataUrl || src });
            }
          }
          return resolve({ success: true, items });
        } else {
          const el = elements[0];
          const { src } = getElementImageSrc(el);
          const alt = el.getAttribute('alt') || '';
          const title = el.getAttribute('title') || '';
          const width = (el as HTMLImageElement).naturalWidth || (el as HTMLElement).offsetWidth || undefined;
          const height = (el as HTMLImageElement).naturalHeight || (el as HTMLElement).offsetHeight || undefined;
          let dataUrl: string | undefined;
          if (params.asBase64) {
            dataUrl = await toDataUrl(el, src);
          }
          return resolve({
            success: true,
            url: src,
            alt,
            title,
            width,
            height,
            dataUrl: dataUrl || src,
          });
        }
      }

      if (Date.now() - startTime >= timeout) {
        return resolve({ success: false, url: '', items: [] });
      }
      setTimeout(check, pollInterval);
    };
    check();
  });
}

export interface ExtractedPageImageItem {
  url: string;
  dataUrl?: string;
  alt: string;
  title: string;
  width?: number;
  height?: number;
  tagName: string;
  selector?: string;
  isBackground?: boolean;
}

export async function extractAllPageImages(
  params: {
    containerSelector?: string;
    includeBackground?: boolean;
    asBase64?: boolean;
    minWidth?: number;
    minHeight?: number;
    maxImages?: number;
    timeout?: number;
  } = {},
  signal?: AbortSignal
): Promise<{
  success: boolean;
  count: number;
  items: ExtractedPageImageItem[];
  urls: string[];
}> {
  const root = params.containerSelector ? (queryElement(params.containerSelector) || document) : document;
  const includeBg = params.includeBackground !== false;
  const minW = params.minWidth ?? 5;
  const minH = params.minHeight ?? 5;
  const maxLimit = params.maxImages || 100;

  const resolveUrl = (src: string): string => {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return src;
    }
  };

  const toDataUrl = async (el: Element, src: string): Promise<string | undefined> => {
    if (src.startsWith('data:image/')) return src;
    if (el instanceof HTMLImageElement && el.naturalWidth > 0 && el.naturalHeight > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = el.naturalWidth;
        canvas.height = el.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(el, 0, 0);
          return canvas.toDataURL('image/png');
        }
      } catch {
        // Cross-origin image canvas security limitation
      }
    }
    return undefined;
  };

  const seenUrls = new Set<string>();
  const items: ExtractedPageImageItem[] = [];

  // 1. Gather all <img> elements
  const imgEls = Array.from(root.querySelectorAll('img'));
  for (const img of imgEls) {
    if (items.length >= maxLimit) break;
    const rawSrc = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
    const src = resolveUrl(rawSrc);
    if (!src || seenUrls.has(src)) continue;

    const w = img.naturalWidth || img.offsetWidth || 0;
    const h = img.naturalHeight || img.offsetHeight || 0;

    // Filter out 1x1 tracking beacons if dimensions known
    if (w > 0 && h > 0 && (w < minW || h < minH)) continue;

    seenUrls.add(src);
    let dataUrl: string | undefined;
    if (params.asBase64) {
      dataUrl = await toDataUrl(img, src);
    }

    items.push({
      url: src,
      dataUrl: dataUrl || src,
      alt: img.getAttribute('alt') || '',
      title: img.getAttribute('title') || '',
      width: w || undefined,
      height: h || undefined,
      tagName: 'IMG',
      isBackground: false,
    });
  }

  // 2. Gather picture > source elements
  if (items.length < maxLimit) {
    const sources = Array.from(root.querySelectorAll('picture source'));
    for (const s of sources) {
      if (items.length >= maxLimit) break;
      const rawSrc = s.getAttribute('srcset') || s.getAttribute('src') || '';
      const firstSrc = rawSrc.split(',')[0]?.trim().split(' ')[0] || '';
      const src = resolveUrl(firstSrc);
      if (!src || seenUrls.has(src)) continue;

      seenUrls.add(src);
      items.push({
        url: src,
        dataUrl: src,
        alt: '',
        title: '',
        tagName: 'SOURCE',
        isBackground: false,
      });
    }
  }

  // 3. Gather background images if requested
  if (includeBg && items.length < maxLimit) {
    const allCandidateEls = Array.from(root.querySelectorAll('*'));
    for (const el of allCandidateEls) {
      if (items.length >= maxLimit) break;
      if (el instanceof HTMLImageElement || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;

      const inlineBg = (el as HTMLElement).style?.backgroundImage;
      const computedBg = inlineBg || window.getComputedStyle(el).backgroundImage;
      if (computedBg && computedBg !== 'none' && computedBg.includes('url(')) {
        const match = computedBg.match(/url\(['"]?(.*?)['"]?\)/i);
        if (match && match[1]) {
          const src = resolveUrl(match[1]);
          if (!src || seenUrls.has(src)) continue;

          const w = (el as HTMLElement).offsetWidth || 0;
          const h = (el as HTMLElement).offsetHeight || 0;
          if (w > 0 && h > 0 && (w < minW || h < minH)) continue;

          seenUrls.add(src);
          items.push({
            url: src,
            dataUrl: src,
            alt: '',
            title: el.getAttribute('title') || '',
            width: w || undefined,
            height: h || undefined,
            tagName: el.tagName,
            isBackground: true,
          });
        }
      }
    }
  }

  // Flash highlight on the first few found images
  if (imgEls.length > 0) {
    imgEls.slice(0, 3).forEach(el => flashHighlight(el));
  }

  return {
    success: true,
    count: items.length,
    items,
    urls: items.map(i => i.url),
  };
}

export async function manageStorage(params: {
  type?: 'local' | 'session';
  action?: 'get' | 'set' | 'remove' | 'clear';
  key?: string;
  value?: any;
}): Promise<{ success: boolean; data?: any }> {
  const storage = params.type === 'session' ? window.sessionStorage : window.localStorage;
  const action = params.action || 'get';

  if (action === 'get' && params.key) {
    const raw = storage.getItem(params.key);
    let parsed = raw;
    try {
      if (raw) parsed = JSON.parse(raw);
    } catch {}
    return { success: true, data: parsed };
  }

  if (action === 'set' && params.key) {
    const val = typeof params.value === 'object' ? JSON.stringify(params.value) : String(params.value ?? '');
    storage.setItem(params.key, val);
    return { success: true };
  }

  if (action === 'remove' && params.key) {
    storage.removeItem(params.key);
    return { success: true };
  }

  if (action === 'clear') {
    storage.clear();
    return { success: true };
  }

  return { success: true };
}

export async function copyToClipboard(text: string): Promise<{ success: boolean }> {
  inMemoryClipboard = text;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    } catch {}
  }
  return { success: true };
}

export async function readClipboard(): Promise<{ success: boolean; text: string }> {
  let text = inMemoryClipboard;
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const sys = await navigator.clipboard.readText();
      if (sys) text = sys;
    }
  } catch {}
  return { success: true, text };
}

export async function pasteIntoElement(params: {
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
}): Promise<{ success: boolean }> {
  let el: Element | null = null;
  if (params.selector) {
    try {
      el = queryElement(params.selector);
    } catch {}
  }
  if (!el && typeof params.x === 'number' && typeof params.y === 'number') {
    el = document.elementFromPoint(params.x, params.y);
  }
  if (!el) {
    el = document.activeElement || document.body;
  }

  if (el instanceof HTMLElement && el !== document.body) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashHighlight(el);
    el.focus();
  }

  // Get text to paste from argument, or fallback to clipboard
  let textToPaste = params.text;
  if (textToPaste === undefined) {
    const clip = await readClipboard();
    textToPaste = clip.text;
  }

  const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // 1. Dispatch Ctrl+V (or Cmd+V) key events
  const keyInit: KeyboardEventInit = {
    key: 'v',
    code: 'KeyV',
    keyCode: 86,
    which: 86,
    bubbles: true,
    cancelable: true,
    ctrlKey: !isMac,
    metaKey: isMac,
  };
  el.dispatchEvent(new KeyboardEvent('keydown', keyInit));

  // 2. Dispatch ClipboardEvent 'paste'
  if (textToPaste) {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', textToPaste);
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    } catch {}

    // 3. If input / textarea, insert text at cursor position
    if (isInput) {
      const input = el as HTMLInputElement | HTMLTextAreaElement;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const current = input.value;
      input.value = current.substring(0, start) + textToPaste + current.substring(end);
      input.selectionStart = input.selectionEnd = start + textToPaste.length;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: textToPaste }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      document.execCommand('insertText', false, textToPaste);
    }
  }

  el.dispatchEvent(new KeyboardEvent('keyup', keyInit));
  return { success: true };
}

export async function waitForNavigation(
  urlPattern?: string,
  timeout = 15000,
  signal?: AbortSignal
): Promise<{ success: boolean; currentUrl: string }> {
  const startTime = Date.now();
  const initialUrl = window.location.href;

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) return reject(new Error('Wait for navigation aborted.'));
      const current = window.location.href;

      if (urlPattern) {
        if (current.includes(urlPattern) || new RegExp(urlPattern).test(current)) {
          return resolve({ success: true, currentUrl: current });
        }
      } else if (current !== initialUrl) {
        return resolve({ success: true, currentUrl: current });
      }

      if (Date.now() - startTime >= timeout) {
        return reject(new Error(`Timed out waiting for navigation to "${urlPattern || 'new URL'}"`));
      }

      setTimeout(check, 200);
    };

    check();
  });
}

export async function waitForSmartSettle(
  params: {
    timeout?: number;
    waitForSelector?: string;
    waitForText?: string;
    waitForNavigation?: boolean;
  } = {},
  signal?: AbortSignal
): Promise<{ success: boolean; waitedMs: number; reason: string }> {
  const startTime = Date.now();
  const timeout = params.timeout || 3000;

  // 1. If explicit waitForSelector provided
  if (params.waitForSelector) {
    try {
      await waitForElement(params.waitForSelector, { timeout, visible: true }, signal);
      return { success: true, waitedMs: Date.now() - startTime, reason: 'selector_appeared' };
    } catch {
      return { success: false, waitedMs: Date.now() - startTime, reason: 'selector_timeout' };
    }
  }

  // 2. If explicit waitForText provided
  if (params.waitForText) {
    try {
      await waitForText(params.waitForText, undefined, timeout, signal);
      return { success: true, waitedMs: Date.now() - startTime, reason: 'text_appeared' };
    } catch {
      return { success: false, waitedMs: Date.now() - startTime, reason: 'text_timeout' };
    }
  }

  // 3. If explicit waitForNavigation provided
  if (params.waitForNavigation) {
    try {
      await waitForNavigation(undefined, timeout, signal);
      return { success: true, waitedMs: Date.now() - startTime, reason: 'navigation_complete' };
    } catch {
      return { success: false, waitedMs: Date.now() - startTime, reason: 'navigation_timeout' };
    }
  }

  // 4. Intelligent DOM & Spinner Settle
  const spinnerSelectors = [
    '[aria-busy="true"]',
    '.spinner',
    '.loading',
    '.loader',
    '[role="progressbar"]',
    'svg.animate-spin',
    '.shimmer',
    '.skeleton',
  ].join(', ');

  const checkInterval = 100;
  const initialUrl = window.location.href;

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(timer);
        return resolve({ success: false, waitedMs: Date.now() - startTime, reason: 'aborted' });
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        clearInterval(timer);
        return resolve({ success: true, waitedMs: elapsed, reason: 'timeout_settled' });
      }

      // Check if URL changed
      if (window.location.href !== initialUrl) {
        setTimeout(() => {
          clearInterval(timer);
          resolve({ success: true, waitedMs: Date.now() - startTime, reason: 'url_changed' });
        }, 200);
        return;
      }

      // Check document readyState
      if (document.readyState !== 'complete') {
        return;
      }

      // Check for spinners
      let hasVisibleSpinner = false;
      try {
        const spinners = document.querySelectorAll(spinnerSelectors);
        for (let i = 0; i < spinners.length; i++) {
          const s = spinners[i];
          if (s instanceof HTMLElement) {
            const style = window.getComputedStyle(s);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && s.offsetWidth > 0) {
              hasVisibleSpinner = true;
              break;
            }
          }
        }
      } catch {}

      if (!hasVisibleSpinner && elapsed >= 400) {
        clearInterval(timer);
        return resolve({ success: true, waitedMs: elapsed, reason: 'idle_settled' });
      }
    }, checkInterval);
  });
}

function flashHighlight(el: Element) {
  if (!(el instanceof HTMLElement)) return;
  const originalOutline = el.style.outline;
  const originalTransition = el.style.transition;

  el.style.transition = 'outline 0.2s ease';
  el.style.outline = '3px solid #6366f1';

  setTimeout(() => {
    el.style.outline = originalOutline;
    el.style.transition = originalTransition;
  }, 800);
}

/**
 * Returns an indexed list of interactive elements currently visible in the viewport
 */
export function getInteractiveElementsSnapshot(): InteractiveElement[] {
  const selector = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="switch"]',
    '[contenteditable="true"]',
    '[onclick]',
  ].join(', ');

  const elements = Array.from(document.querySelectorAll(selector));
  const results: InteractiveElement[] = [];

  for (const el of elements) {
    if (results.length >= 60) break;
    if (!(el instanceof HTMLElement)) continue;

    // Check visibility
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 6 || rect.height < 6) continue;

    // Viewport check (must be visible or near viewport)
    const inViewport = (
      rect.bottom >= 0 &&
      rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right >= 0 &&
      rect.left <= (window.innerWidth || document.documentElement.clientWidth)
    );
    if (!inViewport) continue;

    const tag = el.tagName.toLowerCase();
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const placeholder = (el as HTMLInputElement).placeholder || el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || undefined;
    const ariaLabel = el.getAttribute('aria-label') || undefined;
    const name = el.getAttribute('name') || undefined;
    const type = (el as HTMLInputElement).type || undefined;
    const value = (el as HTMLInputElement).value || undefined;
    const isEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';

    // Generate clean selector
    let bestSelector = '';
    const id = el.getAttribute('id');
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
    if (testId) {
      bestSelector = `[data-testid="${testId}"]`;
    } else if (id && !/[:0-9]{4,}/.test(id)) {
      bestSelector = `#${id}`;
    } else if (name && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
      bestSelector = `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
    } else if ((tag === 'input' || tag === 'textarea') && placeholder) {
      bestSelector = `${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
    } else if (ariaLabel && (tag === 'input' || tag === 'textarea' || isEditable)) {
      bestSelector = `${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    } else if (tag === 'input' && type && type !== 'text') {
      bestSelector = `input[type="${type}"]`;
    } else if (isEditable) {
      bestSelector = el.getAttribute('role') === 'textbox' ? '[role="textbox"]' : '[contenteditable="true"]';
    } else if (tag === 'button' && text) {
      bestSelector = `button:has-text("${text.slice(0, 20).replace(/"/g, '\\"')}")`;
    } else if (tag === 'a' && text) {
      bestSelector = `a:has-text("${text.slice(0, 20).replace(/"/g, '\\"')}")`;
    } else {
      const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      bestSelector = `${tag}${cls}`;
    }

    results.push({
      index: results.length + 1,
      tag,
      text,
      placeholder,
      ariaLabel,
      type,
      value,
      selector: bestSelector,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      },
    });
  }

  return results;
}

/**
 * Dispatches realistic click sequence at viewport coordinates
 */
export async function clickAtCoordinates(x: number, y: number): Promise<{ success: boolean; targetTag?: string; text?: string }> {
  const el = document.elementFromPoint(x, y);
  if (!el) {
    throw new Error(`No element found at viewport coordinates (${x}, ${y})`);
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  flashHighlight(el);

  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 1,
  };

  el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  el.dispatchEvent(new MouseEvent('mousedown', eventInit));
  if (el instanceof HTMLElement) el.focus();
  el.dispatchEvent(new PointerEvent('pointerup', eventInit));
  el.dispatchEvent(new MouseEvent('mouseup', eventInit));
  if (el instanceof HTMLElement) {
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', eventInit));
  }

  return {
    success: true,
    targetTag: el.tagName.toLowerCase(),
    text: el.textContent ? el.textContent.trim().slice(0, 40) : undefined,
  };
}

/**
 * Types text into an element found by selector or coordinates, optionally pressing Enter
 */
export async function typeIntoElement(params: {
  selector?: string;
  x?: number;
  y?: number;
  text: string;
  pressEnter?: boolean;
  clearFirst?: boolean;
  typingDelay?: number;
  human?: HumanConfig;
  signal?: AbortSignal;
}): Promise<{ success: boolean }> {
  let rawEl: Element | null = null;
  if (params.selector) {
    try {
      rawEl = queryElement(params.selector);
    } catch {}
  }
  if (!rawEl && typeof params.x === 'number' && typeof params.y === 'number') {
    rawEl = document.elementFromPoint(params.x, params.y);
  }
  if (!rawEl) {
    rawEl = document.activeElement || document.body;
  }

  const el = resolveTargetInputElement(rawEl) || (rawEl as HTMLElement);
  const textVal = String(params.text ?? '');

  // Human mode: glide onto the field before typing.
  if (params.human && el) {
    await approachElement(el, params.human, params.signal, { center: false, pause: 0 });
  }

  return await performRobustTyping(el, textVal, {
    clearFirst: params.clearFirst ?? true,
    typingDelay: params.typingDelay,
    pressEnter: params.pressEnter,
    human: params.human,
    signal: params.signal,
  });
}

/**
 * Automatically discovers or uses custom selector to find and click the Next Page trigger.
 * Detects disabled state, aria-disabled, or end of pagination.
 */
export async function findAndClickNextPage(
  params: {
    nextButtonSelector?: string;
    nextSelector?: string;
    selector?: string;
    human?: HumanConfig;
  } = {},
  signal?: AbortSignal
): Promise<{ clicked: boolean; reachedEnd: boolean; selector?: string; selectorFound?: string; reason?: string; matchedText?: string }> {
  let target: Element | null = null;
  const preferredSelector = params.nextButtonSelector || params.nextSelector || params.selector;
  let usedSelector = preferredSelector;
  let matchedText: string | undefined;

  // 1. If explicit selector was provided, try it first
  if (preferredSelector) {
    try {
      target = queryElement(preferredSelector) || document.querySelector(preferredSelector);
    } catch {
      target = null;
    }
    if (target) {
      matchedText = target.textContent?.trim();
    }
  }

  // 2. Auto-detect if no target found or no selector given
  if (!target) {
    const candidateSelectors = [
      'a[rel="next"]',
      'button[rel="next"]',
      '[aria-label*="next page" i]',
      '[aria-label="next" i]',
      '[aria-label*="next" i]',
      '[title*="next page" i]',
      '[title*="next" i]',
      '.pagination-next a',
      '.pagination-next button',
      '.pagination-next',
      '.next-page a',
      '.next-page button',
      '.next-page',
      '.pagination .next a',
      '.pagination .next',
      'li.next a',
      'li.next button',
      'li.next',
      'a.next',
      'button.next',
      '[data-testid*="next" i]',
      '[data-action*="next" i]',
      '.pager-next a',
    ];

    for (const sel of candidateSelectors) {
      try {
        const found = document.querySelector(sel);
        if (found && isElementVisible(found)) {
          target = found;
          usedSelector = sel;
          matchedText = found.textContent?.trim() || found.getAttribute('aria-label') || undefined;
          break;
        }
      } catch {}
    }

    // 3. Fallback text search for Next buttons
    if (!target) {
      const clickableCandidates = Array.from(
        document.querySelectorAll(
          'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"], [class*="btn"], [class*="button"], [class*="pager"], [class*="page"], [class*="pagination"]'
        )
      );
      for (const el of clickableCandidates) {
        if (!isElementVisible(el)) continue;
        const text = (el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const normalized = text.replace(/[\s\u00A0]+/g, ' ').trim();

        if (
          normalized === 'next' ||
          normalized === 'next page' ||
          normalized.startsWith('next ') ||
          normalized.startsWith('next>') ||
          normalized.startsWith('next›') ||
          normalized.startsWith('next»') ||
          normalized === '>' ||
          normalized === '»' ||
          normalized === '›' ||
          normalized === 'older' ||
          normalized === 'older posts' ||
          aria === 'next' ||
          aria.includes('next page')
        ) {
          target = el;
          usedSelector = `${el.tagName.toLowerCase()}:has-text("${text}")`;
          matchedText = el.textContent?.trim();
          break;
        }
      }
    }
  }

  if (!target) {
    return { clicked: false, reachedEnd: true, reason: 'not_found' };
  }

  // Check if disabled
  const isDisabled =
    target.hasAttribute('disabled') ||
    target.getAttribute('aria-disabled') === 'true' ||
    target.classList.contains('disabled') ||
    target.classList.contains('cursor-not-allowed') ||
    target.getAttribute('tabindex') === '-1';

  if (isDisabled) {
    return {
      clicked: false,
      reachedEnd: true,
      selector: usedSelector,
      selectorFound: usedSelector,
      reason: 'disabled',
    };
  }

  // Scroll into view if needed
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {}

  flashHighlight(target);

  // Human mode pause and click
  if (params.human) {
    await approachElement(target, params.human, signal);
  }

  if (target instanceof HTMLElement) {
    target.click();
  } else {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  return {
    clicked: true,
    reachedEnd: false,
    selector: usedSelector,
    selectorFound: usedSelector,
    matchedText,
  };
}


