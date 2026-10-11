import { coverCrop } from '../utils/wheelArt';
import type { CaseStyle } from '../utils/wheelArt';

// Canvas-drawn faces for the 3D boxes. Kept separate from the scene so the
// artwork can change without touching geometry or lighting.

const hasPixels = (img: HTMLImageElement | null | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

const makeCanvas = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
};

const drawPoster = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

// Light scuffing so the cardboard doesn't look factory-perfect.
const addWear = (ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) => {
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#fff';
  for (let i = 0; i < 14; i++) {
    const x = rand() * w;
    const y = rand() * h;
    ctx.lineWidth = 0.5 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 12);
    ctx.stroke();
  }
  // Worn corners
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#d8cfc0';
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 6 + rand() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/** Front cover: poster plus the format's branding, or a blank tape label before the first spin. */
export const drawFront = (
  style: CaseStyle,
  img: HTMLImageElement | null | undefined,
  seed: number,
): HTMLCanvasElement => {
  const W = 360;
  const H = style === 'vhs' ? 640 : 512;
  const { canvas, ctx } = makeCanvas(W, H);

  if (style === 'vhs') {
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, W, H);
    const artH = H * 0.86;
    if (hasPixels(img)) {
      drawPoster(ctx, img, 0, 0, W, artH);
    } else {
      // Blank tape with a handwritten label
      ctx.fillStyle = '#f1e9d2';
      ctx.fillRect(W * 0.1, H * 0.2, W * 0.8, H * 0.2);
      ctx.fillStyle = '#c1121f';
      ctx.font = `700 ${H * 0.13}px "Comic Sans MS", "Segoe Print", cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('???', W / 2, H * 0.305);
      ctx.fillStyle = '#1c1c1c';
      for (const cx of [W * 0.3, W * 0.7]) {
        ctx.beginPath();
        ctx.arc(cx, H * 0.6, W * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath();
        ctx.arc(cx, H * 0.6, W * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1c1c';
      }
    }
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, artH, W, H - artH);
    ctx.fillStyle = '#f5f5f5';
    ctx.font = `900 ${H * 0.07}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('VHS', W * 0.07, artH + (H - artH) / 2);
    ctx.fillStyle = '#e89a00';
    ctx.fillRect(W * 0.6, artH + (H - artH) * 0.35, W * 0.32, (H - artH) * 0.3);
    addWear(ctx, W, H, seed);
  } else {
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, W, H);
    const banner = H * 0.1;
    if (hasPixels(img)) {
      drawPoster(ctx, img, 0, banner, W, H - banner);
    } else {
      ctx.fillStyle = '#1d2433';
      ctx.fillRect(0, banner, W, H - banner);
      ctx.fillStyle = 'rgba(255,224,102,0.85)';
      ctx.font = `700 ${H * 0.25}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', W / 2, H * 0.55);
    }
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, W, banner);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${banner * 0.62}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DVD', W / 2, banner / 2 + 1);
  }
  return canvas;
};

/** Spine: the title running up a black strip, like a shelf of rentals. */
export const drawSpine = (style: CaseStyle, title: string): HTMLCanvasElement => {
  const W = 64;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = style === 'vhs' ? '#0d0d0d' : '#14161b';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#f1f1f1';
  ctx.font = `700 ${W * 0.42}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = title === '?' ? '' : title.toUpperCase();
  ctx.fillText(text.length > 22 ? `${text.slice(0, 21)}…` : text, -H * 0.06, 0, H * 0.75);
  ctx.fillStyle = '#e89a00';
  ctx.font = `900 ${W * 0.36}px system-ui, sans-serif`;
  ctx.fillText(style.toUpperCase(), H * 0.4, 0);
  ctx.restore();
  return canvas;
};

/** The hub cap's engraved SPIN lettering. */
export const drawHubCap = (): HTMLCanvasElement => {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#1a0f05';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe066';
  ctx.font = `${S * 0.24}px "Bungee", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPIN', S / 2, S / 2 + S * 0.02);
  return canvas;
};

/** Stage curtain: soft vertical folds in deep red. */
export const drawCurtain = (): HTMLCanvasElement => {
  const W = 1024;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  const folds = 22;
  for (let i = 0; i < folds; i++) {
    const x = (i / folds) * W;
    const fw = W / folds;
    const g = ctx.createLinearGradient(x, 0, x + fw, 0);
    g.addColorStop(0, '#2a0306');
    g.addColorStop(0.45, '#7a0b16');
    g.addColorStop(0.6, '#5c0710');
    g.addColorStop(1, '#22020a');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, fw + 1, H);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  return canvas;
};
