import { TAU } from '../utils/wheelMath';
import type { Ctx, Skin } from './paint';
import { boxParts, bulbPositions, circle, drawPoster, hasPixels, roundRect, wedgePath } from './paint';

// Cartoon look: one ink colour for every outline, two flat tones per surface, and light from the
// top left shown as hard-edged crescents and white glints rather than gradients.
const INK = '#1c1226';
const GOLD = '#ffcb3d';
const GOLD_SHADE = '#e0950f';
const RED = '#ef3e4a';
const RED_SHADE = '#b8202c';
const CREAM = '#fff3d6';
const WEDGES: [base: string, shade: string][] = [
  ['#ef3e4a', '#c52633'],
  ['#ffbf1f', '#e39b00'],
  ['#2f80ed', '#1d5fbd'],
  ['#8b46e8', '#6a2cc0'],
  ['#22a35a', '#147a40'],
  ['#ff6b1a', '#d84e05'],
];
const DISPLAY_FONT = '"Bungee", system-ui, sans-serif';

/**
 * Fills the disc of radius `r` at (x, y) in `shade`, then the part a light from the top left
 * reaches in `base`, leaving a hard crescent of shade at the bottom right.
 */
const crescentDisc = (ctx: Ctx, x: number, y: number, r: number, base: string, shade: string, offset = 0.12) => {
  circle(ctx, x, y, r);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.save();
  circle(ctx, x, y, r);
  ctx.clip();
  circle(ctx, x - r * offset, y - r * offset, r);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();
};

const glint = (ctx: Ctx, x: number, y: number, r: number, from: number, to: number, width: number, alpha = 0.9) => {
  ctx.beginPath();
  ctx.arc(x, y, r, from, to);
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
};

const ink = (ctx: Ctx, width: number) => {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
};

