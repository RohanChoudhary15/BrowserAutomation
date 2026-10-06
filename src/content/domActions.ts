import { waitForElement, queryElement, queryElements, isElementVisible } from '../selectors/finder';
import { InteractiveElement } from '../ai/types';
import { HumanConfig, clusteredBetween, getAdjacentTypo, randomBetween, wait } from '../utils/human';
import {
  approachElement,
  getCursorPosition,
  humanActionPause,
  humanTypingDelay,
  markCursorClick,
  markCursorPress,
  moveCursorTo,
  waitForElementSettle,
} from './humanizer';
import { matchesText, findMatchingElement, TextMatchOptions } from '../utils/textMatcher';
export { waitForElement, queryElement, queryElements };

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

      // Scroll into view smoothly if not human (human approachElement handles smooth scroll + settle detection)
      if (!human && typeof el.scrollIntoView === 'function') {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        } catch {}
      }

      // Highlight briefly
      flashHighlight(el);

      if (params.delay) {
        await new Promise(r => setTimeout(r, params.delay));
      }

      // Human mode: glide the synthetic cursor onto the element and hover a beat
      // before pressing, like a real user aiming at a target.
      let clickPoint = { x: 0, y: 0 };
      if (human) {
        clickPoint = await approachElement(el, human, signal, { pause: attempt === 0 ? undefined : 0 });
      } else {
        const rect = el.getBoundingClientRect();
        clickPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }

      const clickType = params.clickType || 'left';
      const clientX = clickPoint.x;
      const clientY = clickPoint.y;

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
        if (human) markCursorPress(true, human);
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        if (human) {
          const dwell = clusteredBetween(human.clickDwellMin ?? 60, human.clickDwellMax ?? 110);
          await wait(dwell, signal);
          markCursorPress(false, human);
          markCursorClick(human);
        }
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        el.dispatchEvent(new MouseEvent('contextmenu', eventInit));
      } else if (clickType === 'double') {
        if (human) markCursorPress(true, human);
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        el.dispatchEvent(new MouseEvent('click', eventInit));
        if (human) await wait(randomBetween(40, 80), signal);
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        if (human) {
          markCursorPress(false, human);
          markCursorClick(human);
        }
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        el.dispatchEvent(new MouseEvent('click', eventInit));
        el.dispatchEvent(new MouseEvent('dblclick', eventInit));
      } else {
        // Left click
        if (human) markCursorPress(true, human);
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

        // Realistic human dwell time: hold click down before releasing
        if (human) {
          const dwell = clusteredBetween(human.clickDwellMin ?? 60, human.clickDwellMax ?? 110);
          await wait(dwell, signal);
          markCursorPress(false, human);
          markCursorClick(human);
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

      // Human mode: linger before the next action.
      if (human) {
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

    // Realistic typo simulation & self-correction if enabled
    if (human?.simulateTypos && isLetter && i > 1 && i < text.length - 1 && Math.random() < 0.03) {
      const typoChar = getAdjacentTypo(char);
      if (typoChar && typoChar !== char) {
        const typoInit: KeyboardEventInit = { key: typoChar, code: `Key${typoChar.toUpperCase()}`, bubbles: true, cancelable: true, composed: true };
        el.dispatchEvent(new KeyboardEvent('keydown', typoInit));
        if (isInput) {
          const input = el as HTMLInputElement | HTMLTextAreaElement;
          const current = input.value || '';
          setNativeInputValue(input, current + typoChar);
          input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: typoChar, inputType: 'insertText' }));
        }
        el.dispatchEvent(new KeyboardEvent('keyup', typoInit));

        await wait(randomBetween(70, 130), options.signal);

        const bsInit: KeyboardEventInit = { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true, composed: true };
        el.dispatchEvent(new KeyboardEvent('keydown', bsInit));
        if (isInput) {
          const input = el as HTMLInputElement | HTMLTextAreaElement;
          const current = input.value || '';
          if (current.length > 0) {
            setNativeInputValue(input, current.slice(0, -1));
            input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }));
          }
        }
        el.dispatchEvent(new KeyboardEvent('keyup', bsInit));
        await wait(randomBetween(50, 90), options.signal);
      }
    }

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
      try {
        const cur = getCursorPosition();
        const wheelInit: WheelEventInit = {
          bubbles: true,
          cancelable: true,
          deltaX: stepX,
          deltaY: stepY,
          clientX: cur.x > 0 ? cur.x : 200,
          clientY: cur.y > 0 ? cur.y : 200,
        };
        (target || document.body).dispatchEvent(new WheelEvent('wheel', wheelInit));
      } catch {}
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
/**
 * Normalizes an extracted text string: converts non-breaking spaces (\u00A0),
 * strips zero-width characters, collapses whitespace, and trims edges.
 */
export function normalizeExtractedString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Robustly and cleanly extracts human-readable text from an element and all its nested children.
 * - Handles deeply nested tags (a, span, p, div, b, strong, em, label, etc.)
 * - Normalizes spacing between adjacent block/inline elements so text does not concatenate without spaces.
 * - Strips noise elements: script, style, noscript, svg, iframe, template.
 * - Inspects Shadow DOM (shadowRoot.textContent) when available.
 * - Extracts form values (input.value, textarea.value, select.value).
 * - Falls back to title, aria-label, and image alt text on nested elements if textual content is empty.
 */
