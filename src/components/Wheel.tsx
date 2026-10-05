import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { WheelSegmentData } from '../types';
import type { WheelState } from '../hooks/useWheel';
import { easeOutQuart } from '../utils/easing';
import { TAU, computeSpinDelta } from '../utils/wheelMath';
import {
  boxGeometry,
  bulbAngles,
  bulbLit,
  coverCrop,
  flapperAngle,
  wedgeColor,
} from '../utils/wheelArt';
import type { CaseStyle, LightMode } from '../utils/wheelArt';

const SEGMENT_COUNT = 12;
const SEGMENT_ANGLE = TAU / SEGMENT_COUNT;
const SPIN_DURATION = 5200; // ms
const REDUCED_SPIN_DURATION = 1200;
const MIN_ROTATIONS = 5;
const MAX_EXTRA_ROTATIONS = 3;
const LOADING_SPEED = 0.0012; // rad/ms: a lazy turn while candidates load
const MAX_SIZE = 560;
const BULBS = bulbAngles(SEGMENT_COUNT);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

interface WheelProps {
  segments: WheelSegmentData[];
  wheelState: WheelState;
  winnerIndex: number | null;
  images: React.MutableRefObject<(HTMLImageElement | null)[]>;
  onSpinComplete: () => void;
  caseStyle: CaseStyle;
  onHubClick: () => void;
  hubDisabled: boolean;
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const hasPixels = (img: HTMLImageElement | null | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

const drawPoster = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

// Sheen across the plastic / shrink-wrap, drawn over the cover.
const drawGloss = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  const gloss = ctx.createLinearGradient(x, y, x + w, y + h);
  gloss.addColorStop(0, 'rgba(255,255,255,0.28)');
  gloss.addColorStop(0.35, 'rgba(255,255,255,0.04)');
  gloss.addColorStop(0.36, 'rgba(255,255,255,0)');
  gloss.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = gloss;
  ctx.fillRect(x, y, w, h);
};

/** A rental-store VHS sleeve: cardboard spine edge, poster front, black "VHS" strip along the bottom. */
const drawVhs = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null | undefined, w: number, h: number) => {
  const x = -w / 2;
  const y = -h / 2;
  const depth = w * 0.14;

  // Spine (the box's side, peeking out to the right)
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + depth, y + depth * 0.6);
  ctx.lineTo(x + w + depth, y + h + depth * 0.6);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(x, y, w, h);

  if (hasPixels(img)) {
    drawPoster(ctx, img, x, y, w, h * 0.86);
  } else {
    // Blank tape: white handwritten-style label on a black cassette
    ctx.fillStyle = '#f2ead3';
    ctx.fillRect(x + w * 0.12, y + h * 0.18, w * 0.76, h * 0.22);
    ctx.fillStyle = '#c1121f';
    ctx.font = `bold ${h * 0.16}px "Bungee", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, y + h * 0.29);
    ctx.fillStyle = '#222';
    for (const cx of [-w * 0.2, w * 0.2]) {
      ctx.beginPath();
      ctx.arc(cx, y + h * 0.6, w * 0.13, 0, TAU);
      ctx.fill();
    }
  }

  // Bottom brand strip
  ctx.fillStyle = '#050505';
  ctx.fillRect(x, y + h * 0.86, w, h * 0.14);
  ctx.fillStyle = '#f5f5f5';
  ctx.font = `900 ${h * 0.085}px system-ui`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('VHS', x + w * 0.08, y + h * 0.93);
  ctx.fillStyle = '#e89a00';
  ctx.fillRect(x + w * 0.62, y + h * 0.9, w * 0.3, h * 0.06);

  drawGloss(ctx, x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
};

/** A DVD keepcase: rounded black plastic, "DVD VIDEO" banner on top, cover under the clear sleeve. */
const drawDvd = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null | undefined, w: number, h: number) => {
  const x = -w / 2;
  const y = -h / 2;
  const r = w * 0.06;
  const spine = w * 0.07;

  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = '#121418';
  ctx.fill();

  const coverX = x + spine;
  const coverY = y + h * 0.03;
  const coverW = w - spine - w * 0.04;
  const coverH = h * 0.94;

  ctx.save();
  ctx.beginPath();
  ctx.rect(coverX, coverY, coverW, coverH);
  ctx.clip();
  if (hasPixels(img)) {
    drawPoster(ctx, img, coverX, coverY, coverW, coverH);
  } else {
    ctx.fillStyle = '#1d2433';
    ctx.fillRect(coverX, coverY, coverW, coverH);
    ctx.fillStyle = 'rgba(255,224,102,0.8)';
    ctx.font = `bold ${h * 0.24}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', coverX + coverW / 2, coverY + coverH / 2);
  }

  // "DVD VIDEO" banner
  ctx.fillStyle = 'rgba(10,10,14,0.88)';
  ctx.fillRect(coverX, coverY, coverW, coverH * 0.11);
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${coverH * 0.075}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DVD', coverX + coverW / 2, coverY + coverH * 0.058);
  drawGloss(ctx, coverX, coverY, coverW, coverH);
  ctx.restore();

  // Spine ridges
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + (spine * i) / 3, y + r);
    ctx.lineTo(x + (spine * i) / 3, y + h - r);
    ctx.stroke();
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();
};

