import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { WheelSegmentData } from '../types';
import type { WheelState } from '../hooks/useWheel';
import { skipSpin, spinEase } from '../utils/easing';
import { prefersReducedMotion } from '../utils/motion';
import { TAU, computeSpinDelta } from '../utils/wheelMath';
import { boxGeometry, bulbLit, flapperAngle } from '../utils/wheelArt';
import type { CaseStyle, LightMode, WheelSkin } from '../utils/wheelArt';
import { bulbPositions, makeLayer, wedgePath, wheelGeometry } from '../wheel/paint';
import type { Skin, WheelGeometry } from '../wheel/paint';
import { celSkin } from '../wheel/celSkin';
import { realSkin } from '../wheel/realSkin';

const SEGMENT_COUNT = 12;
const SEGMENT_ANGLE = TAU / SEGMENT_COUNT;
const SPIN_DURATION = 6500; // ms
const REDUCED_SPIN_DURATION = 1200;
// Top speed is about turns * 3.2 / duration. Past ~2.5 turns a second each frame moves the wheel
// half a segment, and the boxes strobe instead of blurring into a spin.
const MIN_ROTATIONS = 4;
const MAX_EXTRA_ROTATIONS = 1;
// What's left to watch after the viewer skips: the slow crawl past the last few pegs
const SKIP_REMAINING = 2200;
// Turning that a single frame smears into a blur: past this the boxes would jump visibly between
// frames, so extra copies are drawn along the arc the wheel swept since the last one.
const BLUR_STEP = 0.045; // rad per copy
const MAX_BLUR_COPIES = 4;
const LOADING_SPEED = 0.0012; // rad/ms: a lazy turn while candidates load
const MAX_SIZE = 560;
// Title, spin button, hint and the toggles row below the wheel
const RESERVED_HEIGHT = 250;

const SKINS: Record<WheelSkin, Skin> = { cel: celSkin, real: realSkin };


interface WheelProps {
  segments: WheelSegmentData[];
  wheelState: WheelState;
  winnerIndex: number | null;
  images: React.MutableRefObject<(HTMLImageElement | null)[]>;
  onSpinComplete: () => void;
  caseStyle: CaseStyle;
  skin: WheelSkin;
  onHubClick: () => void;
  hubDisabled: boolean;
  /** Set during a spin to cut to its ending. */
  skipRequested: boolean;
}

/** The parts that turn, baked once per set of titles so a frame is just a few rotated blits. */
interface TurningLayers {
  key: string;
  segments: WheelSegmentData[];
  diameter: number;
  face: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  boxes: HTMLCanvasElement;
}

/** The parts that stay put: rim and sockets behind the face, light and hub in front of it. */
interface FrameLayers {
  key: string;
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  bulbOn: HTMLCanvasElement;
  bulbOff: HTMLCanvasElement;
  peg: HTMLCanvasElement;
}

const forEachBox = (ctx: CanvasRenderingContext2D, g: WheelGeometry, style: CaseStyle, draw: (i: number, w: number, h: number) => void) => {
  const box = boxGeometry(style, SEGMENT_ANGLE);
  const w = g.faceR * box.width;
  const h = g.faceR * box.height;
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const mid = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(Math.cos(mid) * g.faceR * box.distance, Math.sin(mid) * g.faceR * box.distance);
    ctx.rotate(mid + Math.PI / 2); // box top faces the rim
    draw(i, w, h);
    ctx.restore();
  }
};

const bakeTurning = (
  skin: Skin,
  g: WheelGeometry,
  dpr: number,
  style: CaseStyle,
  images: (HTMLImageElement | null)[],
  key: string,
  segments: WheelSegmentData[]
): TurningLayers => {
  const diameter = g.faceR * 2 + 4;
  const centred = (paint: (ctx: CanvasRenderingContext2D) => void) =>
    makeLayer(diameter, diameter, dpr, ctx => {
      ctx.translate(diameter / 2, diameter / 2);
      paint(ctx);
    });
  const shadow = skin.boxShadow(g);
  return {
    key,
    segments,
    diameter,
    face: centred(ctx => skin.paintFace(ctx, g)),
    // Silhouettes only: the offset is applied at draw time so the shadow falls the same way
    // however far the wheel has turned. The blur is baked here, where it costs nothing per frame.
    shadow: centred(ctx => {
      ctx.fillStyle = shadow.color;
      if (shadow.blur > 0) {
        ctx.shadowColor = shadow.color;
        ctx.shadowBlur = shadow.blur * dpr;
      }
      forEachBox(ctx, g, style, (_i, w, h) => ctx.fillRect(-w / 2, -h / 2, w, h));
    }),
    boxes: centred(ctx => forEachBox(ctx, g, style, (i, w, h) => skin.paintBox({ ctx, style, img: images[i], w, h }))),
  };
};