export function extractCleanText(el: Element): string {
  if (!el) return '';

  // Form elements: direct value
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.value && el.value.trim() !== '') {
      return normalizeExtractedString(el.value);
    }
  }

  // Shadow DOM support (Web Components)
  if ((el as any).shadowRoot) {
    try {
      const shadowText = (el as any).shadowRoot.textContent || '';
      if (shadowText.trim()) {
        return normalizeExtractedString(shadowText);
      }
    } catch {}
  }

  // Extract from cloned tree, stripping noise and preserving spacing between block elements
  let raw = '';
  try {
    const clone = el.cloneNode(true) as Element;
    // Strip junk tags that don't represent visible user text
    const junk = clone.querySelectorAll('script, style, noscript, svg, iframe, template');
    junk.forEach((j) => j.remove());

    // Insert spaces before/after block elements in the clone so text from sibling elements doesn't merge
    const blockElements = clone.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, tr, td, th, section, article, header, footer, br');
    blockElements.forEach((b) => {
      if (b.tagName.toLowerCase() === 'br') {
        b.replaceWith(document.createTextNode(' '));
      } else {
        b.prepend(document.createTextNode(' '));
        b.append(document.createTextNode(' '));
      }
    });

    raw = (clone.textContent || '').trim();
  } catch {
    raw = (el.textContent || '').trim();
  }

  // Fallback 1: innerText if textContent is empty or whitespace
  if (!raw && 'innerText' in el) {
    raw = String((el as HTMLElement).innerText || '').trim();
  }

  // Fallback 2: aria-label, title, or alt on the element itself
  if (!raw) {
    raw = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '';
  }

  // Fallback 3: check child elements with aria-label, title, alt, or input value
  if (!raw) {
    const candidates = Array.from(el.querySelectorAll('[aria-label], [title], img[alt], input[value]'));
    for (const c of candidates) {
      const candidateVal = c.getAttribute('aria-label') ||
                           c.getAttribute('title') ||
                           c.getAttribute('alt') ||
                           (c instanceof HTMLInputElement ? c.value : '') || '';
      if (candidateVal && candidateVal.trim() !== '') {
        raw = candidateVal.trim();
        break;
      }
    }
  }

  // Fallback 4: if element is an icon/svg, inspect closest anchor, button, or parent aria-label
  if (!raw && (el.tagName.toLowerCase() === 'svg' || el.tagName.toLowerCase() === 'path' || el.querySelector('svg'))) {
    const parentWithLabel = el.closest('a[aria-label], button[aria-label], [aria-label], [title]');
    if (parentWithLabel) {
      raw = parentWithLabel.getAttribute('aria-label') || parentWithLabel.getAttribute('title') || '';
    }
  }

  // Truncation check: if text ends with ellipsis (...) or a nested link has a full title attribute, prefer the complete title
  const titleEl = el.querySelector('a[title], [title]') || (el.getAttribute('title') ? el : null);
  if (titleEl) {
    const titleAttr = titleEl.getAttribute('title')?.trim();
    if (titleAttr && (raw.endsWith('...') || raw.endsWith('…') || (titleAttr.length > raw.length && titleAttr.startsWith(raw.replace(/\.{2,}$/, '').trim())))) {
      raw = titleAttr;
    }
  }

  return normalizeExtractedString(raw);
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
      // Check data-src / data-lazy / data-original (common lazy loaders across Amazon, Shopify, AliExpress, Walmart)
      const dataSrc =
        imgEl.getAttribute('data-src') ||
        imgEl.getAttribute('data-lazy-src') ||
        imgEl.getAttribute('data-original') ||
        imgEl.getAttribute('data-url') ||
        imgEl.getAttribute('data-old-hires') ||
        imgEl.getAttribute('data-hi-res') ||
        imgEl.getAttribute('data-highres') ||
        imgEl.getAttribute('data-zoom-image') ||
        imgEl.getAttribute('data-image') ||
        imgEl.getAttribute('data-actualsrc') ||
        imgEl.getAttribute('data-lazy');

      const isPlaceholder = (url?: string | null) =>
        !url ||
        url.startsWith('data:image/svg+xml') ||
        url.startsWith('data:image/gif') ||
        url.includes('blank.gif') ||
        url.includes('transparent.png') ||
        url.includes('1x1') ||
        url.includes('placeholder') ||
        url.includes('spinner');

      // Check srcset on img or inside picture source (pick highest resolution candidate)
      const srcset =
        imgEl.getAttribute('srcset') ||
        imgEl.getAttribute('data-srcset') ||
        el.querySelector('picture source[srcset]')?.getAttribute('srcset') ||
        el.querySelector('source[srcset]')?.getAttribute('srcset');

      if (srcset) {
        const candidates = srcset
          .split(',')
          .map((s) => s.trim().split(/\s+/)[0])
          .filter((u) => u && !isPlaceholder(u));
        if (candidates.length > 0) {
          return toAbsoluteUrl(candidates[candidates.length - 1]);
        }
      }

      // Check direct src / currentSrc
      const directSrc = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src');
      if (directSrc && !isPlaceholder(directSrc)) {
        return toAbsoluteUrl(directSrc);
      }

      if (dataSrc && !isPlaceholder(dataSrc)) {
        return toAbsoluteUrl(dataSrc);
      }

      if (dataSrc) return toAbsoluteUrl(dataSrc);
      if (directSrc) return toAbsoluteUrl(directSrc);
    }

    // Check picture source if no img element was found
    const picSource = el.querySelector('picture source[srcset], source[srcset]');
    if (picSource) {
      const srcset = picSource.getAttribute('srcset');
      if (srcset) {
        const candidates = srcset
          .split(',')
          .map((s) => s.trim().split(/\s+/)[0])
          .filter(Boolean);
        if (candidates.length > 0) {
          return toAbsoluteUrl(candidates[candidates.length - 1]);
        }
      }
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
    const rawSrc = el.getAttribute('src') || el.getAttribute('data-src');
    if (rawSrc) return toAbsoluteUrl(rawSrc);
    return '';
  }

  // 3. Link URL (href)
  if (attr === 'href' || attr === 'link' || attr === 'url') {
    let anchor: HTMLAnchorElement | null = null;
    if (el instanceof HTMLAnchorElement || el.tagName.toLowerCase() === 'a') {
      anchor = el as HTMLAnchorElement;
    } else {
      anchor = el.querySelector('a[href]') || el.closest('a[href]');
    }

    if (anchor && anchor.href) {
      return anchor.href;
    }

    const rawHref =
      el.getAttribute('href') ||
      el.getAttribute('data-href') ||
      el.getAttribute('data-url') ||
      el.getAttribute('data-link');
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
  return queryElements(sel, root);
}

export function safeQuerySingleElement(root: ParentNode, sel: string): Element | null {
  if (!sel || !sel.trim()) return null;
  return queryElement(sel, root);
}

/**
 * Automatically identifies repeating product card/item containers when the user
 * did not specify a containerSelector or when the provided containerSelector found 0 elements.
 */
export function findRepeatingCardContainers(root: ParentNode = document, fields: ExtractDatasetField[] = []): Element[] {
  const commonCardSelectors = [
    '.s-result-item[data-asin]',
    '.s-card-container',
    '[data-component-type="s-search-result"]',
    '.s-result-item',
    '.s-item',
    'li.s-item',
    '[data-testid*="product" i]',
    '[data-testid*="card" i]',
    '[data-testid*="item" i]',
    '[data-cy*="product" i]',
    '[data-asin]',
    'article.product_pod',
    '.product-card',
    '.product-item',
    '.productCard',
    '.productItem',
    '[class*="product-card" i]',
    '[class*="ProductCard" i]',
    '[class*="product-item" i]',
    '[class*="ProductItem" i]',
    '[class*="productCard" i]',
    '[class*="productItem" i]',
    '[class*="item-card" i]',
    '[class*="ItemCard" i]',
    '[class*="grid-item" i]',
    '[class*="listing-item" i]',
    '[class*="search-result" i]',
    'article.Box-row',
    '.Box-row',
    'li.Box-row',
    'article',
    'li.product',
    'li.item',
    'li[class*="product" i]',
    'li[class*="item" i]',
    'div.product',
    'tr.athing',
    '[class*="card" i]:not(body):not(html):not(#root):not(#app)',
  ];

  for (const cSel of commonCardSelectors) {
    try {
      const found = Array.from(root.querySelectorAll(cSel)).filter(el => {
        const tag = el.tagName.toLowerCase();
        return tag !== 'body' && tag !== 'html' && tag !== 'main' && !el.id?.includes('app') && !el.id?.includes('root');
      });
      if (found.length >= 2) {
        return found;
      }
    } catch {}
  }

  // Fallback: Infer repeating cards from field selectors (e.g. h2, h3, p)
  const candidateSelectors = (Array.isArray(fields) ? fields : [])
    .map(f => (f.selector || '').trim())
    .filter(s => s && !s.includes('//') && s.length < 50);

  const selectorsToTry = candidateSelectors.length > 0 ? candidateSelectors : ['h2', 'h3', 'p', 'article h3', '.title'];

  for (const sel of selectorsToTry) {
    try {
      const items = Array.from(root.querySelectorAll(sel));
      if (items.length >= 2) {
        const parentContainers: Element[] = [];
        for (const item of items) {
          const ancestor = item.closest(
            'article, li, [class*="card" i], [class*="item" i], [class*="product" i], [class*="listing" i], tr, div[class]'
          );
          if (ancestor && ancestor !== item && !parentContainers.includes(ancestor)) {
            const tag = ancestor.tagName.toLowerCase();
            if (tag !== 'body' && tag !== 'html' && tag !== 'main') {
              parentContainers.push(ancestor);
            }
          }
        }
        if (parentContainers.length >= 2) {
          return parentContainers;
        }
      }
    } catch {}
  }

  return [];
}

