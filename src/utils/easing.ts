const TAU = 2 * Math.PI;
const SAMPLES = 2048;
// How the wheel sheds speed: velocity falls as (1 - t)^SETTLE, so it loses most of it early and
// then eases onto the pick with the deceleration fading to nothing, rather than braking to a stop.
const SETTLE = 2.2;
// Share of the spin spent winding up to top speed, so the wheel reads as heavy rather than flicked
const WIND_UP = 0.1;

const smoothstep = (x: number) => (x >= 1 ? 1 : x * x * (3 - 2 * x));
const ramp = (t: number) => smoothstep(t / WIND_UP);

/** Running integral of `velocity` over 0..1, normalised so the last entry is exactly 1. */
const integrate = (velocity: (t: number) => number): number[] => {
  const out = [0];
  let sum = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    sum += (velocity((i - 1) / SAMPLES) + velocity(i / SAMPLES)) / 2;
    out.push(sum);
  }
  return out.map(v => v / sum);
};

// The spin itself: wind up from rest, then settle
const SPIN = integrate(t => ramp(t) * (1 - t) ** SETTLE);
// Whatever speed the wheel already had, fading out over the wind-up as the spin takes over
const COAST = integrate(t => 1 - ramp(t));
// COAST's speed at t = 0: 1 over its area, which is half the wind-up
const COAST_START_SPEED = 2 / WIND_UP;

const lookup = (table: number[], t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x = t * SAMPLES;
  const i = Math.floor(x);
  return table[i] + (table[i + 1] - table[i]) * (x - i);
};

/** Inverse of `lookup` on a non-decreasing table. */
const progressAt = (table: number[], distance: number): number => {
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= distance) lo = mid;
    else hi = mid;
  }
  const span = table[hi] - table[lo];
  return (lo + (span > 0 ? (distance - table[lo]) / span : 0)) / SAMPLES;
};

export interface SkipPlan {
  /** Progress to resume from: a frame where the wheel sits at the same angle, so nothing snaps. */
  progress: number;
  /** Playback rate for the rest of the spin, at least 1. */
  rate: number;
}

export interface SpinCurve {
  /** Share of the spin's distance covered at progress `t` (0..1, clamped). Ends at exactly 1. */
  ease: (t: number) => number;
  /**
   * Cuts a spin of `totalAngle` radians and `durationMs`, currently at `progress`, down to about
   * `remainingMs` of its ending. It jumps a whole number of turns ahead, so the landing is
   * unchanged, then plays the rest faster if a turn's worth of slack is still longer than
   * `remainingMs`.
   */
  skip: (progress: number, totalAngle: number, durationMs: number, remainingMs: number) => SkipPlan;
}

/**
 * The spin's distance over time. `startSpeed` is the speed the wheel is already turning at, in
 * shares of the spin's distance per share of its duration (rad/ms * durationMs / totalAngle), so
 * a wheel that was idling along carries on instead of stalling before it winds up.
 */
export const spinCurve = (startSpeed = 0): SpinCurve => {
  const mix = Math.min(1, Math.max(0, startSpeed / COAST_START_SPEED));
  const table = mix === 0 ? SPIN : SPIN.map((v, i) => v * (1 - mix) + COAST[i] * mix);
  const ease = (t: number) => lookup(table, t);

  const skip = (progress: number, totalAngle: number, durationMs: number, remainingMs: number): SkipPlan => {
    const tailStart = 1 - remainingMs / durationMs;
    if (progress >= tailStart) return { progress, rate: 1 };
    const now = ease(progress) * totalAngle;
    const turnsToCut = Math.floor((ease(tailStart) * totalAngle - now) / TAU);
    const resumeAt =
      turnsToCut < 1 ? progress : Math.max(progress, progressAt(table, (now + turnsToCut * TAU) / totalAngle));
    return { progress: resumeAt, rate: Math.max(1, ((1 - resumeAt) * durationMs) / remainingMs) };
  };

  return { ease, skip };
};
