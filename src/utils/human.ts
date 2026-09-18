import { HumanIntensity, WorkflowSettings } from '../types/workflow';

export type { HumanIntensity };

/**
 * Resolved, ready-to-use Human Mode configuration.
 * Only created when Human Mode is enabled, so disabled workflows pay zero cost.
 */
export interface HumanConfig {
  intensity: HumanIntensity;
  /** Whether to render + move the synthetic cursor overlay. */
  cursor: boolean;
  /** Think-time pause between workflow nodes (ms). */
  minDelay: number;
  maxDelay: number;
  /** Cursor travel speed in px/sec (lower = lazier movement). */
  cursorSpeed: number;
  /** Per-character typing delay range (ms). */
  typingMin: number;
  typingMax: number;
  /** Pre/post action micro-pause range (ms). */
  actionPauseMin: number;
  actionPauseMax: number;
}

export interface HumanPoint {
  x: number;
  y: number;
}

/** Intensity presets — subtle is fast, slow is deliberately leisurely. */
export const HUMAN_INTENSITY_PRESETS: Record<HumanIntensity, Omit<HumanConfig, 'intensity' | 'cursor'>> = {
  subtle: {
    minDelay: 30,
    maxDelay: 90,
    cursorSpeed: 2400,
    typingMin: 40,
    typingMax: 110,
    actionPauseMin: 20,
    actionPauseMax: 60,
  },
  natural: {
    minDelay: 80,
    maxDelay: 220,
    cursorSpeed: 1400,
    typingMin: 55,
    typingMax: 160,
    actionPauseMin: 40,
    actionPauseMax: 140,
  },
  slow: {
    minDelay: 200,
    maxDelay: 450,
    cursorSpeed: 850,
    typingMin: 90,
    typingMax: 260,
    actionPauseMin: 80,
    actionPauseMax: 240,
  },
};

export const HUMAN_INTENSITY_LABELS: Record<HumanIntensity, string> = {
  subtle: 'Subtle',
  natural: 'Natural',
  slow: 'Slow',
};

export const HUMAN_INTENSITY_HINTS: Record<HumanIntensity, string> = {
  subtle: 'Quick pauses (~0.1s)',
  natural: 'Balanced pauses (~0.3s)',
  slow: 'Deliberate pauses (~1s)',
};

function isValidIntensity(value: unknown): value is HumanIntensity {
  return value === 'subtle' || value === 'natural' || value === 'slow';
}

/**
 * Turns workflow settings into a resolved HumanConfig.
 * Returns undefined when Human Mode is off (the default), keeping fast execution intact.
 */
export function resolveHumanConfig(settings?: Partial<WorkflowSettings> | null): HumanConfig | undefined {
  if (!settings?.humanMode) return undefined;

  const intensity: HumanIntensity = isValidIntensity(settings.humanIntensity) ? settings.humanIntensity : 'natural';
  const preset = HUMAN_INTENSITY_PRESETS[intensity];

  const overrideMin = Number(settings.humanMinDelay);
  const overrideMax = Number(settings.humanMaxDelay);

  const minDelay = Number.isFinite(overrideMin) && overrideMin >= 0 ? overrideMin : preset.minDelay;
  const maxDelayRaw = Number.isFinite(overrideMax) && overrideMax >= 0 ? overrideMax : preset.maxDelay;

  return {
    intensity,
    cursor: settings.humanCursor !== false,
    minDelay,
    maxDelay: Math.max(minDelay, maxDelayRaw),
    cursorSpeed: preset.cursorSpeed,
    typingMin: preset.typingMin,
    typingMax: preset.typingMax,
    actionPauseMin: preset.actionPauseMin,
    actionPauseMax: preset.actionPauseMax,
  };
}
/** Uniform random float in [min, max]. */
export function randomBetween(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

/** Random integer in [min, max] inclusive. */
export function randomIntBetween(min: number, max: number): number {
  return Math.round(randomBetween(min, max));
}

/**
 * Bell-ish random in [0, 1] (mean 0.5) built from three uniforms.
 * Human timing clusters around a typical value instead of spreading uniformly.
 */
export function gaussian01(): number {
  return (Math.random() + Math.random() + Math.random()) / 3;
}

/** Clustered duration inside a range — feels less metronomic than randomBetween. */
export function clusteredBetween(min: number, max: number): number {
  return Math.round(min + gaussian01() * (max - min));
}

/** Abort-aware sleep. Resolves immediately (never rejects) once the signal aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface CursorPathOptions {
  /** Skip arcs/jitter (used for reduced-motion users). */
  reduceMotion?: boolean;
  /** Per-step positional noise in px. */
  jitter?: number;
  /** Chance of a small overshoot-then-correct at the end of the path. */
  overshootChance?: number;
}

