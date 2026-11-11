import { describe, expect, it } from 'vitest';
import { skipSpin, spinEase } from './easing';
import { TAU } from './wheelMath';

const mod = (v: number, n: number) => ((v % n) + n) % n;

// The spin's final frame is start + ease(1) * delta, so the wheel only lands on the pick if the
// curve ends exactly at 1 and never overshoots or runs backwards on the way.
describe('spinEase', () => {
  it('runs from 0 to exactly 1 without overshooting or reversing', () => {
    expect(spinEase(0)).toBe(0);
    expect(spinEase(1)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.001) {
      const v = spinEase(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
});

describe('skipSpin', () => {
  const total = 7 * TAU + 1.3;
  const duration = 10_000;
  const remaining = 3000;
  const timeLeft = (plan: { progress: number; rate: number }) => ((1 - plan.progress) * duration) / plan.rate;

  it('resumes where the wheel sits at the same angle, so nothing snaps', () => {
    for (const p of [0.01, 0.1, 0.3, 0.5, 0.65]) {
      const plan = skipSpin(p, total, duration, remaining);
      expect(plan.progress).toBeGreaterThanOrEqual(p);
      const gap = Math.abs(mod(spinEase(p) * total, TAU) - mod(spinEase(plan.progress) * total, TAU));
      expect(Math.min(gap, TAU - gap)).toBeLessThan(1e-3);
    }
  });

  it('leaves about the requested time, never more', () => {
    for (const p of [0.01, 0.1, 0.3, 0.5, 0.65]) {
      expect(timeLeft(skipSpin(p, total, duration, remaining))).toBeCloseTo(remaining, 0);
    }
  });

  it('does nothing once less than that is left', () => {
    expect(skipSpin(0.8, total, duration, remaining)).toEqual({ progress: 0.8, rate: 1 });
  });
});
