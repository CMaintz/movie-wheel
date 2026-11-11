import { expect, it } from 'vitest';
import { easeOutQuart } from './easing';

// The spin's final frame is start + ease(1) * delta, so the wheel only lands on the pick if the
// curve ends exactly at 1 and never overshoots on the way.
it('easeOutQuart runs from 0 to exactly 1 without overshooting', () => {
  expect(easeOutQuart(0)).toBe(0);
  expect(easeOutQuart(1)).toBe(1);
  let prev = 0;
  for (let t = 0; t <= 1; t += 0.01) {
    const v = easeOutQuart(t);
    expect(v).toBeGreaterThanOrEqual(prev);
    expect(v).toBeLessThanOrEqual(1);
    prev = v;
  }
});
