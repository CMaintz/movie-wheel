import { describe, expect, it } from 'vitest';
import { TAU } from './wheelMath';
import {
  boxGeometry,
  bulbAngles,
  bulbLit,
  coverCrop,
  flapperAngle,
  pegsPassed,
  wedgeColor,
  WEDGE_COLORS,
} from './wheelArt';

const SEGMENT_ANGLE = TAU / 12;

describe('boxGeometry', () => {
  it.each(['vhs', 'dvd'] as const)('keeps a %s box inside its wedge and the wheel face', style => {
    const { distance, width, height } = boxGeometry(style, SEGMENT_ANGLE);
    const inner = distance - height / 2;
    const outer = distance + height / 2;
    expect(2 * inner * Math.sin(SEGMENT_ANGLE / 2)).toBeGreaterThanOrEqual(width - 1e-9);
    expect(Math.hypot(outer, width / 2)).toBeLessThan(1);
  });

  it('makes a VHS sleeve narrower than a DVD case', () => {
    const vhs = boxGeometry('vhs', SEGMENT_ANGLE);
    const dvd = boxGeometry('dvd', SEGMENT_ANGLE);
    expect(vhs.width / vhs.height).toBeLessThan(dvd.width / dvd.height);
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

describe('flapperAngle', () => {
  it('rests while no peg is near', () => {
    expect(flapperAngle(SEGMENT_ANGLE * 0.5, SEGMENT_ANGLE)).toBe(0);
  });

  it('is pushed furthest just before a peg slips past, then snaps back', () => {
    const before = flapperAngle(SEGMENT_ANGLE * 0.99, SEGMENT_ANGLE);
    const after = flapperAngle(SEGMENT_ANGLE * 1.01, SEGMENT_ANGLE);
    expect(before).toBeLessThan(-0.4);
    expect(Math.abs(after)).toBeLessThan(Math.abs(before));
  });

  it('handles negative rotations', () => {
    expect(flapperAngle(-SEGMENT_ANGLE * 0.5, SEGMENT_ANGLE)).toBe(0);
  });
});

describe('pegsPassed', () => {
  it('counts one peg per segment boundary', () => {
    expect(pegsPassed(0, SEGMENT_ANGLE)).toBe(0);
    expect(pegsPassed(SEGMENT_ANGLE * 2.5, SEGMENT_ANGLE)).toBe(2);
    expect(pegsPassed(TAU, SEGMENT_ANGLE)).toBe(12);
  });
});

describe('bulbLit', () => {
  it('alternates neighbours at rest', () => {
    expect(bulbLit(0, 0, 'idle')).not.toBe(bulbLit(1, 0, 'idle'));
    expect(bulbLit(0, 0, 'idle')).not.toBe(bulbLit(0, 700, 'idle'));
  });

  it('chases every third bulb while spinning or loading', () => {
    const lit = Array.from({ length: 6 }, (_, i) => bulbLit(i, 0, 'spinning'));
    expect(lit).toEqual([true, false, false, true, false, false]);
    expect(bulbLit(1, 90, 'loading')).toBe(false);
    expect(bulbLit(2, 90, 'loading')).toBe(true);
  });

  it('flashes every bulb on at the end', () => {
    expect(Array.from({ length: 4 }, (_, i) => bulbLit(i, 0, 'stopped')).every(Boolean)).toBe(true);
    expect(bulbLit(1, 250, 'stopped')).toBe(false);
  });
});

describe('bulbAngles and wedgeColor', () => {
  it('places two bulbs per segment, none on a boundary', () => {
    const angles = bulbAngles(12);
    expect(angles).toHaveLength(24);
    expect(angles.every(a => Math.abs((a / SEGMENT_ANGLE) % 1) > 0.1)).toBe(true);
  });

  it('cycles the wedge palette', () => {
    expect(wedgeColor(WEDGE_COLORS.length)).toBe(wedgeColor(0));
  });
});
