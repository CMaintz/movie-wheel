export const TAU = 2 * Math.PI;

const mod = (value: number, n: number): number => ((value % n) + n) % n;

// Segment i is drawn from `rotation + i * segmentAngle`, measured from the 12 o'clock pointer.
export const segmentAtPointer = (rotation: number, segmentCount: number): number => {
  const segmentAngle = TAU / segmentCount;
  return Math.floor(mod(-rotation, TAU) / segmentAngle) % segmentCount;
};

/**
 * How far to rotate from `startRotation` so the wheel stops with `winnerIndex` under the pointer.
 * `jitter` offsets the stop point from the segment centre and must stay within ±half a segment.
 */
export const computeSpinDelta = (
  startRotation: number,
  winnerIndex: number,
  segmentCount: number,
  fullTurns: number,
  jitter = 0
): number => {
  const segmentAngle = TAU / segmentCount;
  const stopOffset = winnerIndex * segmentAngle + segmentAngle / 2 + jitter;
  return fullTurns * TAU + mod(-stopOffset - startRotation, TAU);
};
