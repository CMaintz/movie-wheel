import { describe, expect, it } from 'vitest';
import { TAU } from './wheelMath';
import { boxGeometry, coverCrop } from './wheelArt';

const SEGMENT_ANGLE = TAU / 12;

describe('boxGeometry', () => {
  it.each(['vhs', 'dvd'] as const)('keeps a %s box inside its wedge and the wheel face', style => {
    const { distance, width, height } = boxGeometry(style, SEGMENT_ANGLE);
    const inner = distance - height / 2;
    const outer = distance + height / 2;
    expect(2 * inner * Math.sin(SEGMENT_ANGLE / 2)).toBeGreaterThanOrEqual(width - 1e-9);
    expect(Math.hypot(outer, width / 2)).toBeLessThan(1);
  });
});

describe('coverCrop', () => {
  it('crops the sides of an image wider than the box', () => {
    const crop = coverCrop(200, 300, 56, 100);
    expect(crop.sx).toBeCloseTo(16);
    expect(crop.sw).toBeCloseTo(168);
    expect(crop).toMatchObject({ sy: 0, sh: 300 });
  });

  it('crops top and bottom of an image taller than the box', () => {
    const crop = coverCrop(200, 300, 100, 100);
    expect(crop).toEqual({ sx: 0, sy: 50, sw: 200, sh: 200 });
  });
});
