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

let cursorEl: HTMLDivElement | null = null;
let clickResetTimer: ReturnType<typeof setTimeout> | null = null;
let idleFadeTimer: ReturnType<typeof setTimeout> | null = null;
let currentPos: HumanPoint = { x: -60, y: -60 };
let hasPosition = false;

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

  const from = hasPosition ? { ...currentPos } : { x: target.x, y: target.y };
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
 * Animates the cursor onto an element's center (with a small human offset and
 * pre-action hover pause), then returns the exact point to click.
 */
export async function approachElement(
  el: Element,
  config: HumanConfig,
  signal?: AbortSignal,
  options: { center?: boolean; pause?: number } = {}
): Promise<{ x: number; y: number }> {
  let point = { x: 0, y: 0 };
  try {
    const rect = el.getBoundingClientRect();
    const useCenter = options.center !== false;
    point = {
      x: rect.left + rect.width * (useCenter ? 0.5 : 0.35) + (Math.random() * 4 - 2),
      y: rect.top + rect.height * (useCenter ? 0.5 : 0.4) + (Math.random() * 4 - 2),
    };
  } catch {
    return point;
  }

  await moveCursorTo(point, config, signal);

  const pause = options.pause ?? actionPause(config);
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