/**
 * Robustly extracts a field from a card container element.
 * - Supports bare tag selectors: h2, h3, p, h1, h4, etc.
 * - Supports specific selectors: h2.title, h3 a, p.price, p:nth-of-type(1), div.info > h2, etc.
 * - Extracts deeply nested text (inside a, span, b, strong, em, div, label, etc.)
 * - Features intelligent heading, paragraph, price, link, and image fallbacks when selectors are absent or empty.
 */
export function extractFieldFromElement(
  container: Element,
  field: ExtractDatasetField
): string {
  if (!container) return '';
  const attrType = (field.attribute || 'text').trim().toLowerCase();
  const rawSel = (field.selector || '').trim();
  const fieldName = (field.name || '').trim().toLowerCase();

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
    const descEls = safeQueryElements(container, '.description, [class*="desc" i], [class*="summary" i], [class*="detail" i]');
    for (const d of descEls) {
      const text = resolveElementAttribute(d, 'text');
      if (text) return text;
    }
  }

  // If no selector provided, intelligently infer default selector from field name
  let effectiveSel = rawSel;
  if (!effectiveSel) {
    if (/^(title|name|headline|heading|product|header)/i.test(fieldName)) {
      effectiveSel = 'h2, h3, h1, h4, [role="heading"], .title, [class*="title" i], [class*="name" i]';
    } else if (/^(price|cost|amount|sale_price|regular_price)/i.test(fieldName)) {
      effectiveSel = '.price, [class*="price" i], p.price, span.price';
    } else if (/^(image|img|photo|picture|thumbnail|thumb|src)/i.test(fieldName)) {
      effectiveSel = 'img, picture source';
    } else if (/^(link|url|href|permalink)/i.test(fieldName)) {
      effectiveSel = 'a[href], a';
    } else if (/^(desc|description|details|summary|text)/i.test(fieldName)) {
      effectiveSel = 'p, .description, [class*="desc" i]';
    } else if (/^(language|lang|programming_language|programminglanguage)/i.test(fieldName)) {
      effectiveSel = '[itemprop="programmingLanguage"], [class*="lang" i], span.repo-language-color + span, span';
    } else if (/^(h1|h2|h3|h4|h5|h6|p|a|span|li|td|th|button|label|strong|b|em|i|code|pre)$/i.test(fieldName)) {
      effectiveSel = fieldName.toLowerCase();
    }
  }

  // If still no selector, extract directly from container
  if (!effectiveSel) {
    return resolveElementAttribute(container, attrType);
  }

  // If container itself is an anchor and we need a link/href, extract immediately
  if (attrType === 'href' || attrType === 'link' || attrType === 'url') {
    if (container.tagName.toLowerCase() === 'a') {
      const anchorHref = (container as HTMLAnchorElement).href || container.getAttribute('href');
      if (anchorHref && anchorHref.trim() !== '') return toAbsoluteUrl(anchorHref);
    }
    const containerHref =
      container.getAttribute('href') ||
      container.getAttribute('data-href') ||
      container.getAttribute('data-url') ||
      container.getAttribute('data-link');
    if (containerHref && containerHref.trim() !== '') {
      return toAbsoluteUrl(containerHref);
    }
  }

  // If container itself is an image and we need src, extract immediately
  if (attrType === 'src' || attrType === 'image' || attrType === 'image_url' || attrType === 'img') {
    if (container.tagName.toLowerCase() === 'img') {
      const src = resolveElementAttribute(container, 'src');
      if (src && src.trim() !== '') return src;
    }
  }

  // 1. Direct query within container
  const candidateEls = safeQueryElements(container, effectiveSel);
  if (container.matches) {
    try {
      if (container.matches(effectiveSel) && !candidateEls.includes(container)) {
        candidateEls.unshift(container);
      }
    } catch {}
  }

  // If candidate elements found:
  if (candidateEls.length > 0) {
    // If field is price-related, look for candidate element that contains currency or formatted price
    const isPriceField = /price|cost|amount/i.test(fieldName) || /price/i.test(effectiveSel);
    const PRICE_REGEX = /(?:[\$€£¥₹\u20AC\u00A3\u00A5\u20B9]\s*[\d,.]+|[\d,.]+\s*[\$€£¥₹\u20AC\u00A3\u00A5\u20B9]|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b)/;
    if (isPriceField && (attrType === 'text' || attrType === 'innertext' || attrType === 'textcontent')) {
      for (const el of candidateEls) {
        const hasPriceClass = el.className && typeof el.className === 'string' && /price/i.test(el.className);
        let val = resolveElementAttribute(el, attrType);
        if (!val || val.trim() === '') {
          val = el.getAttribute('content') || el.getAttribute('data-price') || el.getAttribute('data-amount') || '';
        }
        if (val && (PRICE_REGEX.test(val) || hasPriceClass)) {
          return val;
        }
      }
    }

    // Check candidate elements in order, finding the first that yields a non-empty value
    for (const el of candidateEls) {
      let val = resolveElementAttribute(el, attrType);
      if (!val || val.trim() === '') {
        // Inspect nested children for non-empty text (e.g. inside wrapper spans/links)
        const children = Array.from(el.querySelectorAll('*'));
        for (const ch of children) {
          const chVal = resolveElementAttribute(ch, attrType);
          if (chVal && chVal.trim() !== '') {
            val = chVal;
            break;
          }
        }
      }
      if (!val || val.trim() === '') {
        val = el.getAttribute('content') || el.getAttribute('data-price') || el.getAttribute('title') || el.getAttribute('aria-label') || '';
      }
      if (val && val.trim() !== '') {
        return val;
      }
    }
  }

  // 2. Heading / Title Fallbacks (when selector is h2, h3, p, h1, h4, or field is title/name/product)
  const isTitleOrHeading =
    /\b(h1|h2|h3|h4|h5|h6)\b/i.test(effectiveSel) ||
    /^(title|headline|name|heading|product|header)/i.test(fieldName);

  if (isTitleOrHeading && (attrType === 'text' || attrType === 'innertext' || attrType === 'textcontent')) {
    const headingFallbacks = [
      'h2',
      'h3',
      'h1',
      'h4',
      'h5',
      'h6',
      'h2 a',
      'h3 a',
      'h1 a',
      'h4 a',
      'h2 span',
      'h3 span',
      '[role="heading"]',
      'p.title',
      'p.product-title',
      'p.name',
      'p.product-name',
      'p[class*="title" i]',
      'p[class*="name" i]',
      'p a',
      'p strong',
      'p b',
      '.title',
      '[class*="title" i]',
      '[class*="name" i]',
      '[class*="heading" i]',
      'a.product-title',
      'a[class*="title" i]',
      'header',
      'p',
      'strong',
      'b',
      'a',
    ];

    for (const hSel of headingFallbacks) {
      if (hSel.toLowerCase() === effectiveSel.toLowerCase()) continue;
      const fallbackEls = safeQueryElements(container, hSel);
      for (const el of fallbackEls) {
        const val = resolveElementAttribute(el, 'text') || el.getAttribute('title') || el.getAttribute('aria-label') || '';
        if (val && val.trim() !== '') {
          return val;
        }
      }
    }
  }

  // 3. Paragraph / Description Fallbacks (when selector is p or field is description/details)
  const isParagraphTarget =
    /\bp\b/i.test(effectiveSel) ||
    /^(desc|description|details|summary|content|text|about)/i.test(fieldName);

  if (isParagraphTarget && (attrType === 'text' || attrType === 'innertext' || attrType === 'textcontent')) {
    const pFallbacks = [
      'p',
      'p span',
      'p a',
      '.description',
      '[class*="desc" i]',
      '[class*="summary" i]',
      '[class*="detail" i]',
      '[class*="text" i]',
      'span.description',
      'div.description',
      'li',
      'div > p',
      'div',
    ];

    for (const pSel of pFallbacks) {
      if (pSel.toLowerCase() === effectiveSel.toLowerCase()) continue;
      const fallbackEls = safeQueryElements(container, pSel);
      for (const el of fallbackEls) {
        const val = resolveElementAttribute(el, 'text');
        if (val && val.trim() !== '') {
          return val;
        }
      }
    }
  }

  // 4. Price Fallbacks (when field is price/cost or selector has price)
  const isPriceTarget =
    /price/i.test(effectiveSel) ||
    /^(price|cost|amount|sale_price|current_price)/i.test(fieldName);

  if (isPriceTarget && (attrType === 'text' || attrType === 'innertext' || attrType === 'textcontent')) {
    const priceFallbacks = [
      '.a-price .a-offscreen',
      '.a-price-whole',
      '.a-price',
      '[class*="a-price" i]',
      '[data-automation-id*="price" i]',
      '.s-item__price',
      '[itemprop="price"]',
      'meta[itemprop="price"]',
      '[data-price]',
      '[data-amount]',
      '[data-product-price]',
      '.price',
      '[class*="price" i]',
      '.amount',
      '[class*="amount" i]',
      '.money',
      '[class*="money" i]',
      '.current-price',
      '[class*="current-price" i]',
      '.sale-price',
      '[class*="sale-price" i]',
      'p.price',
      'p[class*="price" i]',
      'span.price',
      'span[class*="price" i]',
      'div[class*="price" i]',
      '[id*="price" i]',
      'b',
      'strong',
      'p',
      'span',
    ];

    for (const prSel of priceFallbacks) {
      if (prSel.toLowerCase() === effectiveSel.toLowerCase()) continue;
      const fallbackEls = safeQueryElements(container, prSel);
      for (const el of fallbackEls) {
        let val = resolveElementAttribute(el, 'text');
        if (!val || val.trim() === '') {
          val = el.getAttribute('content') || el.getAttribute('data-price') || el.getAttribute('data-amount') || '';
        }
        if (val && /[\$€£¥₹\d]/.test(val)) {
          return val;
        }
      }
    }
  }

  // 5. Fallback for link/href when selector targeted a heading or container
  if (attrType === 'href' || attrType === 'link' || attrType === 'url') {
    if (candidateEls.length > 0) {
      for (const el of candidateEls) {
        const aEl = el.querySelector('a[href]') || (el.tagName.toLowerCase() === 'a' ? el : null);
        if (aEl) {
          const href = resolveElementAttribute(aEl, 'href');
          if (href && href.trim() !== '') return href;
        }
      }
    }
    const headingLinks = safeQueryElements(container, 'h1 a[href], h2 a[href], h3 a[href], h4 a[href], p a[href], a[href]');
    for (const a of headingLinks) {
      const href = resolveElementAttribute(a, 'href');
      if (href && href.trim() !== '') return href;
    }
    const closestAnchor = container.closest('a[href]');
    if (closestAnchor && (closestAnchor as HTMLAnchorElement).href) {
      return (closestAnchor as HTMLAnchorElement).href;
    }
  }

  // 6. Fallback for image/src when selector targeted a container
  if (attrType === 'src' || attrType === 'image' || attrType === 'image_url') {
    if (candidateEls.length > 0) {
      for (const el of candidateEls) {
        const imgEl = el.querySelector('img, picture source, picture img') || (el.tagName.toLowerCase() === 'img' ? el : null);
        if (imgEl) {
          const src = resolveElementAttribute(imgEl, 'src');
          if (src && src.trim() !== '') return src;
        }
      }
    }
    const anyImgs = safeQueryElements(container, 'img, picture source, [class*="image" i] img');
    for (const img of anyImgs) {
      const src = resolveElementAttribute(img, 'src');
      if (src && src.trim() !== '') return src;
    }
  }

  // 7. If candidate elements were found but direct text was empty, deeply check nested children
  if (candidateEls.length > 0) {
    for (const el of candidateEls) {
      const children = Array.from(el.querySelectorAll('*'));
      for (const ch of children) {
        const chVal = resolveElementAttribute(ch, attrType);
        if (chVal && chVal.trim() !== '') {
          return chVal;
        }
      }
    }
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
        // Mode 1: Extract from container elements (e.g. .product-card, tr, article.Box-row)
        let containers = safeQueryElements(document, params.containerSelector);
        // Fallback to auto-detected card containers if custom selector returned 0 elements
        if (containers.length === 0) {
          containers = findRepeatingCardContainers(document, fields);
        }
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
          if (finalItems.length > 0) {
            return resolve({ success: true, items: finalItems, rowCount: finalItems.length, headers });
          }

          // If excludeEmpty with 'any' filtered out everything because some fields were missing in the card
          // (e.g. price in a GitHub repo card), keep rows that have at least one non-empty value:
          const hasAnyData = items.some(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ''));
          if (hasAnyData) {
            const fallbackItems = items.filter(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ''));
            if (fallbackItems.length > 0) {
              return resolve({ success: true, items: fallbackItems, rowCount: fallbackItems.length, headers });
            }
          }

          // If containers were found, resolve with extracted items directly instead of waiting for timeout
          return resolve({ success: true, items, rowCount: items.length, headers });
        }
      } else {
        // Check if repeating card containers can be found from the fields
        const autoContainers = findRepeatingCardContainers(document, fields);
        if (autoContainers.length > 0) {
          autoContainers.slice(0, 3).forEach((el) => flashHighlight(el));
          const items: Record<string, any>[] = autoContainers.map((container) => {
            const row: Record<string, any> = {};
            for (const field of fields) {
              row[field.name] = extractFieldFromElement(container, field);
            }
            return row;
          });
          const finalItems = filterEmptyRows(items);
          if (finalItems.length > 0) {
            return resolve({ success: true, items: finalItems, rowCount: finalItems.length, headers });
          }

          const hasAnyData = items.some(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ''));
          if (hasAnyData) {
            const fallbackItems = items.filter(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ''));
            if (fallbackItems.length > 0) {
              return resolve({ success: true, items: fallbackItems, rowCount: fallbackItems.length, headers });
            }
          }

          return resolve({ success: true, items, rowCount: items.length, headers });
        }

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

