import { describe, expect, it } from 'vitest';
import { TAU, computeSpinDelta, segmentAtPointer } from './wheelMath';

const SEGMENTS = 12;
const SEGMENT_ANGLE = TAU / SEGMENTS;

describe('segmentAtPointer', () => {
  it('puts segment 0 under the pointer just after its leading edge', () => {
    expect(segmentAtPointer(-0.01, SEGMENTS)).toBe(0);
  });

  it('moves to the previous segment when the wheel turns clockwise', () => {
    expect(segmentAtPointer(0.01, SEGMENTS)).toBe(SEGMENTS - 1);
    expect(segmentAtPointer(SEGMENT_ANGLE + 0.01, SEGMENTS)).toBe(SEGMENTS - 2);
  });

  it('is periodic in full turns', () => {
    expect(segmentAtPointer(-0.5 + 7 * TAU, SEGMENTS)).toBe(segmentAtPointer(-0.5, SEGMENTS));
    expect(segmentAtPointer(-0.5 - 3 * TAU, SEGMENTS)).toBe(segmentAtPointer(-0.5, SEGMENTS));
  });
});

describe('computeSpinDelta', () => {
  it('lands on the winner from a resting wheel', () => {
    for (let winner = 0; winner < SEGMENTS; winner++) {
      const delta = computeSpinDelta(0, winner, SEGMENTS, 5);
      expect(segmentAtPointer(delta, SEGMENTS)).toBe(winner);
    }
  });

  // Regression: the wheel keeps its angle between spins, so later spins start from arbitrary rotations.
  it('lands on the winner from any starting rotation, with jitter', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 32;
    };

    for (let i = 0; i < 1000; i++) {
      const start = (rand() - 0.5) * 200;
      const winner = Math.floor(rand() * SEGMENTS);
      const jitter = (rand() - 0.5) * SEGMENT_ANGLE * 0.5;
      const turns = 5 + Math.floor(rand() * 3);

      const delta = computeSpinDelta(start, winner, SEGMENTS, turns, jitter);

      expect(segmentAtPointer(start + delta, SEGMENTS)).toBe(winner);
      expect(delta).toBeGreaterThanOrEqual(turns * TAU);
      expect(delta).toBeLessThan((turns + 1) * TAU);
    }
  });
});
