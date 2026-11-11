import { TAU } from '../utils/wheelMath';
import type { Ctx, Skin } from './paint';
import { boxParts, bulbPositions, circle, drawPoster, hasPixels, roundRect, wedgePath } from './paint';

// Painted-prop look: matte enamel wedges with a little grain, aged brass, warm bulbs. Light comes
// from the top left and is baked only into the parts that don't turn. Kept matte on purpose: a
// glossy finish read as plastic in the 3D prototype.
const WEDGES = ['#9e2b35', '#c98f2a', '#2c5a86', '#5a3b7e', '#386f4b', '#b4572a'];
const BRASS_DARK = '#3a2a14';
const LABEL_FONT = 'system-ui, sans-serif';

/** Small deterministic PRNG so the grain is identical on every rebake instead of shimmering. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const brassFill = (ctx: Ctx, x: number, y: number) => {
  // Turned brass: anisotropic sheen around the centre. Older browsers lack conic gradients.
  if (typeof ctx.createConicGradient !== 'function') return '#a8844c';
  const g = ctx.createConicGradient(0, x, y);
  const stops = ['#8a6a3a', '#d4b67c', '#9c7842', '#6e5129', '#b8955a', '#dcc28c', '#8f6c38', '#8a6a3a'];
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
};

export const realSkin: Skin = {
  paintFace(ctx, g) {
    const { segmentCount, faceR, hubR } = g;
    const seg = TAU / segmentCount;
    for (let i = 0; i < segmentCount; i++) {
      const start = i * seg - Math.PI / 2;
      wedgePath(ctx, faceR, start, start + seg);
      ctx.fillStyle = WEDGES[i % WEDGES.length];
      ctx.fill();
    }
    // Brush grain in the enamel
    const rand = mulberry32(7);
    ctx.save();
    circle(ctx, 0, 0, faceR);
    ctx.clip();
    for (let i = 0; i < 900; i++) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * faceR;
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1 + rand() * 2.5, 1);
    }
    ctx.restore();
    // The face is dished: paint pools darker towards the hub
    const dish = ctx.createRadialGradient(0, 0, hubR * 0.8, 0, 0, faceR * 0.62);
    dish.addColorStop(0, 'rgba(0,0,0,0.38)');
    dish.addColorStop(1, 'rgba(0,0,0,0)');
    circle(ctx, 0, 0, faceR);
    ctx.fillStyle = dish;
    ctx.fill();
    // Brass divider strips
    for (let i = 0; i < segmentCount; i++) {
      const a = i * seg - Math.PI / 2;
      const [ca, sa] = [Math.cos(a), Math.sin(a)];
      ctx.beginPath();
      ctx.moveTo(ca * hubR, sa * hubR);
      ctx.lineTo(ca * faceR, sa * faceR);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = g.size * 0.008;
      ctx.stroke();
      ctx.strokeStyle = '#c4a165';
      ctx.lineWidth = g.size * 0.004;
      ctx.stroke();
    }
    circle(ctx, 0, 0, faceR);
    ctx.strokeStyle = BRASS_DARK;
    ctx.lineWidth = g.size * 0.006;
    ctx.stroke();
  },

  paintBox({ ctx, style, img, w, h }) {
    const { x, y, cover, strip } = boxParts(style, w, h);
    if (style === 'vhs') {
      ctx.fillStyle = '#121212';
      ctx.fillRect(x, y, w, h);
      if (hasPixels(img)) {
        drawPoster(ctx, img, cover.x, cover.y, cover.w, cover.h);
      } else {
        ctx.fillStyle = '#ebe2c9';
        ctx.fillRect(x + w * 0.12, y + h * 0.16, w * 0.76, h * 0.2);
        ctx.fillStyle = '#a3212b';
        ctx.font = `600 ${h * 0.15}px ${LABEL_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, y + h * 0.265);
        for (const rx of [-w * 0.2, w * 0.2]) {
          circle(ctx, rx, y + h * 0.6, w * 0.14);
          ctx.fillStyle = '#262626';
          ctx.fill();
          circle(ctx, rx, y + h * 0.6, w * 0.05);
          ctx.fillStyle = '#d9d2c0';
          ctx.fill();
        }
      }
      if (strip) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
        ctx.fillStyle = '#ededed';
        ctx.font = `800 ${strip.h * 0.6}px ${LABEL_FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('VHS', x + w * 0.08, strip.y + strip.h * 0.52);
        ctx.fillStyle = '#c9851c';
        ctx.fillRect(x + w * 0.62, strip.y + strip.h * 0.32, w * 0.28, strip.h * 0.36);
      }
      // Worn cardboard edge
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      return;
    }

    const r = w * 0.06;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = '#111317';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(cover.x, cover.y, cover.w, cover.h);
    ctx.clip();
    if (hasPixels(img)) {
      drawPoster(ctx, img, cover.x, cover.y, cover.w, cover.h);
    } else {
      ctx.fillStyle = '#1d2433';
      ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
      ctx.fillStyle = 'rgba(232,199,122,0.75)';
      ctx.font = `600 ${h * 0.24}px ${LABEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cover.x + cover.w / 2, cover.y + cover.h * 0.55);
    }
    ctx.fillStyle = 'rgba(10,10,14,0.9)';
    ctx.fillRect(cover.x, cover.y, cover.w, cover.h * 0.11);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = `800 ${cover.h * 0.075}px ${LABEL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DVD', cover.x + cover.w / 2, cover.y + cover.h * 0.058);
    // Clear sleeve over the cover: a faint milky film, not a highlight
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (cover.x - x) * (i / 3), y + r);
      ctx.lineTo(x + (cover.x - x) * (i / 3), y + h - r);
      ctx.stroke();
    }
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.stroke();
  },

  boxShadow: g => ({ color: 'rgba(0,0,0,0.55)', blur: g.faceR * 0.03, dx: g.faceR * 0.012, dy: g.faceR * 0.026 }),

  paintRim(ctx, g) {
    const { cx, cy, outerR, faceR, size } = g;
    const drop = ctx.createRadialGradient(cx, cy + size * 0.02, outerR * 0.92, cx, cy + size * 0.02, outerR * 1.1);
    drop.addColorStop(0, 'rgba(0,0,0,0.6)');
    drop.addColorStop(1, 'rgba(0,0,0,0)');
    circle(ctx, cx, cy + size * 0.02, outerR * 1.1);
    ctx.fillStyle = drop;
    ctx.fill();

    const ring = () => {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, TAU);
      ctx.arc(cx, cy, faceR, 0, TAU, true);
    };
    ring();
    ctx.fillStyle = brassFill(ctx, cx, cy);
    ctx.fill();
    // Rounded profile: darker at both edges of the ring
    const profile = ctx.createRadialGradient(cx, cy, faceR, cx, cy, outerR);
    profile.addColorStop(0, 'rgba(0,0,0,0.4)');
    profile.addColorStop(0.45, 'rgba(255,240,210,0.08)');
    profile.addColorStop(1, 'rgba(0,0,0,0.45)');
    ring();
    ctx.fillStyle = profile;
    ctx.fill();
    const light = ctx.createLinearGradient(cx - outerR, cy - outerR, cx + outerR, cy + outerR);
    light.addColorStop(0, 'rgba(255,244,220,0.2)');
    light.addColorStop(0.55, 'rgba(0,0,0,0)');
    light.addColorStop(1, 'rgba(0,0,0,0.3)');
    ring();
    ctx.fillStyle = light;
    ctx.fill();
    circle(ctx, cx, cy, outerR);
    ctx.strokeStyle = BRASS_DARK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (const [bx, by] of bulbPositions(g)) {
      circle(ctx, bx, by, g.bulbR * 1.4);
      ctx.fillStyle = '#2a1c0c';
      ctx.fill();
      circle(ctx, bx, by, g.bulbR * 1.4);
      ctx.strokeStyle = 'rgba(255,230,180,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },

  paintFaceLight(ctx, g) {
    const { cx, cy, faceR } = g;
    ctx.save();
    circle(ctx, cx, cy, faceR);
    ctx.clip();
    const light = ctx.createLinearGradient(cx - faceR, cy - faceR, cx + faceR, cy + faceR);
    light.addColorStop(0, 'rgba(255,245,225,0.12)');
    light.addColorStop(0.5, 'rgba(0,0,0,0)');
    light.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = light;
    ctx.fillRect(cx - faceR, cy - faceR, faceR * 2, faceR * 2);
    // The rim stands proud of the face and shades its edge
    const lip = ctx.createRadialGradient(cx, cy, faceR * 0.86, cx, cy, faceR);
    lip.addColorStop(0, 'rgba(0,0,0,0)');
    lip.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lip;
    ctx.fillRect(cx - faceR, cy - faceR, faceR * 2, faceR * 2);
    ctx.restore();
  },

  paintHub(ctx, g, disabled) {
    const { cx, cy, hubR } = g;
    const drop = ctx.createRadialGradient(cx, cy + hubR * 0.12, hubR * 0.85, cx, cy + hubR * 0.12, hubR * 1.25);
    drop.addColorStop(0, 'rgba(0,0,0,0.55)');
    drop.addColorStop(1, 'rgba(0,0,0,0)');
    circle(ctx, cx, cy + hubR * 0.12, hubR * 1.25);
    ctx.fillStyle = drop;
    ctx.fill();

    const boss = ctx.createRadialGradient(cx - hubR * 0.35, cy - hubR * 0.4, hubR * 0.05, cx, cy, hubR);
    boss.addColorStop(0, '#ecd7a4');
    boss.addColorStop(0.55, '#b08a4e');
    boss.addColorStop(1, '#5a4120');
    circle(ctx, cx, cy, hubR);
    ctx.fillStyle = boss;
    ctx.fill();
    // Lathe rings
    for (let i = 0; i < 4; i++) {
      circle(ctx, cx, cy, hubR * (0.78 + i * 0.055));
      ctx.strokeStyle = i % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,200,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    circle(ctx, cx, cy, hubR);
    ctx.strokeStyle = BRASS_DARK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    circle(ctx, cx, cy, hubR * 0.72);
    ctx.fillStyle = '#17110a';
    ctx.fill();
    circle(ctx, cx, cy, hubR * 0.72);
    ctx.strokeStyle = 'rgba(255,230,180,0.25)';
    ctx.stroke();
    ctx.fillStyle = disabled ? 'rgba(232,199,122,0.4)' : '#e8c77a';
    ctx.font = `${hubR * 0.38}px "Bungee", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy + hubR * 0.04);
  },

  paintBulb(ctx, r, lit) {
    if (lit) {
      const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.8);
      halo.addColorStop(0, 'rgba(255,205,110,0.6)');
      halo.addColorStop(1, 'rgba(255,205,110,0)');
      circle(ctx, 0, 0, r * 2.8);
      ctx.fillStyle = halo;
      ctx.fill();
    }
    const glass = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    if (lit) {
      glass.addColorStop(0, '#fffdf2');
      glass.addColorStop(0.6, '#ffd98a');
      glass.addColorStop(1, '#d8902a');
    } else {
      glass.addColorStop(0, '#8a6430');
      glass.addColorStop(1, '#2c1d0a');
    }
    circle(ctx, 0, 0, r);
    ctx.fillStyle = glass;
    ctx.fill();
    if (!lit) {
      circle(ctx, -r * 0.35, -r * 0.35, r * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }
  },

  paintPeg(ctx, r) {
    const steel = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 0, 0, 0, r);
    steel.addColorStop(0, '#f4f4f2');
    steel.addColorStop(1, '#7d8289');
    circle(ctx, 0, 0, r);
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  paintFlapper(ctx, g, len) {
    const w = g.size * 0.026;
    const tri = () => {
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, len);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(g.size * 0.005, g.size * 0.009);
    tri();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();
    const body = ctx.createLinearGradient(-w, 0, w, 0);
    body.addColorStop(0, '#c63a30');
    body.addColorStop(1, '#6e1610');
    tri();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = '#3b0d09';
    ctx.lineWidth = 1;
    ctx.stroke();
    const pin = g.size * 0.015;
    const brass = ctx.createRadialGradient(-pin * 0.3, -pin * 0.3, 0, 0, 0, pin);
    brass.addColorStop(0, '#f0dcae');
    brass.addColorStop(1, '#6e5129');
    circle(ctx, 0, 0, pin);
    ctx.fillStyle = brass;
    ctx.fill();
  },

  paintWinner(ctx, g, start, end) {
    ctx.save();
    wedgePath(ctx, g.faceR - g.size * 0.006, start, end);
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#ffcf6b';
    ctx.shadowBlur = g.size * 0.03;
    ctx.strokeStyle = '#ffe4a3';
    ctx.lineWidth = g.size * 0.007;
    ctx.stroke();
    ctx.restore();
  },
};
