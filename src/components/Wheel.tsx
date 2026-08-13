import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { WheelSegmentData } from '../types';
import type { WheelState } from '../hooks/useWheel';
import { easeOutCubic } from '../utils/easing';
import { Tv, Image as ImageIcon } from 'lucide-react';

const SEGMENT_COUNT = 12;
const SEGMENT_ANGLE = (2 * Math.PI) / SEGMENT_COUNT;
const SPIN_DURATION = 4500; // ms
const MIN_ROTATIONS = 5;
const MAX_EXTRA_ROTATIONS = 3;

// Alternating cinematic dark colors
const SEGMENT_COLORS = ['#1a1a2e', '#16213e'];

export type WheelDisplayMode = 'dvd' | 'fullbleed';

interface WheelProps {
  segments: WheelSegmentData[];
  wheelState: WheelState;
  winnerIndex: number | null;
  images: React.MutableRefObject<(HTMLImageElement | null)[]>;
  onSpinComplete: () => void;
  displayMode: WheelDisplayMode;
}

const Wheel: React.FC<WheelProps> = ({
  segments,
  wheelState,
  winnerIndex,
  images,
  onSpinComplete,
  displayMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const [canvasSize, setCanvasSize] = useState(460);
  const currentAngleRef = useRef(0);

  // Responsive sizing
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        setCanvasSize(Math.min(containerWidth - 16, 460));
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const drawWheel = useCallback((rotation: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    // Draw outer glow
    ctx.save();
    ctx.shadowColor = 'rgba(33, 150, 243, 0.3)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a15';
    ctx.fill();
    ctx.restore();

    // Draw segments
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const startAngle = rotation + i * SEGMENT_ANGLE - Math.PI / 2;
      const endAngle = startAngle + SEGMENT_ANGLE;
      const img = images.current[i];

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();

      // Background
      ctx.fillStyle = SEGMENT_COLORS[i % 2];
      ctx.fill();

      // Clip to segment
      ctx.clip();

      const midAngle = startAngle + SEGMENT_ANGLE / 2;

      if (displayMode === 'fullbleed') {
        // Full bleed: fill entire segment with poster
        if (img && img.complete && img.naturalWidth > 0) {
          const imgDist = radius * 0.55;
          const imgCx = cx + Math.cos(midAngle) * imgDist;
          const imgCy = cy + Math.sin(midAngle) * imgDist;
          const imgW = radius * 0.45;
          const imgH = imgW * 1.5;

          // Slight dark overlay for readability
          ctx.globalAlpha = 0.85;
          ctx.drawImage(img, imgCx - imgW / 2, imgCy - imgH / 2, imgW, imgH);
          ctx.globalAlpha = 1;
        } else {
          // "?" placeholder
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.font = `bold ${radius * 0.14}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textDist = radius * 0.6;
          ctx.fillText('?', cx + Math.cos(midAngle) * textDist, cy + Math.sin(midAngle) * textDist);
        }
      } else {
        // DVD case mode: black rectangle with poster inside
        const caseDist = radius * 0.55;
        const caseCx = cx + Math.cos(midAngle) * caseDist;
        const caseCy = cy + Math.sin(midAngle) * caseDist;
        const caseW = radius * 0.22;
        const caseH = caseW * 1.5;

        // Draw DVD case background
        ctx.save();
        ctx.translate(caseCx, caseCy);
        ctx.rotate(midAngle + Math.PI / 2);

        // Black case with subtle border
        ctx.fillStyle = '#0a0a0a';
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        const rx = -caseW / 2;
        const ry = -caseH / 2;
        const cornerR = 3;

        // Rounded rect
        ctx.beginPath();
        ctx.moveTo(rx + cornerR, ry);
        ctx.lineTo(rx + caseW - cornerR, ry);
        ctx.quadraticCurveTo(rx + caseW, ry, rx + caseW, ry + cornerR);
        ctx.lineTo(rx + caseW, ry + caseH - cornerR);
        ctx.quadraticCurveTo(rx + caseW, ry + caseH, rx + caseW - cornerR, ry + caseH);
        ctx.lineTo(rx + cornerR, ry + caseH);
        ctx.quadraticCurveTo(rx, ry + caseH, rx, ry + caseH - cornerR);
        ctx.lineTo(rx, ry + cornerR);
        ctx.quadraticCurveTo(rx, ry, rx + cornerR, ry);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (img && img.complete && img.naturalWidth > 0) {
          // Draw poster inside case
          ctx.clip();
          ctx.drawImage(img, rx + 1, ry + 1, caseW - 2, caseH - 2);
        } else {
          // "?" in the case
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = `bold ${caseW * 0.6}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', 0, 0);
        }

        ctx.restore();
      }

      ctx.restore();

      // Segment border
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(startAngle) * radius,
        cy + Math.sin(startAngle) * radius
      );
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Center circle
    const centerR = radius * 0.12;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerR);
    gradient.addColorStop(0, '#2196f3');
    gradient.addColorStop(1, '#1565c0');
    ctx.beginPath();
    ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Nub marks on outer ring
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const angle = rotation + i * SEGMENT_ANGLE - Math.PI / 2;
      const nubInner = radius - 4;
      const nubOuter = radius + 4;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(angle) * (nubInner + (nubOuter - nubInner) / 2),
        cy + Math.sin(angle) * (nubInner + (nubOuter - nubInner) / 2),
        3, 0, Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
  }, [canvasSize, segments, images, displayMode]);

  // Spin animation
  useEffect(() => {
    if (wheelState !== 'spinning' || winnerIndex === null) return;

    // Calculate target angle: winner segment should be at top (12 o'clock = -PI/2)
    const targetSegmentCenter = winnerIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const fullRotations = (MIN_ROTATIONS + Math.floor(Math.random() * MAX_EXTRA_ROTATIONS)) * Math.PI * 2;
    // We want the segment at winnerIndex to be at the top
    // The pointer is at -PI/2 (top). A segment at angle 'a' from start is under pointer when rotation = -a
    const jitter = (Math.random() - 0.5) * SEGMENT_ANGLE * 0.5;
    const totalAngle = fullRotations + (2 * Math.PI - targetSegmentCenter) + jitter;

    const startTime = performance.now();
    const startAngle = currentAngleRef.current;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / SPIN_DURATION, 1);
      const easedProgress = easeOutCubic(progress);
      const angle = startAngle + easedProgress * totalAngle;
      currentAngleRef.current = angle;

      drawWheel(angle);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        animRef.current = null;
        onSpinComplete();
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [wheelState, winnerIndex, drawWheel, onSpinComplete]);

  // Static draw when not spinning
  useEffect(() => {
    if (wheelState !== 'spinning') {
      drawWheel(currentAngleRef.current);
    }
  }, [wheelState, drawWheel, segments]);

  return (
    <div ref={containerRef} className="relative flex items-center justify-center w-full max-w-[500px]">
      {/* Pointer at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10" style={{ marginTop: '-2px' }}>
        <div
          className="w-0 h-0 drop-shadow-lg"
          style={{
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: '26px solid #ffb300',
          }}
        />
      </div>

      <canvas
        ref={canvasRef}
        className="rounded-full"
        style={{ marginTop: '12px' }}
      />

      {/* Display mode toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          // Dispatch custom event to toggle display mode
          window.dispatchEvent(new CustomEvent('toggleDisplayMode'));
        }}
        className="absolute bottom-2 right-2 p-2 bg-bg-paper/80 hover:bg-bg-paper rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-colors"
        title={displayMode === 'dvd' ? 'Switch to full bleed mode' : 'Switch to DVD case mode'}
      >
        {displayMode === 'dvd' ? <ImageIcon size={16} /> : <Tv size={16} />}
      </button>
    </div>
  );
};

export default Wheel;
