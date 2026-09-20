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
  params: { timeout?: number; visibleOnly?: boolean; text?: string } = {},
  signal?: AbortSignal
): Promise<{ present: boolean; matchedText?: string; reason?: string }> {
  const timeout = Math.max(0, params.timeout ?? 5000);
  const visibleOnly = params.visibleOnly !== false;
  const expectedText = params.text ? String(params.text) : '';
  const pollInterval = 100;
  const startTime = Date.now();

  const matches = (el: Element | null): boolean => {
    if (!el) return false;
    if (visibleOnly && !isElementVisible(el)) return false;
    if (expectedText) {
      const content = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!content.includes(expectedText.replace(/\s+/g, ' ').trim().toLowerCase())) return false;
    }
    return true;
  };

  return new Promise((resolve) => {
    const check = () => {
      if (signal?.aborted) {
        resolve({ present: false, reason: 'aborted' });
        return;
      }

      let el: Element | null = null;
      try {
        el = queryElement(selector);
      } catch {
        el = null;
      }

      if (matches(el)) {
        if (el) flashHighlight(el);
        resolve({ present: true, matchedText: (el?.textContent || '').trim().slice(0, 200) });
        return;
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

export async function extractText(selector: string, timeout = 10000, signal?: AbortSignal): Promise<{ text: string }> {
  const el = await waitForElement(selector, { timeout }, signal);
  flashHighlight(el);
  const text = (el.textContent || '').trim();
  return { text };
}

export async function extractAttribute(selector: string, attribute: string, timeout = 10000, signal?: AbortSignal): Promise<{ value: string | null }> {
  const el = await waitForElement(selector, { timeout }, signal);
  flashHighlight(el);
  const val = el.getAttribute(attribute);
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

export async function waitForText(text: string, selector?: string, timeout = 10000, signal?: AbortSignal): Promise<{ success: boolean }> {
  const startTime = Date.now();
  const pollInterval = 100;

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) return reject(new Error('Wait for text aborted.'));
      const root = selector ? queryElement(selector) : document.body;
      if (root && root.textContent?.includes(text)) {
        if (root instanceof Element) flashHighlight(root);
        return resolve({ success: true });
      }
      if (Date.now() - startTime >= timeout) {
        return reject(new Error(`Timed out after ${timeout}ms waiting for text: "${text}"`));
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
        const items = elements.map(el => {
          if (params.attribute) {
            return el.getAttribute(params.attribute) || '';
          }
          return (el.textContent || '').trim();
        });
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


