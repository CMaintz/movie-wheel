import { TAU } from '../utils/wheelMath';
import { bulbAngles, coverCrop } from '../utils/wheelArt';
import type { CaseStyle } from '../utils/wheelArt';

export type Ctx = CanvasRenderingContext2D;

/** Every measurement of the wheel, in CSS pixels, derived from the canvas size. */
export interface WheelGeometry {
  size: number;
  cx: number;
  cy: number;
  outerR: number;
  rimW: number;
  faceR: number;
  hubR: number;
  bulbR: number;
  pegR: number;
  segmentCount: number;
}

export const wheelGeometry = (size: number, segmentCount: number): WheelGeometry => {
  const outerR = size * 0.47;
  const rimW = outerR * 0.11;
  const faceR = outerR - rimW;
  return {
    size,
    cx: size / 2,
    cy: size / 2 + size * 0.02, // room for the flapper above the rim
    outerR,
    rimW,
    faceR,
    hubR: faceR * 0.2,
    bulbR: rimW * 0.26,
    pegR: size * 0.011,
    segmentCount,
  };
};

/** Bulb centres on the rim. They belong to the frame, so they never turn. */
export const bulbPositions = (g: WheelGeometry): [number, number][] =>
  bulbAngles(g.segmentCount).map(a => [
    g.cx + Math.cos(a - Math.PI / 2) * (g.faceR + g.rimW / 2),
    g.cy + Math.sin(a - Math.PI / 2) * (g.faceR + g.rimW / 2),
  ]);

/** A box's front face is painted centred on the origin with its top towards -y. */
export interface BoxPaint {
  ctx: Ctx;
  style: CaseStyle;
  img: HTMLImageElement | null | undefined;
  w: number;
  h: number;
}

/**
 * One visual style for the wheel. The wheel turns by blitting baked layers, so anything a skin
 * bakes into a rotating layer turns with it: directional light (highlights, shading, shadows)
 * belongs in the screen-space parts (`paintRim`, `paintFaceLight`, the sprites) so it stays put.
 */
export interface Skin {
  /** Wedges and dividers around the origin, segment i starting at angle i*segmentAngle - PI/2. */
  paintFace(ctx: Ctx, g: WheelGeometry): void;
  paintBox(box: BoxPaint): void;
  /** Turns a box silhouette layer into its drop shadow: colour, blur and screen-space offset. */
  boxShadow(g: WheelGeometry): { color: string; blur: number; dx: number; dy: number };
  /** Drop shadow behind the wheel, the rim and the bulb sockets. Static. */
  paintRim(ctx: Ctx, g: WheelGeometry): void;
  /** Fixed light over the turning face, drawn on top of it each frame. Static. */
  paintFaceLight(ctx: Ctx, g: WheelGeometry): void;
  paintHub(ctx: Ctx, g: WheelGeometry, disabled: boolean): void;
  /** A bulb centred on the origin. */
  paintBulb(ctx: Ctx, r: number, lit: boolean): void;
  /** A peg centred on the origin. */
  paintPeg(ctx: Ctx, r: number): void;
  /** The flapper, pivot at the origin, tip pointing down (+y) `len` away. */
  paintFlapper(ctx: Ctx, g: WheelGeometry, len: number): void;
  /** Outline around the winning wedge, drawn in the wedge's turned frame. */
  paintWinner(ctx: Ctx, g: WheelGeometry, start: number, end: number): void;
}

export const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
};

export const wedgePath = (ctx: Ctx, r: number, start: number, end: number) => {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, start, end);
  ctx.closePath();
};

export const hasPixels = (img: HTMLImageElement | null | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

export const drawPoster = (ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

/**
 * An offscreen canvas `w` x `h` CSS pixels at the given pixel ratio, with its context scaled so
 * painters work in CSS pixels. `document.createElement` rather than OffscreenCanvas, which
 * jsdom lacks.
 */
export const makeLayer = (w: number, h: number, dpr: number, paint: (ctx: Ctx) => void): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    paint(ctx);
  }
  return canvas;
};

/** Shared box layout so both skins dress a title the same way and only the finish differs. */
export const boxParts = (style: CaseStyle, w: number, h: number) => {
  const x = -w / 2;
  const y = -h / 2;
  if (style === 'vhs') {
    return { x, y, cover: { x, y, w, h: h * 0.86 }, strip: { x, y: y + h * 0.86, w, h: h * 0.14 } };
  }
  const spine = w * 0.07;
  return {
    x,
    y,
    cover: { x: x + spine, y: y + h * 0.03, w: w - spine - w * 0.04, h: h * 0.94 },
    strip: null,
  };
};
