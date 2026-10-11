import React, { useEffect, useRef, useState } from 'react';
import type { WheelSegmentData } from '../types';
import type { WheelState } from '../hooks/useWheel';
import { easeOutQuart } from '../utils/easing';
import { TAU, computeSpinDelta } from '../utils/wheelMath';
import { flapperAngle } from '../utils/wheelArt';
import type { CaseStyle, LightMode } from '../utils/wheelArt';
import { createWheelScene } from '../three/wheelScene';
import type { WheelScene } from '../three/wheelScene';

const SEGMENT_COUNT = 12;
const SEGMENT_ANGLE = TAU / SEGMENT_COUNT;
const SPIN_DURATION = 5600; // ms
const REDUCED_SPIN_DURATION = 1200;
const MIN_ROTATIONS = 5;
const MAX_EXTRA_ROTATIONS = 3;
const LOADING_SPEED = 0.0012; // rad/ms
const MAX_SIZE = 680;

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

interface Wheel3DProps {
  segments: WheelSegmentData[];
  wheelState: WheelState;
  winnerIndex: number | null;
  images: React.MutableRefObject<(HTMLImageElement | null)[]>;
  onSpinComplete: () => void;
  caseStyle: CaseStyle;
  onHubClick: () => void;
  hubDisabled: boolean;
  /** Called when WebGL isn't available, so the app can fall back to the 2D wheel. */
  onUnsupported: () => void;
}

interface Spin {
  start: number;
  from: number;
  total: number;
  duration: number;
}

const Wheel3D: React.FC<Wheel3DProps> = ({
  segments,
  wheelState,
  winnerIndex,
  images,
  onSpinComplete,
  caseStyle,
  onHubClick,
  hubDisabled,
  onUnsupported,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WheelScene | null>(null);
  const [size, setSize] = useState(MAX_SIZE);
  const [hub, setHub] = useState({ x: MAX_SIZE / 2, y: MAX_SIZE / 2, r: 40 });

  // The render loop reads these refs, so React state changes never restart it.
  const angleRef = useRef(0);
  const spinRef = useRef<Spin | null>(null);
  const stateRef = useRef(wheelState);
  const winnerRef = useRef(winnerIndex);
  const onCompleteRef = useRef(onSpinComplete);
  const onUnsupportedRef = useRef(onUnsupported);

  useEffect(() => {
    stateRef.current = wheelState;
    winnerRef.current = winnerIndex;
    onCompleteRef.current = onSpinComplete;
    onUnsupportedRef.current = onUnsupported;
  });

  // Create the scene once and run the frame loop for as long as it's mounted
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: WheelScene;
    try {
      scene = createWheelScene(canvas, SEGMENT_COUNT);
    } catch (err) {
      console.warn('3D wheel unavailable, falling back to 2D:', err);
      onUnsupportedRef.current();
      return;
    }
    sceneRef.current = scene;
    const reduced = prefersReducedMotion();
    let active = true;
    let last = performance.now();
    let lastAngle = angleRef.current;

    const frame = (now: number) => {
      if (!active) return;
      const state = stateRef.current;
      const spin = spinRef.current;
      let lights: LightMode = state;

      if (state === 'spinning' && spin) {
        const progress = Math.min((now - spin.start) / spin.duration, 1);
        angleRef.current = spin.from + easeOutQuart(progress) * spin.total;
        if (progress >= 1) {
          spinRef.current = null;
          angleRef.current %= TAU;
          onCompleteRef.current();
        }
      } else if (state === 'loading' && !reduced) {
        angleRef.current += (now - last) * LOADING_SPEED;
      }
      if (reduced) lights = 'idle';
      const dt = Math.max(now - last, 1);
      const angularVelocity = reduced ? 0 : (angleRef.current - lastAngle) / dt;
      // A finished spin wraps the angle back into [0, TAU); don't read that jump as speed
      const velocity = Math.abs(angularVelocity) > 0.2 ? 0 : angularVelocity;
      lastAngle = angleRef.current;
      last = now;

      scene.render({
        rotation: angleRef.current,
        flapper: flapperAngle(angleRef.current, SEGMENT_ANGLE),
        lights,
        timeMs: reduced ? 0 : now,
        winnerIndex: winnerRef.current,
        angularVelocity: velocity,
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    return () => {
      active = false;
      sceneRef.current = null;
      scene.dispose();
    };
  }, []);

  // Responsive sizing: as large as the column allows, capped by viewport height
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const next = Math.max(280, Math.min(container.clientWidth, window.innerHeight - 200, MAX_SIZE));
      setSize(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setSize(size, size);
    setHub(scene.hubOnScreen(size, size));
  }, [size]);

  // Plan the spin when the state flips to spinning
  useEffect(() => {
    if (wheelState !== 'spinning' || winnerIndex === null) return;
    const reduced = prefersReducedMotion();
    const fullTurns = reduced ? 1 : MIN_ROTATIONS + Math.floor(Math.random() * MAX_EXTRA_ROTATIONS);
    const jitter = (Math.random() - 0.5) * SEGMENT_ANGLE * 0.5;
    spinRef.current = {
      start: performance.now(),
      from: angleRef.current,
      total: computeSpinDelta(angleRef.current, winnerIndex, SEGMENT_COUNT, fullTurns, jitter),
      duration: reduced ? REDUCED_SPIN_DURATION : SPIN_DURATION,
    };
  }, [wheelState, winnerIndex]);

  // Rebuild the boxes when new titles (and their posters) arrive or the case style changes.
  // During loading the segments are new but posters aren't preloaded yet, so wait.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || wheelState === 'loading') return;
    scene.setBoxes(
      segments.map((s, i) => ({ image: images.current[i], title: s.title })),
      caseStyle,
    );
  }, [segments, caseStyle, wheelState, images]);

  // Re-draw the hub lettering once the display font has loaded
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) sceneRef.current?.refreshHubCap();
    });
    return () => {
      active = false;
    };
  }, []);

  const titles = segments.filter(s => s.title !== '?').map(s => s.title);
  const label = titles.length
    ? `Prize wheel with ${titles.length} titles: ${titles.join(', ')}`
    : 'Prize wheel of blank tapes. Spin to fill it with titles.';

  return (
    <div ref={containerRef} className="flex justify-center w-full max-w-[680px]">
      <div className="relative rounded-2xl overflow-hidden shadow-2xl" style={{ width: size, height: size }}>
        <canvas ref={canvasRef} role="img" aria-label={label} style={{ width: size, height: size, display: 'block' }} />
        <button
          type="button"
          onClick={onHubClick}
          disabled={hubDisabled}
          aria-label="Spin the wheel"
          className="absolute rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-secondary disabled:cursor-not-allowed"
          style={{ left: hub.x - hub.r, top: hub.y - hub.r, width: hub.r * 2, height: hub.r * 2 }}
        />
      </div>
    </div>
  );
};

export default Wheel3D;