export function getPageInfo(): {
  url: string;
  title: string;
  domain: string;
  origin: string;
  pathname: string;
  search: string;
  hash: string;
  referrer: string;
  canonicalUrl: string;
  metaDescription: string;
  ogImage: string;
  keywords: string;
  contentType: string;
  docStatus: string;
  searchParams: Record<string, string>;
} {
  const loc = typeof window !== 'undefined' ? window.location : ({} as any);
  const doc = typeof document !== 'undefined' ? document : ({} as any);

  const searchParams: Record<string, string> = {};
  try {
    if (loc.search) {
      const sp = new URLSearchParams(loc.search);
      sp.forEach((v, k) => {
        searchParams[k] = v;
      });
    }
  } catch {}

  const canonicalUrl = doc.querySelector?.('link[rel="canonical"]')?.getAttribute('href') || '';
  const metaDescription =
    doc.querySelector?.('meta[name="description"]')?.getAttribute('content') ||
    doc.querySelector?.('meta[property="og:description"]')?.getAttribute('content') ||
    '';
  const ogImage =
    doc.querySelector?.('meta[property="og:image"]')?.getAttribute('content') ||
    doc.querySelector?.('meta[name="twitter:image"]')?.getAttribute('content') ||
    '';
  const keywords = doc.querySelector?.('meta[name="keywords"]')?.getAttribute('content') || '';

  return {
    url: loc.href || '',
    title: doc.title || '',
    domain: loc.hostname || '',
    origin: loc.origin || '',
    pathname: loc.pathname || '',
    search: loc.search || '',
    hash: loc.hash || '',
    referrer: doc.referrer || '',
    canonicalUrl,
    metaDescription,
    ogImage,
    keywords,
    contentType: doc.contentType || '',
    docStatus: doc.readyState || '',
    searchParams,
  };
}

