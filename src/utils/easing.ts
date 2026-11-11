const TAU = 2 * Math.PI;
const SAMPLES = 2048;
// Shape of the slowdown: air drag dominates while the wheel is fast, friction once it's slow.
// Velocity under both is e^(-k·t) - e^(-k), so the start sheds speed quickly and the end
// creeps past the last few pegs at a steady deceleration.
const DRAG = 2.6;
// Share of the spin spent winding up from rest, so the wheel reads as heavy rather than flicked
const WIND_UP = 0.035;

const velocity = (t: number): number => {
  const ramp = t < WIND_UP ? (t / WIND_UP) ** 2 * (3 - 2 * (t / WIND_UP)) : 1;
  return ramp * (Math.exp(-DRAG * t) - Math.exp(-DRAG));
};

// Distance covered by progress i / SAMPLES, normalised so the last entry is exactly 1
const CURVE: number[] = (() => {
  const out = [0];
  let sum = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    sum += (velocity((i - 1) / SAMPLES) + velocity(i / SAMPLES)) / 2;
    out.push(sum);
  }
  return out.map(v => v / sum);
})();

/** Share of the spin's distance covered at progress `t` (0..1, clamped). Ends at exactly 1. */
export const spinEase = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x = t * SAMPLES;
  const i = Math.floor(x);
  return CURVE[i] + (CURVE[i + 1] - CURVE[i]) * (x - i);
};

const progressAt = (distance: number): number => {
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (CURVE[mid] <= distance) lo = mid;
    else hi = mid;
  }
  const span = CURVE[hi] - CURVE[lo];
  return (lo + (span > 0 ? (distance - CURVE[lo]) / span : 0)) / SAMPLES;
};

export interface SkipPlan {
  /** Progress to resume from: a frame where the wheel sits at the same angle, so nothing snaps. */
  progress: number;
  /** Playback rate for the rest of the spin, at least 1. */
  rate: number;
}

/**
 * Cuts a spin of `totalAngle` radians and `durationMs`, currently at `progress`, down to about
 * `remainingMs` of its ending. It jumps a whole number of turns ahead, so the landing is unchanged,
 * then plays the rest faster if a turn's worth of slack is still longer than `remainingMs`.
 */
export const skipSpin = (progress: number, totalAngle: number, durationMs: number, remainingMs: number): SkipPlan => {
  const tailStart = 1 - remainingMs / durationMs;
  if (progress >= tailStart) return { progress, rate: 1 };
  const now = spinEase(progress) * totalAngle;
  const turnsToCut = Math.floor((spinEase(tailStart) * totalAngle - now) / TAU);
  const resumeAt = turnsToCut < 1 ? progress : Math.max(progress, progressAt((now + turnsToCut * TAU) / totalAngle));
  return { progress: resumeAt, rate: Math.max(1, ((1 - resumeAt) * durationMs) / remainingMs) };
};
