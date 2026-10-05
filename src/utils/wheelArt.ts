import { TAU } from './wheelMath';

const mod = (value: number, n: number): number => ((value % n) + n) % n;

export type CaseStyle = 'vhs' | 'dvd';
export type LightMode = 'idle' | 'loading' | 'spinning' | 'stopped';

// Saturated game-show wedges, deep enough that the box art stays the focal point.
export const WEDGE_COLORS = ['#c1121f', '#e89a00', '#1d6fb8', '#7b2cbf', '#23894a', '#e05a0b'];

export const wedgeColor = (index: number): string => WEDGE_COLORS[index % WEDGE_COLORS.length];

/** Width/height of the front cover: a VHS sleeve is tall and narrow, a DVD keepcase wider. */
export const CASE_ASPECT: Record<CaseStyle, number> = { vhs: 0.56, dvd: 0.7 };

/**
 * Where a segment's box sits, in multiples of the wheel-face radius: its centre distance from
 * the hub and its height. Sized so the box's inner corners still fit inside a 12-slot wedge.
 */
export const boxGeometry = (style: CaseStyle, segmentAngle: number) => {
  const height = style === 'vhs' ? 0.44 : 0.4;
  const width = height * CASE_ASPECT[style];
  // The inner edge must be far enough out that the wedge's chord there is at least the box width.
  const minInnerEdge = width / (2 * Math.sin(segmentAngle / 2));
  const distance = Math.max(minInnerEdge + height / 2, 0.6);
  return { distance, width, height };
};

/** Source rect that crops an image to fill a `boxW` x `boxH` frame without distorting it. */
export const coverCrop = (imgW: number, imgH: number, boxW: number, boxH: number) => {
  const boxAspect = boxW / boxH;
  if (imgW / imgH > boxAspect) {
    const sw = imgH * boxAspect;
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH };
  }
  const sh = imgW / boxAspect;
  return { sx: 0, sy: (imgH - sh) / 2, sw: imgW, sh };
};

/**
 * Flapper deflection in radians for a given wheel rotation. A peg sits on every segment boundary;
 * as one approaches the top it pushes the flapper's tip along (negative = tip swings right, the
 * direction a clockwise wheel drags it), then the flapper snaps back once the peg slips past.
 */
export const flapperAngle = (rotation: number, segmentAngle: number, maxDeflection = 0.45): number => {
  const frac = mod(rotation, segmentAngle) / segmentAngle;
  const PUSH_START = 0.78;
  const SNAP_BACK = 0.12;
  if (frac >= PUSH_START) return -maxDeflection * ((frac - PUSH_START) / (1 - PUSH_START));
  if (frac < SNAP_BACK) return -maxDeflection * (1 - frac / SNAP_BACK) * 0.35;
  return 0;
};

/** How many pegs have passed the pointer since rotation 0; a change means one tick. */
export const pegsPassed = (rotation: number, segmentAngle: number): number =>
  Math.floor(rotation / segmentAngle);

/** Marquee bulb pattern: a slow alternating blink at rest, a fast chase while busy, all-on flashing at the end. */
export const bulbLit = (index: number, timeMs: number, mode: LightMode): boolean => {
  switch (mode) {
    case 'idle':
      return (index + Math.floor(timeMs / 700)) % 2 === 0;
    case 'loading':
    case 'spinning':
      return (index + Math.floor(timeMs / 90)) % 3 === 0;
    case 'stopped':
      return Math.floor(timeMs / 250) % 2 === 0 || index % 2 === 0;
  }
};

/** Bulb angles around the rim, two per segment, offset so none sits under the flapper. */
export const bulbAngles = (segmentCount: number): number[] =>
  Array.from({ length: segmentCount * 2 }, (_, i) => (i + 0.5) * (TAU / (segmentCount * 2)));