// ==========================================
// FREE DOM SCRAPERS (KEYLESS)
// ==========================================

export async function scrapeYouTube(params: {
  mode?: 'search' | 'video_details' | 'comments' | 'video_script';
  maxResults?: number;
  scriptLanguage?: string;
  scriptFormat?: string;
}): Promise<{ success: boolean; items: Record<string, any>[]; count: number; fullScript?: string }> {
  const mode = params.mode || 'search';
  const maxResults = params.maxResults || 20;
  const items: Record<string, any>[] = [];

  const isWatchPage = window.location.pathname.includes('/watch') || window.location.href.includes('watch?v=');

  // Video Script (Subtitles / Captions / Transcript) Extraction Mode
  if (mode === 'video_script') {
    let captionTracks: any[] = [];
    try {
      const playerResponse = (window as any).ytInitialPlayerResponse ||
        (window as any).ytplayer?.config?.args?.raw_player_response;
      if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
        captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
      }
    } catch {}

    if (captionTracks.length === 0) {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const text = s.textContent || '';
        if (text.includes('captionTracks') && text.includes('baseUrl')) {
          const match = text.match(/"captionTracks":\s*(\[.+?\])/s);
          if (match) {
            try {
              captionTracks = JSON.parse(match[1]);
              if (captionTracks.length > 0) break;
            } catch {}
          }
        }
      }
    }

    if (captionTracks.length > 0) {
      const preferredLang = params.scriptLanguage || 'en';
      const track = captionTracks.find((t: any) => t.languageCode === preferredLang || t.languageCode?.startsWith(preferredLang)) ||
        captionTracks.find((t: any) => t.languageCode === 'en') ||
        captionTracks[0];

      if (track?.baseUrl) {
        try {
          const fetchUrl = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`;
          const res = await fetch(fetchUrl, { credentials: 'include' });
          if (res.ok) {
            const raw = await res.text();
            if (raw.trim().startsWith('{')) {
              const json = JSON.parse(raw);
              const events = json.events || [];
              for (const ev of events) {
                if (!ev.segs) continue;
                const text = ev.segs.map((s: any) => s.utf8 || '').join('').trim();
                if (!text || text === '\n') continue;
                const startSec = (ev.tStartMs || 0) / 1000;
                const durSec = (ev.dDurationMs || 0) / 1000;
                const mins = Math.floor(startSec / 60);
                const secs = Math.floor(startSec % 60);
                const timestamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                items.push({
                  index: items.length + 1,
                  timestamp,
                  startSeconds: startSec,
                  duration: durSec,
                  text,
                });
              }
            } else {
              const parser = new DOMParser();
              const xml = parser.parseFromString(raw, 'text/xml');
              const textNodes = Array.from(xml.querySelectorAll('text'));
              for (const node of textNodes) {
                const start = parseFloat(node.getAttribute('start') || '0');
                const dur = parseFloat(node.getAttribute('dur') || '0');
                const text = node.textContent?.trim() || '';
                if (text) {
                  const mins = Math.floor(start / 60);
                  const secs = Math.floor(start % 60);
                  const timestamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                  items.push({
                    index: items.length + 1,
                    timestamp,
                    startSeconds: start,
                    duration: dur,
                    text,
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn('[AutoFlow] Captions fetch error:', e);
        }
      }
    }

    // Fallback: DOM Transcript panel
    if (items.length === 0) {
      // 1. Expand description first if needed
      const expandBtn = document.querySelector(
        'tp-yt-paper-button#expand, #expand, #description-inline-expander, ytd-text-inline-expander #expand, #expand-sizer'
      ) as HTMLElement | null;
      if (expandBtn) {
        expandBtn.click();
        await new Promise((r) => setTimeout(r, 400));
      }

      // 2. Find genuine "Show transcript" button (exclude filter chips like ytChipShapeButtonReset)
      let transcriptBtn = (document.querySelector(
        'button[aria-label="Show transcript"], yt-button-shape button[aria-label="Show transcript"], ytd-video-description-transcript-section-renderer button, button[aria-label*="Show transcript" i]'
      ) || Array.from(document.querySelectorAll('button, yt-button-shape')).find(
        (b) => {
          const txt = (b.textContent || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return (txt.includes('show transcript') || aria.includes('show transcript')) && !b.classList.contains('ytChipShapeButtonReset');
        }
      )) as HTMLElement | null;

      // 3. If not found in description, inspect "More actions" (...) menu
      if (!transcriptBtn) {
        const moreBtn = document.querySelector(
          '#top-level-buttons-computed ~ #button-shape button, button[aria-label*="More actions" i], ytd-menu-renderer yt-button-shape button, ytd-menu-renderer yt-icon-button button'
        ) as HTMLElement | null;
        if (moreBtn) {
          moreBtn.click();
          await new Promise((r) => setTimeout(r, 400));
          transcriptBtn = (document.querySelector(
            'ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-menu-navigation-item-renderer'
          ) || Array.from(document.querySelectorAll('tp-yt-paper-item, ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, div[role="menuitem"], button')).find(
            (el) => (el.textContent || '').toLowerCase().includes('transcript')
          )) as HTMLElement | null;
        }
      }

      if (transcriptBtn) {
        transcriptBtn.click();
      }

      // 4. Poll up to 6 seconds for transcript segments to render (supports modern and classic YouTube)
      let segs: Element[] = [];
      for (let poll = 0; poll < 20; poll++) {
        await new Promise((r) => setTimeout(r, 300));
        segs = Array.from(document.querySelectorAll(
          'transcript-segment-view-model, ytd-transcript-segment-renderer, .ytwTranscriptSegmentViewModelHost, macro-markers-panel-item-view-model'
        ));
        if (segs.length > 0) break;
      }

      if (segs.length > 0) {
        // If modern transcript-segment-view-model is inside macro-markers-panel-item-view-model, filter to avoid duplicate counts
        const hasSpecificSegments = segs.some(s => s.tagName.toLowerCase() === 'transcript-segment-view-model' || s.tagName.toLowerCase() === 'ytd-transcript-segment-renderer');
        const targetSegs = hasSpecificSegments
          ? segs.filter(s => s.tagName.toLowerCase() === 'transcript-segment-view-model' || s.tagName.toLowerCase() === 'ytd-transcript-segment-renderer')
          : segs;

        for (let i = 0; i < targetSegs.length; i++) {
          const seg = targetSegs[i];
          const time = seg.querySelector('.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp, [class*="Timestamp"]')?.textContent?.trim() || '';
          const text = seg.querySelector('[role="text"], .ytAttributedStringHost, .segment-text, [class*="segment-text"], yt-formatted-string')?.textContent?.trim() || '';
          if (text) {
            items.push({
              index: items.length + 1,
              timestamp: time,
              text,
            });
          }
        }
      }
    }

    const fullScript = items.map((i) => (i.timestamp ? `[${i.timestamp}] ${i.text}` : i.text)).join('\n');
    return {
      success: true,
      items,
      count: items.length,
      fullScript,
    };
  }

  if (mode === 'comments' || (isWatchPage && mode === 'search' && !document.querySelector('ytd-video-renderer, ytd-rich-item-renderer'))) {
    const commentEls = document.querySelectorAll('ytd-comment-thread-renderer, #comment');
    for (let i = 0; i < commentEls.length && items.length < maxResults; i++) {
      const el = commentEls[i];
      const authorEl = el.querySelector('#author-text span, #author-text, .ytd-comment-view-model__author');
      const textEl = el.querySelector('#content-text, .yt-core-attributed-string');
      const likesEl = el.querySelector('#vote-count-middle, [aria-label*="likes"]');
      const timeEl = el.querySelector('.published-time-text a, #header-author span.published-time-text');
      const avatarEl = el.querySelector('#author-thumbnail img, img.yt-img-shadow') as HTMLImageElement | null;

      const author = authorEl?.textContent?.trim() || '';
      const text = textEl?.textContent?.trim() || '';
      if (text || author) {
        items.push({
          author,
          text,
          likes: likesEl?.textContent?.trim() || '0',
          published: timeEl?.textContent?.trim() || '',
          avatar: avatarEl?.src || '',
        });
      }
    }
  }

  if (mode === 'video_details' || (isWatchPage && items.length === 0)) {
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1 yt-formatted-string') || document.querySelector('title');
    const channelEl = document.querySelector('ytd-video-owner-renderer #channel-name a, #channel-name a, ytd-channel-name a');
    const subsEl = document.querySelector('#owner-sub-count');
    const viewsEl = document.querySelector('#info-container #info span:first-child, meta[itemprop="interactionCount"], ytd-watch-info-text #info span');
    const likesEl = document.querySelector('like-button-view-model button, #top-level-buttons-computed button, button[aria-label*="like"]');
    const descEl = document.querySelector('#description-inline-expander, #description yt-formatted-string, ytd-text-inline-expander');
    const metaThumb = (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content ||
      (document.querySelector('link[rel="image_src"]') as HTMLLinkElement)?.href || '';
    const commentsCountEl = document.querySelector('#comments #count, ytd-comments-header-renderer #count, #comments-header #count');
    const topCommentEl = document.querySelector('#comments ytd-comment-thread-renderer #content-text');

    const videoTitle = titleEl?.textContent?.trim() || '';
    if (videoTitle) {
      const rawViews = viewsEl?.textContent?.trim() || (viewsEl?.getAttribute?.('content') ?? '');
      const rawLikes = likesEl?.textContent?.trim() || likesEl?.getAttribute?.('aria-label') || '';
      const cleanLikes = rawLikes.includes('along with')
        ? (rawLikes.match(/along with ([\d,]+)/i)?.[1] || rawLikes)
        : rawLikes;

      items.push({
        title: videoTitle,
        url: window.location.href,
        channel: channelEl?.textContent?.trim() || '',
        channelUrl: (channelEl as HTMLAnchorElement)?.href || '',
        subscribers: subsEl?.textContent?.trim() || '',
        channelSubscribers: subsEl?.textContent?.trim() || '',
        views: rawViews,
        totalViews: rawViews,
        likes: cleanLikes,
        description: descEl?.textContent?.trim() || '',
        thumbnail: metaThumb,
        commentsCount: commentsCountEl?.textContent?.trim() || '',
        topComment: topCommentEl?.textContent?.trim() || '',
      });
      if (mode === 'video_details') {
        return { success: true, items, count: items.length };
      }
    }
  }

  if (items.length === 0) {
    const videoNodes = document.querySelectorAll(
      'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer'
    );
    for (let i = 0; i < videoNodes.length && items.length < maxResults; i++) {
      const node = videoNodes[i];
      const titleLink = (node.querySelector('a#video-title, #video-title-link, a#thumbnail, a.ytd-thumbnail, h3 a, a[href*="/watch?v="]') || node.closest('a')) as HTMLAnchorElement | null;
      const titleEl = node.querySelector('#video-title, yt-formatted-string#video-title, h3, #video-title-link, .title');
      const title = titleEl?.textContent?.trim() || titleLink?.getAttribute('title') || titleLink?.textContent?.trim() || '';

      let href = titleLink?.href || (node.querySelector('a#thumbnail') as HTMLAnchorElement)?.href || '';
      if (!href && titleLink?.getAttribute) {
        const rel = titleLink.getAttribute('href') || '';
        if (rel) href = rel.startsWith('http') ? rel : `https://www.youtube.com${rel}`;
      }

      if (!title || !href || href.includes('channel/') || href.includes('/@')) continue;

      const channelEl = node.querySelector('#channel-name a, .ytd-channel-name a, #byline a') as HTMLAnchorElement | null;
      const metaSpans = node.querySelectorAll('#metadata-line span, .ytd-video-meta-block span');
      const views = metaSpans[0]?.textContent?.trim() || '';
      const uploaded = metaSpans[1]?.textContent?.trim() || '';
      const durationEl = node.querySelector('ytd-thumbnail-overlay-time-status-renderer span, .badge-shape-wiz__text, badge-shape-wiz');
      const thumbEl = node.querySelector('ytd-thumbnail img, img.yt-core-image, img') as HTMLImageElement | null;

      items.push({
        title,
        url: href,
        channel: channelEl?.textContent?.trim() || '',
        channelUrl: channelEl?.href || '',
        views,
        uploaded,
        duration: durationEl?.textContent?.trim() || '',
        thumbnail: thumbEl?.src || '',
      });
    }
  }

  return { success: true, items, count: items.length };
}