const blankLabel = (ctx: Ctx, x: number, y: number, w: number, h: number, line: number) => {
  ctx.fillStyle = CREAM;
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ink(ctx, line);
  ctx.fillStyle = RED;
  ctx.font = `${h * 0.8}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', x + w / 2, y + h * 0.55);
};

export const celSkin: Skin = {
  paintFace(ctx, g) {
    const { segmentCount } = g;
    const seg = TAU / segmentCount;
    for (let i = 0; i < segmentCount; i++) {
      const start = i * seg - Math.PI / 2;
      const [base, shade] = WEDGES[i % WEDGES.length];
      wedgePath(ctx, g.faceR, start, start + seg);
      ctx.fillStyle = base;
      ctx.fill();
      // A flat darker band towards the hub gives the face some depth without a gradient
      wedgePath(ctx, g.faceR * 0.42, start, start + seg);
      ctx.fillStyle = shade;
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = g.size * 0.007;
    for (let i = 0; i < segmentCount; i++) {
      const a = i * seg - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * g.hubR, Math.sin(a) * g.hubR);
      ctx.lineTo(Math.cos(a) * g.faceR, Math.sin(a) * g.faceR);
      ctx.stroke();
    }
    circle(ctx, 0, 0, g.faceR);
    ink(ctx, g.size * 0.01);
  },

  paintBox({ ctx, style, img, w, h }) {
    const { x, y, cover, strip } = boxParts(style, w, h);
    const line = Math.max(1.5, w * 0.045);
    if (style === 'vhs') {
      ctx.fillStyle = '#2b2233';
      ctx.fillRect(x, y, w, h);
      if (hasPixels(img)) {
        drawPoster(ctx, img, cover.x, cover.y, cover.w, cover.h);
      } else {
        blankLabel(ctx, x + w * 0.14, y + h * 0.14, w * 0.72, h * 0.22, line * 0.7);
        for (const rx of [-w * 0.2, w * 0.2]) {
          circle(ctx, rx, y + h * 0.6, w * 0.15);
          ctx.fillStyle = CREAM;
          ctx.fill();
          ink(ctx, line * 0.7);
          circle(ctx, rx, y + h * 0.6, w * 0.05);
          ctx.fillStyle = INK;
          ctx.fill();
        }
      }
      if (strip) {
        ctx.fillStyle = INK;
        ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
        ctx.fillStyle = '#fff';
        ctx.font = `${strip.h * 0.6}px ${DISPLAY_FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('VHS', x + w * 0.09, strip.y + strip.h * 0.54);
        ctx.fillStyle = GOLD;
        ctx.fillRect(x + w * 0.64, strip.y + strip.h * 0.3, w * 0.26, strip.h * 0.4);
      }
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ink(ctx, line);
      return;
    }

    const r = w * 0.08;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = '#25324f';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(cover.x, cover.y, cover.w, cover.h);
    ctx.clip();
    if (hasPixels(img)) {
      drawPoster(ctx, img, cover.x, cover.y, cover.w, cover.h);
    } else {
      ctx.fillStyle = '#3d4d73';
      ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
      ctx.fillStyle = GOLD;
      ctx.font = `${h * 0.26}px ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cover.x + cover.w / 2, cover.y + cover.h * 0.56);
    }
    ctx.fillStyle = INK;
    ctx.fillRect(cover.x, cover.y, cover.w, cover.h * 0.12);
    ctx.fillStyle = '#fff';
    ctx.font = `${cover.h * 0.08}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DVD', cover.x + cover.w / 2, cover.y + cover.h * 0.065);
    ctx.restore();
    ctx.beginPath();
    ctx.rect(cover.x, cover.y, cover.w, cover.h);
    ink(ctx, line * 0.6);
    roundRect(ctx, x, y, w, h, r);
    ink(ctx, line);
  },

  boxShadow: g => ({ color: 'rgba(28,18,38,0.5)', blur: 0, dx: g.faceR * 0.025, dy: g.faceR * 0.035 }),

  paintRim(ctx, g) {
    const { cx, cy, outerR, rimW } = g;
    // Flat cast shadow, offset down and right
    circle(ctx, cx + g.size * 0.012, cy + g.size * 0.02, outerR + g.size * 0.006);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    crescentDisc(ctx, cx, cy, outerR, GOLD, GOLD_SHADE, 0.035);
    glint(ctx, cx, cy, outerR - rimW * 0.3, Math.PI * 1.06, Math.PI * 1.38, rimW * 0.14);
    glint(ctx, cx, cy, outerR - rimW * 0.3, Math.PI * 1.43, Math.PI * 1.47, rimW * 0.14);
    circle(ctx, cx, cy, outerR);
    ink(ctx, g.size * 0.009);
    // Sockets, so an unlit bulb still reads as a bulb
    for (const [bx, by] of bulbPositions(g)) {
      circle(ctx, bx, by, g.bulbR * 1.35);
      ctx.fillStyle = GOLD_SHADE;
      ctx.fill();
      ink(ctx, g.bulbR * 0.22);
    }
  },

  paintFaceLight(ctx, g) {
    const { cx, cy, faceR } = g;
    ctx.save();
    circle(ctx, cx, cy, faceR);
    ctx.clip();
    // Everything outside a disc nudged towards the light falls in shade
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, TAU);
    ctx.moveTo(cx - faceR * 0.07 + faceR, cy - faceR * 0.09);
    ctx.arc(cx - faceR * 0.07, cy - faceR * 0.09, faceR, 0, TAU);
    ctx.fillStyle = 'rgba(28,18,38,0.22)';
    ctx.fill('evenodd');
    ctx.restore();
    glint(ctx, cx, cy, faceR * 0.92, Math.PI * 1.1, Math.PI * 1.36, faceR * 0.022, 0.55);
    glint(ctx, cx, cy, faceR * 0.92, Math.PI * 1.41, Math.PI * 1.45, faceR * 0.022, 0.55);
  },

  paintHub(ctx, g, disabled) {
    const { cx, cy, hubR } = g;
    circle(ctx, cx + hubR * 0.08, cy + hubR * 0.12, hubR);
    ctx.fillStyle = 'rgba(28,18,38,0.5)';
    ctx.fill();
    crescentDisc(ctx, cx, cy, hubR, RED, RED_SHADE, 0.1);
    circle(ctx, cx, cy, hubR);
    ink(ctx, g.size * 0.008);
    glint(ctx, cx, cy, hubR * 0.86, Math.PI * 1.1, Math.PI * 1.35, hubR * 0.08);
    circle(ctx, cx, cy, hubR * 0.7);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.fillStyle = disabled ? 'rgba(255,203,61,0.45)' : GOLD;
    ctx.font = `${hubR * 0.4}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy + hubR * 0.04);
  },

  paintBulb(ctx, r, lit) {
    if (lit) {
      circle(ctx, 0, 0, r * 1.9);
      ctx.fillStyle = 'rgba(255,226,110,0.4)';
      ctx.fill();
    }
    circle(ctx, 0, 0, r);
    ctx.fillStyle = lit ? '#fff7c9' : '#7c4d10';
    ctx.fill();
    ink(ctx, r * 0.3);
    circle(ctx, -r * 0.33, -r * 0.33, r * 0.26);
    ctx.fillStyle = lit ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.fill();
  },

  paintPeg(ctx, r) {
    crescentDisc(ctx, 0, 0, r, '#fdf7ea', '#c9c0b0', 0.2);
    circle(ctx, 0, 0, r);
    ink(ctx, r * 0.35);
  },

  paintFlapper(ctx, g, len) {
    const w = g.size * 0.03;
    const tri = () => {
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, len);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(g.size * 0.007, g.size * 0.011);
    tri();
    ctx.fillStyle = 'rgba(28,18,38,0.4)';
    ctx.fill();
    ctx.restore();
    tri();
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, len);
    ctx.closePath();
    ctx.fillStyle = RED_SHADE;
    ctx.fill();
    tri();
    ink(ctx, g.size * 0.007);
    const pin = g.size * 0.017;
    crescentDisc(ctx, 0, 0, pin, GOLD, GOLD_SHADE, 0.2);
    circle(ctx, 0, 0, pin);
    ink(ctx, g.size * 0.005);
  },

  paintWinner(ctx, g, start, end) {
    wedgePath(ctx, g.faceR - g.size * 0.01, start, end);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = g.size * 0.02;
    ctx.stroke();
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = g.size * 0.01;
    ctx.stroke();
  },
};