const Wheel: React.FC<WheelProps> = ({
  segments,
  wheelState,
  winnerIndex,
  images,
  onSpinComplete,
  caseStyle,
  onHubClick,
  hubDisabled,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(MAX_SIZE);
  const currentAngleRef = useRef(0);

  // Responsive sizing: as large as the column allows, capped by viewport height on short screens
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const byWidth = containerRef.current.clientWidth;
      const byHeight = window.innerHeight - 230;
      setCanvasSize(Math.max(260, Math.min(byWidth, byHeight, MAX_SIZE)));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const drawWheel = useCallback((rotation: number, timeMs: number, lights: LightMode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2 + size * 0.02; // room for the flapper above the rim
    const outerR = size * 0.47;
    const rimW = outerR * 0.11;
    const faceR = outerR - rimW;
    const showWinner = wheelState === 'stopped' && winnerIndex !== null;

    ctx.clearRect(0, 0, size, size);

    // Drop shadow + rim
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size * 0.05;
    ctx.shadowOffsetY = size * 0.015;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, TAU);
    const rim = ctx.createLinearGradient(cx - outerR, cy - outerR, cx + outerR, cy + outerR);
    rim.addColorStop(0, '#fff1a8');
    rim.addColorStop(0.3, '#d4a017');
    rim.addColorStop(0.55, '#8a5a00');
    rim.addColorStop(0.8, '#e8b923');
    rim.addColorStop(1, '#7a4b00');
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.restore();

    // Wedges and their boxes
    const box = boxGeometry(caseStyle, SEGMENT_ANGLE);
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const start = rotation + i * SEGMENT_ANGLE - Math.PI / 2;
      const end = start + SEGMENT_ANGLE;
      const mid = start + SEGMENT_ANGLE / 2;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, faceR, start, end);
      ctx.closePath();
      const wedge = ctx.createRadialGradient(cx, cy, faceR * 0.15, cx, cy, faceR);
      wedge.addColorStop(0, '#000');
      wedge.addColorStop(0.35, wedgeColor(i));
      wedge.addColorStop(1, wedgeColor(i));
      ctx.fillStyle = wedge;
      ctx.fill();
      ctx.clip();

      ctx.translate(cx + Math.cos(mid) * faceR * box.distance, cy + Math.sin(mid) * faceR * box.distance);
      ctx.rotate(mid + Math.PI / 2); // box top faces the rim
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = faceR * 0.03;
      ctx.shadowOffsetX = faceR * 0.01;
      ctx.shadowOffsetY = faceR * 0.015;
      const w = faceR * box.width;
      const h = faceR * box.height;
      if (caseStyle === 'vhs') drawVhs(ctx, images.current[i], w, h);
      else drawDvd(ctx, images.current[i], w, h);
      ctx.restore();

      if (showWinner && i !== winnerIndex) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, faceR, start, end);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fill();
      }

      // Wedge divider
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(start) * faceR, cy + Math.sin(start) * faceR);
      ctx.strokeStyle = 'rgba(255,236,170,0.55)';
      ctx.lineWidth = Math.max(1.5, size * 0.004);
      ctx.stroke();
    }

    // Winner outline
    if (showWinner && winnerIndex !== null) {
      const start = rotation + winnerIndex * SEGMENT_ANGLE - Math.PI / 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, faceR - 2, start, start + SEGMENT_ANGLE);
      ctx.closePath();
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = size * 0.008;
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = size * 0.03;
      ctx.stroke();
      ctx.restore();
    }

    // Inner rim edge
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, TAU);
    ctx.strokeStyle = '#5c3a00';
    ctx.lineWidth = size * 0.006;
    ctx.stroke();

    // Pegs on every segment boundary (they turn with the wheel)
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const a = rotation + i * SEGMENT_ANGLE - Math.PI / 2;
      const px = cx + Math.cos(a) * (faceR - size * 0.012);
      const py = cy + Math.sin(a) * (faceR - size * 0.012);
      const peg = ctx.createRadialGradient(px - 1, py - 1, 0, px, py, size * 0.011);
      peg.addColorStop(0, '#ffffff');
      peg.addColorStop(1, '#9aa0a6');
      ctx.beginPath();
      ctx.arc(px, py, size * 0.011, 0, TAU);
      ctx.fillStyle = peg;
      ctx.fill();
    }

    // Marquee bulbs, fixed to the frame (they don't rotate)
    const bulbR = rimW * 0.24;
    BULBS.forEach((a, i) => {
      const bx = cx + Math.cos(a - Math.PI / 2) * (faceR + rimW / 2);
      const by = cy + Math.sin(a - Math.PI / 2) * (faceR + rimW / 2);
      const lit = bulbLit(i, timeMs, lights);
      ctx.save();
      if (lit) {
        ctx.shadowColor = '#fff3b0';
        ctx.shadowBlur = bulbR * 3;
      }
      ctx.beginPath();
      ctx.arc(bx, by, bulbR, 0, TAU);
      ctx.fillStyle = lit ? '#fffbe6' : '#6b4a12';
      ctx.fill();
      ctx.restore();
    });

    // Hub: brass cap with a SPIN label
    const hubR = faceR * 0.2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size * 0.02;
    const hub = ctx.createRadialGradient(cx - hubR * 0.3, cy - hubR * 0.3, hubR * 0.1, cx, cy, hubR);
    hub.addColorStop(0, '#fff6c4');
    hub.addColorStop(0.5, '#e0a91b');
    hub.addColorStop(1, '#7a4b00');
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, TAU);
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, hubR * 0.78, 0, TAU);
    ctx.fillStyle = '#1a0f05';
    ctx.fill();
    ctx.fillStyle = hubDisabled ? 'rgba(255,224,102,0.45)' : '#ffe066';
    ctx.font = `${hubR * 0.42}px "Bungee", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy + hubR * 0.04);

    // Flapper: pivots above the rim, its tip pushed aside by passing pegs
    const pivotY = cy - outerR - size * 0.005;
    const flapLen = rimW + size * 0.05;
    ctx.save();
    ctx.translate(cx, pivotY);
    ctx.rotate(flapperAngle(rotation, SEGMENT_ANGLE));
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size * 0.012;
    ctx.shadowOffsetY = size * 0.005;
    ctx.beginPath();
    ctx.moveTo(-size * 0.028, 0);
    ctx.lineTo(size * 0.028, 0);
    ctx.lineTo(0, flapLen);
    ctx.closePath();
    const flap = ctx.createLinearGradient(-size * 0.03, 0, size * 0.03, 0);
    flap.addColorStop(0, '#ff4d5a');
    flap.addColorStop(1, '#9d0b16');
    ctx.fillStyle = flap;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = size * 0.004;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.014, 0, TAU);
    ctx.fillStyle = '#ffe066';
    ctx.fill();
    ctx.restore();
  }, [canvasSize, images, caseStyle, wheelState, winnerIndex, hubDisabled]);

  // Spin animation (finite: ends when the easing reaches 1)
  useEffect(() => {
    if (wheelState !== 'spinning' || winnerIndex === null) return;

    const reduced = prefersReducedMotion();
    const fullTurns = reduced ? 1 : MIN_ROTATIONS + Math.floor(Math.random() * MAX_EXTRA_ROTATIONS);
    const duration = reduced ? REDUCED_SPIN_DURATION : SPIN_DURATION;
    const jitter = (Math.random() - 0.5) * SEGMENT_ANGLE * 0.5;
    const totalAngle = computeSpinDelta(
      currentAngleRef.current, winnerIndex, SEGMENT_COUNT, fullTurns, jitter
    );

    const startTime = performance.now();
    const startAngle = currentAngleRef.current;
    let active = true;

    const animate = (now: number) => {
      if (!active) return;
      const progress = Math.min((now - startTime) / duration, 1);
      const angle = startAngle + easeOutQuart(progress) * totalAngle;
      currentAngleRef.current = angle;
      drawWheel(angle, now, 'spinning');

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        currentAngleRef.current = angle % TAU;
        onSpinComplete();
      }
    };

    const id = requestAnimationFrame(animate);
    return () => {
      active = false;
      cancelAnimationFrame(id);
    };
  }, [wheelState, winnerIndex, drawWheel, onSpinComplete]);

  // Lazy turn while loading candidates, so the click gets immediate feedback
  useEffect(() => {
    if (wheelState !== 'loading' || prefersReducedMotion()) return;
    let active = true;
    let last = performance.now();
    const tick = (now: number) => {
      if (!active) return;
      currentAngleRef.current += (now - last) * LOADING_SPEED;
      last = now;
      drawWheel(currentAngleRef.current, now, 'loading');
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(id);
    };
  }, [wheelState, drawWheel]);

  // Static draw plus marquee lights at rest (a cheap interval, not a frame loop)
  useEffect(() => {
    if (wheelState === 'spinning' || wheelState === 'loading') return;
    const mode: LightMode = wheelState === 'stopped' ? 'stopped' : 'idle';
    drawWheel(currentAngleRef.current, performance.now(), mode);
    if (prefersReducedMotion()) return;
    const id = window.setInterval(
      () => drawWheel(currentAngleRef.current, performance.now(), mode),
      mode === 'stopped' ? 125 : 350
    );
    return () => window.clearInterval(id);
  }, [wheelState, drawWheel, segments]);

  // Redraw once the display font arrives so canvas text isn't stuck on the fallback
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) drawWheel(currentAngleRef.current, performance.now(), 'idle');
    });
    return () => {
      active = false;
    };
  }, [drawWheel]);

  const hubSize = canvasSize * 0.47 * 0.89 * 0.4; // outer radius → face radius → hub diameter
  const titles = segments.filter(s => s.title !== '?').map(s => s.title);
  const label = titles.length
    ? `Prize wheel with ${titles.length} titles: ${titles.join(', ')}`
    : 'Prize wheel of blank tapes. Spin to fill it with titles.';

  return (
    <div ref={containerRef} className="flex justify-center w-full max-w-[560px]">
      <div className="relative" style={{ width: canvasSize, height: canvasSize }}>
        <canvas ref={canvasRef} role="img" aria-label={label} />
        {/* Hub is a real button so it's reachable by keyboard and screen readers */}
        <button
          type="button"
          onClick={onHubClick}
          disabled={hubDisabled}
          aria-label="Spin the wheel"
          className="absolute rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-secondary disabled:cursor-not-allowed"
          style={{
            width: hubSize,
            height: hubSize,
            top: `calc(50% + ${canvasSize * 0.02}px)`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    </div>
  );
};

export default Wheel;