export async function scrapeInstagram(params: {
  mode?: 'profile_posts' | 'hashtag_posts' | 'profile_info';
  maxResults?: number;
}): Promise<{ success: boolean; items: Record<string, any>[]; count: number }> {
  const mode = params.mode || 'profile_posts';
  const maxResults = params.maxResults || 15;
  const items: Record<string, any>[] = [];

  const isPostPage = window.location.pathname.includes('/p/') || window.location.pathname.includes('/reel/');

  if (mode === 'profile_info' || (!isPostPage && document.querySelector('header'))) {
    const header = document.querySelector('header');
    const usernameEl = header?.querySelector('h1, h2, section span');
    const statItems = header?.querySelectorAll('ul li') || [];
    const bioEl = header?.querySelector('div > span, section > div:last-child, ._aa_c');
    const avatarEl = header?.querySelector('img') as HTMLImageElement | null;

    if (usernameEl || statItems.length > 0) {
      items.push({
        username: usernameEl?.textContent?.trim() || window.location.pathname.replace(/\//g, ''),
        postsCount: statItems[0]?.textContent?.trim() || '',
        followers: statItems[1]?.textContent?.trim() || '',
        following: statItems[2]?.textContent?.trim() || '',
        bio: bioEl?.textContent?.trim() || '',
        avatar: avatarEl?.src || '',
        url: window.location.href,
      });
      if (mode === 'profile_info') {
        return { success: true, items, count: items.length };
      }
    }
  }

  // Single post page
  if (isPostPage && items.length === 0) {
    const authorEl = document.querySelector('article header a, article h2 a');
    const captionEl = document.querySelector('article ul li h1, article ul li span, article h1');
    const imgEl = document.querySelector('article img[srcset], article img') as HTMLImageElement | null;
    const likesEl = document.querySelector('section a[href*="/liked_by/"] span, section span');

    items.push({
      author: authorEl?.textContent?.trim() || '',
      caption: captionEl?.textContent?.trim() || '',
      url: window.location.href,
      image: imgEl?.src || '',
      likes: likesEl?.textContent?.trim() || '',
      isVideo: !!document.querySelector('video'),
    });
    return { success: true, items, count: items.length };
  }

  const postLinks = document.querySelectorAll(
    'main a[href*="/p/"], main a[href*="/reel/"], article a[href*="/p/"], article a[href*="/reel/"], a[role="link"][href*="/p/"]'
  );
  const seen = new Set<string>();

  for (let i = 0; i < postLinks.length && items.length < maxResults; i++) {
    const link = postLinks[i] as HTMLAnchorElement;
    let href = link.href || link.getAttribute('href') || '';
    if (href.startsWith('/')) href = `https://www.instagram.com${href}`;
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const img = link.querySelector('img') as HTMLImageElement | null;
    const isReel = href.includes('/reel/');

    items.push({
      url: href,
      caption: img?.alt || '',
      image: img?.src || '',
      isVideo: isReel || !!link.querySelector('video, svg[aria-label*="Clip"], svg[aria-label*="Reels"]'),
    });
  }

  return { success: true, items, count: items.length };
}

export async function scrapeReddit(params: {
  mode?: 'subreddit' | 'search' | 'post_comments';
  maxResults?: number;
}): Promise<{ success: boolean; items: Record<string, any>[]; count: number }> {
  const maxResults = params.maxResults || 25;
  const items: Record<string, any>[] = [];

  const isPostPage = window.location.pathname.includes('/comments/');

  if (params.mode === 'post_comments' || isPostPage) {
    const postTitle = document.querySelector('h1[slot="title"], h1, shreddit-post')?.textContent?.trim() || '';
    const postAuthor = document.querySelector('shreddit-post')?.getAttribute('author') || '';

    const commentEls = document.querySelectorAll('shreddit-comment, div[data-testid="comment"]');
    for (let i = 0; i < commentEls.length && items.length < maxResults; i++) {
      const el = commentEls[i];
      const author = el.getAttribute('author') || el.querySelector('a[href*="/user/"]')?.textContent?.trim() || '';
      const score = el.getAttribute('score') || el.querySelector('[score]')?.getAttribute('score') || '';
      const textEl = el.querySelector('[slot="comment"], div.-m-1, .md, p');

      items.push({
        postTitle,
        postAuthor,
        author,
        score,
        text: textEl?.textContent?.trim() || '',
      });
    }

    if (items.length > 0) {
      return { success: true, items, count: items.length };
    }
  }

  // Posts listing
  const postEls = document.querySelectorAll('shreddit-post, div[data-testid="post-container"], .Post, .thing');
  for (let i = 0; i < postEls.length && items.length < maxResults; i++) {
    const el = postEls[i];
    const title = el.getAttribute('post-title') || el.querySelector('a[slot="title"], h3, .title a')?.textContent?.trim() || '';
    const permalink = el.getAttribute('permalink') || (el.querySelector('a[slot="title"], a[data-click-id="body"], .title a') as HTMLAnchorElement)?.href || '';
    const author = el.getAttribute('author') || el.querySelector('a[href*="/user/"], .author')?.textContent?.trim() || '';
    const score = el.getAttribute('score') || el.querySelector('[score], .score')?.getAttribute('score') || el.querySelector('.score')?.textContent?.trim() || '';
    const comments = el.getAttribute('comment-count') || el.querySelector('a[data-click-id="comments"], .comments')?.textContent?.trim() || '';
    const subreddit = el.getAttribute('subreddit-prefixed-name') || el.querySelector('a[href*="/r/"]')?.textContent?.trim() || '';

    const fullUrl = permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`;

    if (title) {
      items.push({
        title,
        url: fullUrl,
        author,
        score,
        commentsCount: comments,
        subreddit,
      });
    }
  }

  return { success: true, items, count: items.length };
}

export async function scrapeLinkedIn(params: {
  mode?: 'jobs_search' | 'job_detail' | 'public_profile';
  maxResults?: number;
}): Promise<{ success: boolean; items: Record<string, any>[]; count: number }> {
  const mode = params.mode || 'jobs_search';
  const maxResults = params.maxResults || 15;
  const items: Record<string, any>[] = [];

  const isProfilePage = window.location.pathname.includes('/in/');
  const isJobViewPage = window.location.pathname.includes('/jobs/view/');

  if (mode === 'public_profile' || isProfilePage) {
    const nameEl = document.querySelector('h1.top-card-layout__title, h1, .text-heading-xlarge');
    const headlineEl = document.querySelector('h2.top-card-layout__headline, .text-body-medium');
    const locationEl = document.querySelector('.top-card-layout__first-subline, .profile-location, .text-body-small.inline');
    const aboutEl = document.querySelector('section.summary div, [data-section="summary"], .display-flex.ph5.pv3');

    if (nameEl) {
      items.push({
        name: nameEl?.textContent?.trim() || '',
        headline: headlineEl?.textContent?.trim() || '',
        location: locationEl?.textContent?.trim() || '',
        about: aboutEl?.textContent?.trim() || '',
        url: window.location.href,
      });
      return { success: true, items, count: items.length };
    }
  }

  if (mode === 'job_detail' || isJobViewPage) {
    const titleEl = document.querySelector('h1.topcard__title, h1.job-details-jobs-unified-top-card__job-title, h1');
    const companyEl = document.querySelector('a.topcard__org-name-link, .job-details-jobs-unified-top-card__company-name, .topcard__flavor a');
    const locationEl = document.querySelector('.topcard__flavor--bullet, .job-details-jobs-unified-top-card__workplace-type, .topcard__flavor');
    const descEl = document.querySelector('.description__text, .jobs-description__content, #job-details');

    if (titleEl) {
      items.push({
        title: titleEl?.textContent?.trim() || '',
        company: companyEl?.textContent?.trim() || '',
        companyUrl: (companyEl as HTMLAnchorElement)?.href || '',
        location: locationEl?.textContent?.trim() || '',
        description: descEl?.textContent?.trim() || '',
        url: window.location.href,
      });
      return { success: true, items, count: items.length };
    }
  }

  const jobCards = document.querySelectorAll(
    'ul.jobs-search__results-list li, .job-search-card, .base-card, .jobs-search-results__list-item, div[data-job-id]'
  );
  for (let i = 0; i < jobCards.length && items.length < maxResults; i++) {
    const card = jobCards[i];
    const titleEl = card.querySelector('.base-search-card__title, h3.base-search-card__title, .job-card-list__title, h3');
    const companyEl = card.querySelector('.base-search-card__subtitle, h4.base-search-card__subtitle, .job-card-container__company-name, h4');
    const locationEl = card.querySelector('.job-search-card__location, .job-card-container__metadata-item');
    const linkEl = card.querySelector('a.base-card__full-link, a.job-card-list__title, a') as HTMLAnchorElement | null;
    const dateEl = card.querySelector('time');

    const title = titleEl?.textContent?.trim() || '';
    if (!title) continue;

    items.push({
      title,
      company: companyEl?.textContent?.trim() || '',
      location: locationEl?.textContent?.trim() || '',
      url: linkEl?.href || '',
      datePosted: dateEl?.textContent?.trim() || dateEl?.getAttribute('datetime') || '',
    });
  }

  return { success: true, items, count: items.length };
}

export async function scrapeAmazon(params: {
  mode?: 'search' | 'product_reviews';
  maxResults?: number;
}): Promise<{ success: boolean; items: Record<string, any>[]; count: number }> {
  const mode = params.mode || 'search';
  const maxResults = params.maxResults || 20;
  const items: Record<string, any>[] = [];

  const isProductDetailPage = window.location.pathname.includes('/dp/') || window.location.pathname.includes('/gp/product/');
  const isReviewsPage = window.location.pathname.includes('/product-reviews/');

  if (mode === 'product_reviews' || isReviewsPage) {
    const reviewCards = document.querySelectorAll('div[data-hook="review"], .review');
    for (let i = 0; i < reviewCards.length && items.length < maxResults; i++) {
      const card = reviewCards[i];
      const reviewer = card.querySelector('.a-profile-name')?.textContent?.trim() || '';
      const title = card.querySelector('[data-hook="review-title"] span, .review-title')?.textContent?.trim() || '';
      const rating = card.querySelector('[data-hook="review-star-rating"] span, i.a-icon-star span, .review-rating')?.textContent?.trim() || '';
      const date = card.querySelector('[data-hook="review-date"]')?.textContent?.trim() || '';
      const body = card.querySelector('[data-hook="review-body"] span, .review-text')?.textContent?.trim() || '';
      const verified = !!card.querySelector('[data-hook="avp-badge"]');

      items.push({
        reviewer,
        title,
        rating,
        date,
        text: body,
        verified,
      });
    }
    if (items.length > 0) {
      return { success: true, items, count: items.length };
    }
  }

  // If user opened a product detail page manually, extract full product info!
  if (isProductDetailPage) {
    const titleEl = document.querySelector('#productTitle, #title');
    const title = titleEl?.textContent?.trim() || '';
    if (title) {
      const priceWhole = document.querySelector('.a-price-whole')?.textContent?.trim() || '';
      const priceFraction = document.querySelector('.a-price-fraction')?.textContent?.trim() || '';
      const offscreenPrice = document.querySelector('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice')?.textContent?.trim() || '';
      const price = offscreenPrice || (priceWhole ? `${priceWhole}${priceFraction ? '.' + priceFraction : ''}` : '');
      const rating = document.querySelector('#acrPopover')?.getAttribute('title') || document.querySelector('i.a-icon-star span')?.textContent?.trim() || '';
      const reviewsCount = document.querySelector('#acrCustomerReviewText')?.textContent?.trim() || '';
      const isPrime = !!document.querySelector('#primeSavingsUpper, #primeBadge, .a-icon-prime');
      const img = (document.querySelector('#landingImage, #imgBlkFront') as HTMLImageElement)?.src || '';
      const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/i) || window.location.href.match(/\/dp\/([A-Z0-9]{10})/i);
      const asin = asinMatch ? asinMatch[1] : '';

      items.push({
        asin,
        title,
        price,
        rating,
        reviewsCount,
        isPrime,
        url: window.location.href,
        thumbnail: img,
      });
      return { success: true, items, count: items.length };
    }
  }

  // Search Results
  const productCards = document.querySelectorAll(
    'div[data-component-type="s-search-result"], .s-result-item[data-asin]:not([data-asin=""])'
  );
  for (let i = 0; i < productCards.length && items.length < maxResults; i++) {
    const card = productCards[i];
    const asin = card.getAttribute('data-asin') || '';
    if (!asin) continue;

    const titleEl = card.querySelector('h2 a span, h2 span, h2 a');
    const title = titleEl?.textContent?.trim() || '';
    if (!title) continue;

    const linkEl = card.querySelector('h2 a') as HTMLAnchorElement | null;
    let url = linkEl?.href || '';
    if (url.startsWith('/')) url = `https://www.amazon.com${url}`;

    const priceWhole = card.querySelector('.a-price-whole')?.textContent?.trim() || '';
    const priceFraction = card.querySelector('.a-price-fraction')?.textContent?.trim() || '';
    const offscreenPrice = card.querySelector('.a-price .a-offscreen')?.textContent?.trim() || '';
    const price = offscreenPrice || (priceWhole ? `${priceWhole}${priceFraction ? '.' + priceFraction : ''}` : '');

    const ratingEl = card.querySelector('i.a-icon-star-small span, span[aria-label*="out of 5 stars"]');
    const rating = ratingEl?.textContent?.trim() || ratingEl?.getAttribute('aria-label') || '';

    const reviewsEl = card.querySelector('span[aria-label*="out of 5 stars"] ~ span, a[href*="#customerReviews"] span');
    const reviewsCount = reviewsEl?.textContent?.trim() || '';

    const imgEl = card.querySelector('img.s-image') as HTMLImageElement | null;
    const isPrime = !!card.querySelector('.a-icon-prime, span[aria-label="Amazon Prime"]');

    items.push({
      asin,
      title,
      price,
      rating,
      reviewsCount,
      isPrime,
      url,
      thumbnail: imgEl?.src || '',
    });
  }

  return { success: true, items, count: items.length };
}

export async function scrapeTwitter(params: {
  mode?: 'search' | 'profile_tweets';
  maxResults?: number;
}): Promise<{ success: boolean; items: Record<string, any>[]; count: number }> {
  const maxResults = params.maxResults || 15;
  const items: Record<string, any>[] = [];

  const tweetEls = document.querySelectorAll(
    'article[data-testid="tweet"], article[role="article"], div[data-testid="cellInnerDiv"] article'
  );
  for (let i = 0; i < tweetEls.length && items.length < maxResults; i++) {
    const el = tweetEls[i];
    const userEl = el.querySelector('div[data-testid="User-Name"]');
    const textEl = el.querySelector('div[data-testid="tweetText"], div[lang]');
    const timeEl = el.querySelector('time');
    const linkEl = el.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;

    const replyEl = el.querySelector('div[data-testid="reply"]');
    const retweetEl = el.querySelector('div[data-testid="retweet"]');
    const likeEl = el.querySelector('div[data-testid="like"]');

    const author = userEl?.querySelector('span')?.textContent?.trim() || '';
    const text = textEl?.textContent?.trim() || '';
    const href = linkEl?.href || '';

    if (text || author) {
      items.push({
        author,
        text,
        url: href,
        timestamp: timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || '',
        replies: replyEl?.textContent?.trim() || '0',
        retweets: retweetEl?.textContent?.trim() || '0',
        likes: likeEl?.textContent?.trim() || '0',
      });
    }
  }

  return { success: true, items, count: items.length };
}

export async function scrapeGoogleSearch(params: {
  mode?: 'organic_search' | 'news_search';
  maxResults?: number;
}): Promise<{ success: boolean; items: Record<string, any>[]; count: number }> {
  const maxResults = params.maxResults || 10;
  const items: Record<string, any>[] = [];

  const resultCards = document.querySelectorAll('#search .g, div.tF2Cxc, div.MjjYud, div[data-sokoban-container], div.g');
  for (let i = 0; i < resultCards.length && items.length < maxResults; i++) {
    const card = resultCards[i];
    const titleEl = card.querySelector('h3');
    if (!titleEl) continue;

    const linkEl = (card.querySelector('a[href^="http"]') || titleEl.closest('a') || card.querySelector('a')) as HTMLAnchorElement | null;
    const href = linkEl?.href || '';
    if (!href || href.includes('google.com/search')) continue;

    const snippetEl = card.querySelector('div[data-sncf], .VwiC3b, .IsZvec, .yXK7lf');
    const citeEl = card.querySelector('cite');

    items.push({
      title: titleEl.textContent?.trim() || '',
      url: href,
      snippet: snippetEl?.textContent?.trim() || '',
      displayedUrl: citeEl?.textContent?.trim() || '',
    });
  }

  // Fallback to all search headings if structured containers changed
  if (items.length === 0) {
    const allH3 = document.querySelectorAll('#rso h3, #search h3, h3');
    for (let i = 0; i < allH3.length && items.length < maxResults; i++) {
      const titleEl = allH3[i];
      const linkEl = titleEl.closest('a') as HTMLAnchorElement | null;
      if (!linkEl || !linkEl.href || linkEl.href.includes('google.com/search')) continue;
      const container = titleEl.closest('.g') || titleEl.closest('div.MjjYud') || titleEl.parentElement?.parentElement;
      const snippetEl = container?.querySelector('div[data-sncf], .VwiC3b, .IsZvec, .yXK7lf, div[style*="-webkit-line-clamp"]');
      items.push({
        title: titleEl.textContent?.trim() || '',
        url: linkEl.href,
        snippet: snippetEl?.textContent?.trim() || '',
        displayedUrl: '',
      });
    }
  }

  return { success: true, items, count: items.length };
}



