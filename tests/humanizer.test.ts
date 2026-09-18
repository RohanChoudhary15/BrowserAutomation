import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HUMAN_INTENSITY_PRESETS,
  buildCursorPath,
  clusteredBetween,
  gaussian01,
  randomBetween,
  resolveHumanConfig,
  typingDelayFor,
  wait,
} from '../src/utils/human';
import {
  approachElement,
  getCursorPosition,
  hideHumanCursor,
  markCursorClick,
  moveCursorTo,
  prefersReducedMotion,
  teardownHumanCursor,
} from '../src/content/humanizer';

const fastConfig = () => ({
  ...resolveHumanConfig({ humanMode: true })!,
  minDelay: 1,
  maxDelay: 2,
  actionPauseMin: 1,
  actionPauseMax: 2,
  typingMin: 1,
  typingMax: 2,
});

describe('Human Mode config', () => {
  it('is undefined when Human Mode is off (zero overhead by default)', () => {
    expect(resolveHumanConfig(undefined)).toBeUndefined();
    expect(resolveHumanConfig(null)).toBeUndefined();
    expect(resolveHumanConfig({ humanMode: false })).toBeUndefined();
  });

  it('defaults to natural pacing with the cursor enabled', () => {
    const cfg = resolveHumanConfig({ humanMode: true })!;
    expect(cfg.intensity).toBe('natural');
    expect(cfg.cursor).toBe(true);
    expect(cfg.minDelay).toBe(HUMAN_INTENSITY_PRESETS.natural.minDelay);
    expect(cfg.maxDelay).toBe(HUMAN_INTENSITY_PRESETS.natural.maxDelay);
  });

  it('honours an explicit intensity and falls back on an invalid one', () => {
    expect(resolveHumanConfig({ humanMode: true, humanIntensity: 'slow' })!.intensity).toBe('slow');
    expect(resolveHumanConfig({ humanMode: true, humanIntensity: 'nonsense' as any })!.intensity).toBe('natural');
  });

  it('lets explicit delay overrides win and keeps max >= min', () => {
    const cfg = resolveHumanConfig({ humanMode: true, humanMinDelay: 5, humanMaxDelay: 1 })!;
    expect(cfg.minDelay).toBe(5);
    expect(cfg.maxDelay).toBe(5);
  });

  it('respects the cursor opt-out', () => {
    expect(resolveHumanConfig({ humanMode: true, humanCursor: false })!.cursor).toBe(false);
  });

  it('orders presets from subtle to slow', () => {
    expect(HUMAN_INTENSITY_PRESETS.subtle.maxDelay).toBeLessThan(HUMAN_INTENSITY_PRESETS.natural.maxDelay);
    expect(HUMAN_INTENSITY_PRESETS.natural.maxDelay).toBeLessThan(HUMAN_INTENSITY_PRESETS.slow.maxDelay);
  });
});

describe('Human timing helpers', () => {
  it('keeps random helpers inside their bounds', () => {
    for (let i = 0; i < 50; i++) {
      const r = randomBetween(10, 20);
      expect(r).toBeGreaterThanOrEqual(10);
      expect(r).toBeLessThanOrEqual(20);

      const c = clusteredBetween(10, 20);
      expect(c).toBeGreaterThanOrEqual(10);
      expect(c).toBeLessThanOrEqual(20);

      const g = gaussian01();
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it('returns the lower bound when the range is degenerate', () => {
    expect(randomBetween(7, 7)).toBe(7);
    expect(randomBetween(7, 3)).toBe(7);
  });

  it('adds a longer beat at word boundaries when typing', () => {
    const cfg = { ...fastConfig(), typingMin: 20, typingMax: 20 };
    expect(typingDelayFor(cfg, 'a')).toBe(20);
    expect(typingDelayFor(cfg, ' ')).toBeGreaterThanOrEqual(20);
  });

  it('resolves wait() immediately for zero or aborted signals', async () => {
    await expect(wait(0)).resolves.toBeUndefined();

    const controller = new AbortController();
    controller.abort();
    const start = Date.now();
    await wait(5000, controller.signal);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('wakes wait() early when the signal aborts', async () => {
    const controller = new AbortController();
    const start = Date.now();
    setTimeout(() => controller.abort(), 20);
    await wait(5000, controller.signal);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('cursor path generation', () => {
  it('starts at the origin, ends exactly on target and arcs off the straight line', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 400, y: 200 };
    const path = buildCursorPath(from, to, { overshootChance: 0 });

    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);

    const offLine = path.slice(1, -1).some(p => Math.abs(p.y - p.x / 2) > 1);
    expect(offLine).toBe(true);
  });

  it('collapses to a straight hop for reduced motion', () => {
    const path = buildCursorPath({ x: 0, y: 0 }, { x: 300, y: 100 }, { reduceMotion: true });
    expect(path).toEqual([{ x: 0, y: 0 }, { x: 300, y: 100 }]);
  });

  it('still ends on target when an overshoot is injected', () => {
    const to = { x: 250, y: 250 };
    for (let i = 0; i < 20; i++) {
      const path = buildCursorPath({ x: 0, y: 0 }, to, { overshootChance: 1 });
      expect(path[path.length - 1]).toEqual(to);
      expect(path.length).toBeGreaterThan(4);
    }
  });
});

describe('synthetic cursor overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    teardownHumanCursor();
  });

  afterEach(() => {
    teardownHumanCursor();
  });

  it('creates a pointer-events:none overlay and moves it to the target', async () => {
    const cfg = fastConfig();
    await moveCursorTo({ x: 120, y: 80 }, cfg);

    const el = document.getElementById('autoflow-human-cursor');
    expect(el).not.toBeNull();
    expect(el!.classList.contains('autoflow-cursor--visible')).toBe(true);
    expect(el!.getAttribute('aria-hidden')).toBe('true');

    const pos = getCursorPosition();
    expect(pos.x).toBe(120);
    expect(pos.y).toBe(80);
  });

  it('does not create an overlay when the cursor is disabled', async () => {
    await moveCursorTo({ x: 10, y: 10 }, { ...fastConfig(), cursor: false });
    expect(document.getElementById('autoflow-human-cursor')).toBeNull();
  });

  it('shows and clears the press ripple class', async () => {
    const cfg = fastConfig();
    await moveCursorTo({ x: 30, y: 30 }, cfg);
    markCursorClick(cfg);

    const el = document.getElementById('autoflow-human-cursor')!;
    expect(el.classList.contains('autoflow-cursor--click')).toBe(true);
  });

  it('fades out on request and is removed by teardown', async () => {
    const cfg = fastConfig();
    await moveCursorTo({ x: 40, y: 40 }, cfg);

    hideHumanCursor();
    expect(document.getElementById('autoflow-human-cursor')!.classList.contains('autoflow-cursor--visible')).toBe(false);

    teardownHumanCursor();
    expect(document.getElementById('autoflow-human-cursor')).toBeNull();
  });

  it('approachElement returns the point the cursor ends on', async () => {
    const btn = document.createElement('button');
    btn.id = 'go';
    document.body.appendChild(btn);

    const point = await approachElement(btn, fastConfig(), undefined, { pause: 0 });
    expect(getCursorPosition()).toEqual(point);
  });

  it('never treats reduced motion as an error', () => {
    expect(typeof prefersReducedMotion()).toBe('boolean');
  });
});
