import {
  HumanConfig,
  HumanPoint,
  buildCursorPath,
  cursorTravelDuration,
  actionPause,
  typingDelayFor,
  wait,
} from '../utils/human';

/**
 * Content-script side of Human Mode: a synthetic cursor overlay that travels along
 * curved paths (dispatching real mousemove events so page hover states fire) plus
 * small, jittered pauses around actions.
 *
 * The overlay is cosmetic chrome only — it is `pointer-events: none` and never
 * affects hit-testing, so clicks still land on real element coordinates.
 */

const CURSOR_ID = 'autoflow-human-cursor';
const VISIBLE_CLASS = 'autoflow-cursor--visible';
const CLICK_CLASS = 'autoflow-cursor--click';
const PRESSED_CLASS = 'autoflow-cursor--pressed';

let cursorEl: HTMLDivElement | null = null;
let clickResetTimer: ReturnType<typeof setTimeout> | null = null;
let idleFadeTimer: ReturnType<typeof setTimeout> | null = null;
let currentPos: HumanPoint = { x: -60, y: -60 };
let hasPosition = false;
let lastKnownPointer: HumanPoint | null = null;

// Track genuine user mouse position if available
if (typeof window !== 'undefined') {
  try {
    window.addEventListener(
      'mousemove',
      (e: MouseEvent) => {
        lastKnownPointer = { x: e.clientX, y: e.clientY };
      },
      { passive: true, capture: true }
    );
  } catch {}
}

/** How long the cursor lingers after the last movement before fading out. */
const IDLE_FADE_MS = 2500;

