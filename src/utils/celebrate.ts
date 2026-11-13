import confetti from 'canvas-confetti';

const COLORS = ['#ffcb3d', '#e63946', '#fff3d6', '#4cc9f0', '#80ed99'];

/** Confetti from both bottom corners of the screen. Skipped for viewers who prefer reduced motion. */
export const celebrate = () => {
  const burst = { particleCount: 90, spread: 60, startVelocity: 55, colors: COLORS, disableForReducedMotion: true };
  void confetti({ ...burst, angle: 60, origin: { x: 0, y: 0.95 } });
  void confetti({ ...burst, angle: 120, origin: { x: 1, y: 0.95 } });
};
