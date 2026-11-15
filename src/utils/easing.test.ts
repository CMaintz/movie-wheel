import { describe, expect, it } from 'vitest';
import { spinCurve } from './easing';
import { TAU } from './wheelMath';

const mod = (v: number, n: number) => ((v % n) + n) % n;

describe('spinCurve', () => {
  // The spin's final frame is start + ease(1) * delta, so the wheel only lands on the pick if the
  // curve ends exactly at 1 and never overshoots or runs backwards on the way.
  it('runs from 0 to exactly 1 without overshooting or reversing', () => {
    for (const startSpeed of [0, 0.3, 5]) {
      const { ease } = spinCurve(startSpeed);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      let prev = 0;
      for (let t = 0; t <= 1; t += 0.001) {
        const v = ease(t);
        expect(v).toBeGreaterThanOrEqual(prev);
        expect(v).toBeLessThanOrEqual(1);
        prev = v;
      }
    }
  });

  it('settles onto the pick instead of braking to a halt', () => {
    const { ease } = spinCurve();
    expect(1 - ease(0.98)).toBeLessThan(2e-5);
  });

  it('picks up at the speed the wheel was already turning', () => {
    const dt = 1e-4;
    expect(spinCurve().ease(dt) / dt).toBeLessThan(0.01);
    expect(spinCurve(0.3).ease(dt) / dt).toBeCloseTo(0.3, 2);
  });
});

describe('spinCurve skip', () => {
  const total = 7 * TAU + 1.3;
  const duration = 10_000;
  const remaining = 3000;
  const timeLeft = (plan: { progress: number; rate: number }) => ((1 - plan.progress) * duration) / plan.rate;

  it('resumes where the wheel sits at the same angle, so nothing snaps', () => {
    for (const startSpeed of [0, 0.3]) {
      const { ease, skip } = spinCurve(startSpeed);
      for (const p of [0.01, 0.1, 0.3, 0.5, 0.65]) {
        const plan = skip(p, total, duration, remaining);
        expect(plan.progress).toBeGreaterThanOrEqual(p);
        const gap = Math.abs(mod(ease(p) * total, TAU) - mod(ease(plan.progress) * total, TAU));
        expect(Math.min(gap, TAU - gap)).toBeLessThan(1e-3);
      }
    }
  });

  it('leaves about the requested time, never more', () => {
    const { skip } = spinCurve();
    for (const p of [0.01, 0.1, 0.3, 0.5, 0.65]) {
      expect(timeLeft(skip(p, total, duration, remaining))).toBeCloseTo(remaining, 0);
    }
  });

  it('does nothing once less than that is left', () => {
    expect(spinCurve().skip(0.8, total, duration, remaining)).toEqual({ progress: 0.8, rate: 1 });
  });
});