/** (Re)starts the idle countdown that fades the cursor out once a run goes quiet. */
function scheduleIdleFade() {
  if (idleFadeTimer) clearTimeout(idleFadeTimer);
  idleFadeTimer = setTimeout(() => {
    idleFadeTimer = null;
    hideHumanCursor();
  }, IDLE_FADE_MS);
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

/** Current synthetic cursor position (viewport coords). Exposed for tests/diagnostics. */
export function getCursorPosition(): HumanPoint {
  return { ...currentPos };
}

function ensureCursorEl(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (cursorEl && cursorEl.isConnected) return cursorEl;

  const host = document.documentElement || document.body;
  if (!host) return null;

  const el = document.createElement('div');
  el.id = CURSOR_ID;
  el.className = 'autoflow-cursor';
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-autoflow-ignore', 'true');
  el.style.left = `${Math.round(currentPos.x)}px`;
  el.style.top = `${Math.round(currentPos.y)}px`;
  host.appendChild(el);
  cursorEl = el;
  return el;
}

function dispatchMousemove(x: number, y: number) {
  try {
    const target = document.elementFromPoint(x, y) || document.body;
    if (!target) return;
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
    };
    target.dispatchEvent(new MouseEvent('mousemove', init));

    // Dynamic cursor styling when hovering clickable or text elements
    if (cursorEl) {
      const isClickable = target.closest('button, a, input[type="button"], input[type="submit"], [role="button"], select');
      const isInput = target.closest('input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
      if (isClickable) {
        cursorEl.classList.add('autoflow-cursor--pointer');
        cursorEl.classList.remove('autoflow-cursor--text');
      } else if (isInput) {
        cursorEl.classList.add('autoflow-cursor--text');
        cursorEl.classList.remove('autoflow-cursor--pointer');
      } else {
        cursorEl.classList.remove('autoflow-cursor--pointer');
        cursorEl.classList.remove('autoflow-cursor--text');
      }
    }
  } catch {
    // Views without layout (or non-DOM test environments) simply skip the synthetic event.
  }
}

/**
 * Moves the synthetic cursor to a viewport point along a human-ish curved path.
 * No-op when `config.cursor` is disabled or no DOM is available.
 */
export async function moveCursorTo(
  target: HumanPoint,
  config: HumanConfig,
  signal?: AbortSignal
): Promise<void> {
  if (!config.cursor) return;

  const el = ensureCursorEl();
  if (!el || signal?.aborted) return;

  // Real entry point: if we haven't established position yet, enter gracefully
  let from: HumanPoint;
  if (hasPosition) {
    from = { ...currentPos };
  } else if (lastKnownPointer) {
    from = { ...lastKnownPointer };
  } else if (typeof window !== 'undefined') {
    // Enter smoothly from realistic viewport top or side
    const startX = Math.round(window.innerWidth > 100 ? window.innerWidth * 0.35 : 20);
    from = { x: startX, y: 0 };
    currentPos = { ...from };
  } else {
    from = { x: target.x, y: target.y };
  }

  el.style.left = `${Math.round(from.x)}px`;
  el.style.top = `${Math.round(from.y)}px`;
  el.classList.add(VISIBLE_CLASS);

  const path = buildCursorPath(from, target, { reduceMotion: prefersReducedMotion() });
  const distance = Math.hypot(target.x - from.x, target.y - from.y);
  const perStep = path.length > 1 ? cursorTravelDuration(distance, config) / (path.length - 1) : 0;

  let last: HumanPoint = from;
  for (let i = 1; i < path.length; i++) {
    if (signal?.aborted) break;
    const p = path[i];
    last = p;
    el.style.left = `${Math.round(p.x)}px`;
    el.style.top = `${Math.round(p.y)}px`;
    dispatchMousemove(p.x, p.y);
    if (perStep > 0) await wait(perStep, signal);
  }

  currentPos = signal?.aborted ? { ...last } : { ...target };
  hasPosition = true;
  scheduleIdleFade();
}

/** Sets or clears the visual press (depressed button) state on the cursor. */
export function markCursorPress(pressed: boolean, config?: HumanConfig) {
  if (config && !config.cursor) return;
  const el = cursorEl;
  if (!el) return;
  if (pressed) {
    el.classList.add(PRESSED_CLASS);
  } else {
    el.classList.remove(PRESSED_CLASS);
  }
}

/** Briefly flashes the press/ripple state on the synthetic cursor. */
export function markCursorClick(config?: HumanConfig) {
  if (config && !config.cursor) return;
  const el = cursorEl;
  if (!el) return;

  el.classList.add(CLICK_CLASS);
  if (clickResetTimer) clearTimeout(clickResetTimer);
  clickResetTimer = setTimeout(() => {
    el.classList.remove(CLICK_CLASS);
    clickResetTimer = null;
  }, 180);
}

/** Fades the cursor out (used when a run finishes). */
export function hideHumanCursor() {
  if (!cursorEl) return;
  cursorEl.classList.remove(VISIBLE_CLASS);
  cursorEl.classList.remove(CLICK_CLASS);
}

/** Removes the overlay entirely (used when Human Mode is turned off). */
export function teardownHumanCursor() {
  if (clickResetTimer) {
    clearTimeout(clickResetTimer);
    clickResetTimer = null;
  }
  if (idleFadeTimer) {
    clearTimeout(idleFadeTimer);
    idleFadeTimer = null;
  }
  cursorEl?.remove();
  cursorEl = null;
  hasPosition = false;
  currentPos = { x: -60, y: -60 };
}

/**
 * Waits for an element's position on the screen to settle (e.g. after smooth scroll or layout transitions).
 */
export async function waitForElementSettle(el: Element, timeoutMs = 600, signal?: AbortSignal): Promise<DOMRect> {
  if (typeof window === 'undefined' || typeof el.getBoundingClientRect !== 'function') {
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  }
  let prevRect = el.getBoundingClientRect();
  const startTime = Date.now();
  let stableTicks = 0;

  while (Date.now() - startTime < timeoutMs) {
    if (signal?.aborted) break;
    await wait(35, signal);
    const currRect = el.getBoundingClientRect();
    const delta = Math.hypot(currRect.left - prevRect.left, currRect.top - prevRect.top);
    if (delta < 1) {
      stableTicks++;
      if (stableTicks >= 2) return currRect;
    } else {
      stableTicks = 0;
    }
    prevRect = currRect;
  }
  return el.getBoundingClientRect();
}

/**
 * Animates the cursor onto an element's center or inner bounds (with scroll-settle detection,
 * human distribution and pre-click aiming pause), then returns the exact coordinates where the cursor landed.
 */
export async function approachElement(
  el: Element,
  config: HumanConfig,
  signal?: AbortSignal,
  options: { center?: boolean; pause?: number } = {}
): Promise<{ x: number; y: number }> {
  let point = { x: 0, y: 0 };
  if (!el || typeof el.getBoundingClientRect !== 'function') return point;

  // 1. If element is not in viewport, smoothly scroll it into view
  if (typeof window !== 'undefined' && typeof el.scrollIntoView === 'function') {
    const initRect = el.getBoundingClientRect();
    const inViewport = (
      initRect.top >= 20 &&
      initRect.left >= 20 &&
      initRect.bottom <= (window.innerHeight - 20) &&
      initRect.right <= (window.innerWidth - 20)
    );
    if (!inViewport && (initRect.width > 0 || initRect.height > 0)) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } catch {}
    }
  }

  // 2. Wait for any scroll animation or layout transition to settle
  const rect = await waitForElementSettle(el, 600, signal);

  // 3. Aim inside the target element with natural human spread
  const useCenter = options.center !== false;
  if (useCenter) {
    point = {
      x: rect.left + rect.width * 0.5 + (Math.random() * 4 - 2),
      y: rect.top + rect.height * 0.5 + (Math.random() * 4 - 2),
    };
  } else {
    const padX = Math.min(10, Math.max(2, rect.width * 0.15));
    const padY = Math.min(10, Math.max(2, rect.height * 0.15));
    const innerW = Math.max(4, rect.width - padX * 2);
    const innerH = Math.max(4, rect.height - padY * 2);
    point = {
      x: rect.left + padX + innerW * (0.35 + (Math.random() + Math.random()) * 0.15),
      y: rect.top + padY + innerH * (0.35 + (Math.random() + Math.random()) * 0.15),
    };
  }

  // 4. Move synthetic cursor along curved path to target
  await moveCursorTo(point, config, signal);

  // 5. Aiming hesitation (cognitive verification pause before click)
  const pause = options.pause !== undefined
    ? options.pause
    : (config.aimHesitationMin ? clusteredBetween(config.aimHesitationMin, config.aimHesitationMax) : actionPause(config));
  if (pause > 0) await wait(pause, signal);

  return point;
}

/** Humanized per-character delay, or undefined when the caller should decide. */
export function humanTypingDelay(config: HumanConfig, character?: string): number {
  return typingDelayFor(config, character);
}

/** Short pre/post action pause. */
export function humanActionPause(config: HumanConfig, factor = 1, signal?: AbortSignal): Promise<void> {
  return wait(actionPause(config, factor), signal);
}
