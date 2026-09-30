import { describe, expect, it } from 'vitest';
import { easeOutCubic, easeOutQuart } from './easing';

describe.each([
  ['easeOutCubic', easeOutCubic],
  ['easeOutQuart', easeOutQuart],
])('%s', (_name, ease) => {
  it('starts at 0 and ends at 1', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('is monotonically increasing', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('decelerates: covers more than half the distance in the first half', () => {
    expect(ease(0.5)).toBeGreaterThan(0.5);
  });
});

it('easeOutQuart decelerates harder than easeOutCubic', () => {
  expect(easeOutQuart(0.3)).toBeGreaterThan(easeOutCubic(0.3));
});