const bakeFrame = (skin: Skin, g: WheelGeometry, dpr: number, hubDisabled: boolean, key: string): FrameLayers => {
  const sprite = (r: number, paint: (ctx: CanvasRenderingContext2D) => void) =>
    makeLayer(r * 2, r * 2, dpr, ctx => {
      ctx.translate(r, r);
      paint(ctx);
    });
  const bulbBox = g.bulbR * 3;
  return {
    key,
    back: makeLayer(g.size, g.size, dpr, ctx => skin.paintRim(ctx, g)),
    front: makeLayer(g.size, g.size, dpr, ctx => {
      skin.paintFaceLight(ctx, g);
      skin.paintHub(ctx, g, hubDisabled);
    }),
    bulbOn: sprite(bulbBox, ctx => skin.paintBulb(ctx, g.bulbR, true)),
    bulbOff: sprite(bulbBox, ctx => skin.paintBulb(ctx, g.bulbR, false)),
    peg: sprite(g.pegR * 1.6, ctx => skin.paintPeg(ctx, g.pegR)),
  };
};

const Wheel: React.FC<WheelProps> = ({
  segments,
  wheelState,
  winnerIndex,
  images,
  onSpinComplete,
  caseStyle,
  skin,
  onHubClick,
  hubDisabled,
  skipRequested,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(MAX_SIZE);
  const [fontsLoaded, setFontsLoaded] = useState(0);
  const currentAngleRef = useRef(0);
  const turningRef = useRef<TurningLayers | null>(null);
  const frameRef = useRef<FrameLayers | null>(null);
  // The frame loops read these through refs: restarting a loop when they change would replan the
  // spin from scratch, so the wheel would lurch and run its full length again.
  const drawRef = useRef<(rotation: number, timeMs: number, lights: LightMode, sweep?: number) => void>(() => {});
  const skipRef = useRef(skipRequested);

  // Responsive sizing: as large as the column allows, capped by viewport height on short screens
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const byWidth = containerRef.current.clientWidth;
      const byHeight = window.innerHeight - RESERVED_HEIGHT;
      setCanvasSize(Math.max(260, Math.min(byWidth, byHeight, MAX_SIZE)));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Rebake once the display font arrives so canvas text isn't stuck on the fallback
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) setFontsLoaded(n => n + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  const drawWheel = useCallback((rotation: number, timeMs: number, lights: LightMode, sweep = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    const g = wheelGeometry(size, SEGMENT_COUNT);
    const painter = SKINS[skin];

    // Segments and their posters are committed together, so a new segments array is the signal
    // that the posters changed too.
    const turningKey = `${skin}|${caseStyle}|${size}|${dpr}|${fontsLoaded}`;
    let turning = turningRef.current;
    if (!turning || turning.key !== turningKey || turning.segments !== segments) {
      turning = bakeTurning(painter, g, dpr, caseStyle, images.current, turningKey, segments);
      turningRef.current = turning;
    }
    const frameKey = `${skin}|${size}|${dpr}|${fontsLoaded}|${hubDisabled}`;
    let frame = frameRef.current;
    if (!frame || frame.key !== frameKey) {
      frame = bakeFrame(painter, g, dpr, hubDisabled, frameKey);
      frameRef.current = frame;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(frame.back, 0, 0, size, size);

    const d = turning.diameter;
    const blitTurning = (layer: HTMLCanvasElement, dx = 0, dy = 0, at = rotation) => {
      ctx.save();
      ctx.translate(g.cx + dx, g.cy + dy);
      ctx.rotate(at);
      ctx.drawImage(layer, -d / 2, -d / 2, d, d);
      ctx.restore();
    };
    // Copies spread back along the swept arc; drawing copy k at 1/k opacity weights them all equally
    const copies = Math.min(MAX_BLUR_COPIES, Math.max(1, Math.ceil(Math.abs(sweep) / BLUR_STEP)));
    const blitBlurred = (layer: HTMLCanvasElement) => {
      for (let k = 1; k <= copies; k++) {
        ctx.globalAlpha = 1 / k;
        blitTurning(layer, 0, 0, rotation - (sweep * (k - 1)) / copies);
      }
      ctx.globalAlpha = 1;
    };
    const shadow = painter.boxShadow(g);
    blitBlurred(turning.face);
    ctx.save();
    // Keep the shadow on the face, not spilling onto the rim
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.faceR, 0, TAU);
    ctx.clip();
    blitTurning(turning.shadow, shadow.dx, shadow.dy);
    ctx.restore();
    blitBlurred(turning.boxes);

    if (wheelState === 'stopped' && winnerIndex !== null) {
      ctx.save();
      ctx.translate(g.cx, g.cy);
      ctx.rotate(rotation);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 0; i < SEGMENT_COUNT; i++) {
        if (i === winnerIndex) continue;
        const start = i * SEGMENT_ANGLE - Math.PI / 2;
        wedgePath(ctx, g.faceR, start, start + SEGMENT_ANGLE);
        ctx.fill();
      }
      const start = winnerIndex * SEGMENT_ANGLE - Math.PI / 2;
      painter.paintWinner(ctx, g, start, start + SEGMENT_ANGLE);
      ctx.restore();
    }

    // Pegs turn with the wheel but are drawn upright, so their shading keeps facing the light
    const pegD = frame.peg.width / dpr;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const a = rotation + i * SEGMENT_ANGLE - Math.PI / 2;
      const r = g.faceR - g.size * 0.014;
      ctx.drawImage(frame.peg, g.cx + Math.cos(a) * r - pegD / 2, g.cy + Math.sin(a) * r - pegD / 2, pegD, pegD);
    }

    ctx.drawImage(frame.front, 0, 0, size, size);

    const bulbD = frame.bulbOn.width / dpr;
    bulbPositions(g).forEach(([bx, by], i) => {
      const sprite = bulbLit(i, timeMs, lights) ? frame.bulbOn : frame.bulbOff;
      ctx.drawImage(sprite, bx - bulbD / 2, by - bulbD / 2, bulbD, bulbD);
    });

    // Flapper: pivots above the rim, its tip pushed aside by passing pegs
    ctx.save();
    ctx.translate(g.cx, g.cy - g.outerR - size * 0.005);
    ctx.rotate(flapperAngle(rotation, SEGMENT_ANGLE));
    painter.paintFlapper(ctx, g, g.rimW + size * 0.05);
    ctx.restore();
  }, [canvasSize, images, segments, caseStyle, skin, wheelState, winnerIndex, hubDisabled, fontsLoaded]);

  useEffect(() => {
    drawRef.current = drawWheel;
    skipRef.current = skipRequested;
  }, [drawWheel, skipRequested]);

  // Spin animation (finite: ends when the progress reaches 1)
  useEffect(() => {
    if (wheelState !== 'spinning' || winnerIndex === null) return;

    const reduced = prefersReducedMotion();
    const fullTurns = reduced ? 1 : MIN_ROTATIONS + Math.floor(Math.random() * MAX_EXTRA_ROTATIONS);
    const duration = reduced ? REDUCED_SPIN_DURATION : SPIN_DURATION;
    const jitter = (Math.random() - 0.5) * SEGMENT_ANGLE * 0.5;
    const startAngle = currentAngleRef.current;
    const totalAngle = computeSpinDelta(startAngle, winnerIndex, SEGMENT_COUNT, fullTurns, jitter);

    // Progress advances from `fromProgress` at `rate` since `fromTime`; a skip moves all three
    let fromTime: number | null = null;
    let fromProgress = 0;
    let rate = 1;
    let skipped = false;
    let framesAtRest = 0;
    let lastAngle = startAngle;
    let active = true;
    let frameId = 0;

    const animate = (now: number) => {
      if (!active) return;
      let progress = fromTime === null ? 0 : Math.min(fromProgress + (Math.max(0, now - fromTime) / duration) * rate, 1);
      if (skipRef.current && !skipped && !reduced) {
        skipped = true;
        ({ progress, rate } = skipSpin(progress, totalAngle, duration, SKIP_REMAINING));
        fromProgress = progress;
        fromTime = now;
      }
      const angle = startAngle + spinEase(progress) * totalAngle;
      currentAngleRef.current = angle;
      // Measured on the dial, so a skip's jump of whole turns doesn't read as a huge sweep
      const sweep = reduced ? 0 : (((angle - lastAngle + Math.PI) % TAU) + TAU) % TAU - Math.PI;
      lastAngle = angle;
      drawRef.current(angle, now, 'spinning', sweep);
      // The first frame bakes the new posters. Starting the clock on the frame after it keeps that
      // cost from showing up as a jump.
      if (fromTime === null && ++framesAtRest === 2) fromTime = now;

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        currentAngleRef.current = angle % TAU;
        onSpinComplete();
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, [wheelState, winnerIndex, onSpinComplete]);

  // Lazy turn while loading candidates, so the click gets immediate feedback
  useEffect(() => {
    if (wheelState !== 'loading' || prefersReducedMotion()) return;
    let active = true;
    let last = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      if (!active) return;
      currentAngleRef.current += (now - last) * LOADING_SPEED;
      last = now;
      drawRef.current(currentAngleRef.current, now, 'loading');
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, [wheelState]);

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
  }, [wheelState, drawWheel]);

  const hubSize = wheelGeometry(canvasSize, SEGMENT_COUNT).hubR * 2;
  const titles = segments.filter(s => s.title !== '?').map(s => s.title);
  const label = titles.length
    ? `Prize wheel with ${titles.length} titles: ${titles.join(', ')}`
    : 'Prize wheel of blank tapes. Spin to fill it with titles.';

  return (
    <div ref={containerRef} className="flex justify-center w-full max-w-[560px]">
      <div className="relative" style={{ width: canvasSize, height: canvasSize }}>
        {/* Clicking anywhere on the wheel spins it; the hub button below is the keyboard route */}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          onClick={hubDisabled ? undefined : onHubClick}
          className={hubDisabled ? '' : 'cursor-pointer'}
        />
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