/**
 * Builds a human-ish path between two viewport points:
 * a quadratic Bezier arc (jittered control point) + per-step noise + optional overshoot.
 * The first point is always `from` and the last point is always exactly `to`.
 */
export function buildCursorPath(from: HumanPoint, to: HumanPoint, options: CursorPathOptions = {}): HumanPoint[] {
  if (options.reduceMotion) return [{ ...from }, { ...to }];

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  // Very short hops don't need a full arc.
  if (distance < 4) return [{ ...from }, { ...to }];

  const jitter = options.jitter ?? 1.6;
  const steps = Math.min(48, Math.max(6, Math.round(distance / 34)));

  // Control point sits off the straight line so the cursor travels a slight arc.
  const mid = { x: from.x + dx / 2, y: from.y + dy / 2 };
  const normal = { x: -dy / (distance || 1), y: dx / (distance || 1) };
  const arcAmount = Math.min(70, distance * 0.16) * (Math.random() < 0.5 ? -1 : 1);
  const control = {
    x: mid.x + normal.x * arcAmount + randomBetween(-12, 12),
    y: mid.y + normal.y * arcAmount + randomBetween(-12, 12),
  };

  const points: HumanPoint[] = [{ ...from }];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    const x = inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x;
    const y = inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y;
    points.push({
      x: x + randomBetween(-jitter, jitter),
      y: y + randomBetween(-jitter, jitter),
    });
  }

  // Occasional overshoot then correction — a very human aiming artifact.
  const overshootChance = options.overshootChance ?? 0.35;
  if (distance > 60 && Math.random() < overshootChance) {
    const overshoot = randomBetween(3, 9);
    const ux = dx / distance;
    const uy = dy / distance;
    points.push({ x: to.x + ux * overshoot, y: to.y + uy * overshoot });
    points.push({
      x: to.x + randomBetween(-1.5, 1.5),
      y: to.y + randomBetween(-1.5, 1.5),
    });
  }

  points.push({ ...to });
  return points;
}

/** Time to traverse a path at the configured cursor speed, clamped to a sane window. */
export function cursorTravelDuration(distance: number, config: HumanConfig): number {
  const raw = (distance / Math.max(1, config.cursorSpeed)) * 1000;
  return Math.min(700, Math.max(120, raw));
}

/** Think-time pause between nodes (axis: intensity). */
export function nodeThinkTime(config: HumanConfig): number {
  return clusteredBetween(config.minDelay, config.maxDelay);
}

/** Pre/post action micro-pause. */
export function actionPause(config: HumanConfig, factor = 1): number {
  return Math.max(0, Math.round(clusteredBetween(config.actionPauseMin, config.actionPauseMax) * factor));
}

/** Per-character typing delay for humanized typing. */
export function typingDelayFor(config: HumanConfig, character?: string): number {
  const base = clusteredBetween(config.typingMin, config.typingMax);
  // Pause a touch longer at word boundaries, like real hands.
  if (character && /\s/.test(character)) return Math.round(base * randomBetween(1.5, 2.2));
  return base;
}
