import type { RacingLinePoint, TrackDefinition } from './types.ts';

const LATERAL_GRIP = 14;
const BRAKE_DECEL = 9;
const ACCEL = 5.5;
const MAX_LINE_SPEED = 60;
const EDGE_MARGIN = 3.4;
const APEX_GAIN = 260;
const CURVATURE_WINDOW = 10;
const SMOOTH_PASSES = 40;
/** On the inside of a corner the car's path radius must stay above this, or it clips the inner barrier. */
const MIN_INSIDE_RADIUS = 13;

/** Apex-seeking line plus a braking-aware speed profile, used by bots and by the minimap. */
export function buildRacingLine(track: TrackDefinition): RacingLinePoint[] {
  const { samples, width, spacing } = track;
  const n = samples.length;
  const maxOffset = width / 2 - EDGE_MARGIN;

  const averaged = samples.map((_, i) => {
    let sum = 0;
    for (let j = -CURVATURE_WINDOW; j <= CURVATURE_WINDOW; j++) sum += samples[(i + j + n) % n].curvature;
    return sum / (CURVATURE_WINDOW * 2 + 1);
  });
  // Inside of a left turn is the left normal (+offset).
  let offsets = averaged.map((k) => Math.max(-1, Math.min(1, k * APEX_GAIN)) * maxOffset);
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    offsets = offsets.map((o, i) => (offsets[(i - 1 + n) % n] + o * 2 + offsets[(i + 1) % n]) / 4);
  }
  offsets = offsets.map((o, i) => {
    const k = samples[i].curvature;
    const inside = Math.sign(o) === Math.sign(k);
    const limit = inside ? Math.min(maxOffset, Math.max(0, 1 / Math.max(Math.abs(k), 1e-6) - MIN_INSIDE_RADIUS)) : maxOffset;
    return Math.max(-limit, Math.min(limit, o));
  });
  for (let pass = 0; pass < 6; pass++) {
    offsets = offsets.map((o, i) => {
      const neighbours = (offsets[(i - 1 + n) % n] + offsets[(i + 1) % n]) / 2;
      // Smooth again but never re-enter the clamped inside zone.
      const k = samples[i].curvature;
      const candidate = (o + neighbours) / 2;
      const inside = Math.sign(candidate) === Math.sign(k);
      const limit = inside ? Math.min(maxOffset, Math.max(0, 1 / Math.max(Math.abs(k), 1e-6) - MIN_INSIDE_RADIUS)) : maxOffset;
      return Math.max(-limit, Math.min(limit, candidate));
    });
  }

  const points = samples.map((s, i) => ({ x: s.x + s.nx * offsets[i], z: s.z + s.nz * offsets[i] }));
  const speeds = points.map((p, i) => {
    const a = points[(i - 2 + n) % n];
    const b = points[(i + 2) % n];
    const k = Math.abs(circumCurvature(a, p, b));
    return Math.min(MAX_LINE_SPEED, Math.sqrt(LATERAL_GRIP / Math.max(k, 1e-6)));
  });

  // Two laps backwards for braking zones, then forwards for traction-limited exits.
  for (let pass = 0; pass < 2 * n; pass++) {
    const i = (n - 1 - (pass % n) + n) % n;
    const next = speeds[(i + 1) % n];
    speeds[i] = Math.min(speeds[i], Math.sqrt(next * next + 2 * BRAKE_DECEL * spacing));
  }
  for (let pass = 0; pass < 2 * n; pass++) {
    const i = pass % n;
    const prev = speeds[(i - 1 + n) % n];
    speeds[i] = Math.min(speeds[i], Math.sqrt(prev * prev + 2 * ACCEL * spacing));
  }

  return offsets.map((offset, i) => ({ offset, speed: speeds[i] }));
}

function circumCurvature(a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }): number {
  const ab = Math.hypot(b.x - a.x, b.z - a.z);
  const bc = Math.hypot(c.x - b.x, c.z - b.z);
  const ca = Math.hypot(a.x - c.x, a.z - c.z);
  const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const denominator = ab * bc * ca;
  return denominator < 1e-9 ? 0 : (2 * cross) / denominator;
}
