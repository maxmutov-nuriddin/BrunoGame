import type { Rng } from '../rng.ts';
import type { Point2 } from './spline.ts';
import type { TrackCrossing, TrackLayout, TrackSample, TrackTheme } from './types.ts';

/** Overpass deck height above the road it crosses (m); validation demands at least OVERPASS_MIN_CLEARANCE. */
export const OVERPASS_HEIGHT = 8.5;
export const OVERPASS_MIN_CLEARANCE = 6.5;
const OVERPASS_PLATEAU = 18;
// Smoothstep ramps peak at 1.5x the average grade: 9.5 m over 150 m stays near 10 %.
const OVERPASS_RAMP = 150;
const OVERPASS_MAX_LIFT = 9.5;
const CROSSING_MIN_ANGLE = (35 * Math.PI) / 180;
const CROSSING_MIN_ARC = 150;
const WATER_BRIDGE_LIFT = 3;
const WATER_BRIDGE_PLATEAU = 30;
const WATER_BRIDGE_RAMP = 50;
/** Lift above which a sample counts as a deck with open space below. */
const OVERPASS_DECK_LIFT = 3;
const WATER_DECK_LIFT = 1.5;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

export function pickLayout(rng: Rng): TrackLayout {
  const roll = rng.next();
  return roll < 0.45 ? 'loop' : roll < 0.75 ? 'figure8' : 'island';
}

export function pickTheme(rng: Rng, layout: TrackLayout): TrackTheme {
  if (layout === 'island') return 'island';
  return rng.pick(['meadow', 'desert', 'snow', 'dusk'] as const);
}

/** Fills the world with long in-and-out sweepers: the longest lap, no hairpins. */
export function speedwayPoints(rng: Rng): Point2[] {
  const count = 14;
  const step = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, i) => {
    const angle = i * step + rng.range(-0.08, 0.08) * step;
    const radius = i % 2 === 0 ? rng.range(405, 411) : rng.range(330, 340);
    return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
  });
}

/** Big irregular loop: 12–17 control points, 2–3 of them pulled in hard to make hairpins. */
export function loopPoints(rng: Rng): Point2[] {
  const count = rng.int(12, 17);
  const step = (Math.PI * 2) / count;
  const hairpins = new Set<number>();
  const wanted = rng.int(2, 3);
  while (hairpins.size < wanted) {
    const i = rng.int(0, count - 1);
    if (!hairpins.has((i + 1) % count) && !hairpins.has((i - 1 + count) % count)) hairpins.add(i);
  }
  return Array.from({ length: count }, (_, i) => {
    const angle = i * step + rng.range(-0.22, 0.22) * step;
    const radius = hairpins.has(i) ? rng.range(95, 150) : rng.range(250, 395);
    return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
  });
}

/** Lemniscate of Gerono (x = sin t, z = sin t cos t): two lobes that cross once in the middle. */
export function figure8Points(rng: Rng): Point2[] {
  const count = rng.int(16, 20);
  const lobe = rng.range(320, 375);
  const depth = rng.range(540, 650);
  const turn = rng.angle();
  const points: Point2[] = [];
  for (let i = 0; i < count; i++) {
    const t = ((i + rng.range(-0.15, 0.15)) / count) * Math.PI * 2;
    const wobble = 1 + rng.range(-0.07, 0.07);
    const x = Math.sin(t) * lobe * wobble;
    const z = Math.sin(t) * Math.cos(t) * depth * wobble;
    points.push({ x: x * Math.cos(turn) - z * Math.sin(turn), z: x * Math.sin(turn) + z * Math.cos(turn) });
  }
  return points;
}

/**
 * The single place where the loop crosses itself (closest pair of samples far apart along the road), or
 * null when there is no crossing, more than one, or the roads meet at too shallow an angle for a bridge.
 */
export function findCrossing(samples: readonly TrackSample[], width: number, length: number): { a: number; b: number } | null {
  const n = samples.length;
  const reach = width + 10;
  const grid = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.floor(x / reach)},${Math.floor(z / reach)}`;
  samples.forEach((s, i) => grid.set(key(s.x, s.z), [...(grid.get(key(s.x, s.z)) ?? []), i]));

  let best: { a: number; b: number; d: number } | null = null;
  const clusters: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const cx = Math.floor(s.x / reach);
    const cz = Math.floor(s.z / reach);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (j <= i) continue;
          const arc = Math.min(samples[j].s - s.s, length - (samples[j].s - s.s));
          if (arc < CROSSING_MIN_ARC) continue;
          const d = Math.hypot(samples[j].x - s.x, samples[j].z - s.z);
          if (d >= reach) continue;
          if (!clusters.some((c) => Math.abs(c - i) < 40)) clusters.push(i);
          if (!best || d < best.d) best = { a: i, b: j, d };
        }
      }
    }
  }
  if (!best || clusters.length !== 1) return null;
  const sa = samples[best.a];
  const sb = samples[best.b];
  const angle = Math.acos(Math.min(1, Math.abs(sa.tx * sb.tx + sa.tz * sb.tz)));
  return angle >= CROSSING_MIN_ANGLE ? { a: best.a, b: best.b } : null;
}

/**
 * Raise samples around `center` by `lift` with a flat top and smooth ramps. Samples at least `deckHeight`
 * above `floor` become deck (open space below).
 */
function liftSpan(samples: TrackSample[], center: number, lift: number, plateau: number, ramp: number, floor: number, deckHeight: number): void {
  for (let k = -(plateau + ramp); k <= plateau + ramp; k++) {
    const sample = samples[center + k];
    sample.y += lift * (1 - smoothstep(plateau, plateau + ramp, Math.abs(k)));
    if (sample.y - floor >= deckHeight) sample.bridge = true;
  }
}

/**
 * Turn a crossing into an overpass: the branch further from the start line rises so its deck clears the
 * other branch by OVERPASS_HEIGHT. Returns null if the ramps would not fit or the lift would be too steep.
 */
export function buildOverpass(samples: TrackSample[], crossing: { a: number; b: number }, startGuard: number, spacing: number): TrackCrossing | null {
  const n = samples.length;
  const fromStart = (i: number) => Math.min(i, n - i);
  const [upper, lower] = fromStart(crossing.a) >= fromStart(crossing.b) ? [crossing.a, crossing.b] : [crossing.b, crossing.a];
  const plateau = Math.round(OVERPASS_PLATEAU / spacing);
  const ramp = Math.round(OVERPASS_RAMP / spacing);
  if (upper - plateau - ramp < startGuard || upper + plateau + ramp > n - 5) return null;
  // The start gantry must not stand under the deck.
  if (fromStart(lower) < startGuard) return null;
  // Already high enough (rolling elevation) needs no extra lift; too much would make the ramps too steep.
  const lift = Math.max(0, samples[lower].y + OVERPASS_HEIGHT - samples[upper].y);
  if (lift > OVERPASS_MAX_LIFT) return null;
  liftSpan(samples, upper, lift, plateau, ramp, samples[lower].y, OVERPASS_DECK_LIFT);
  return { upper, lower };
}

/** Two low bridges on opposite sides of an island loop; their decks are where the water shows. */
export function buildWaterBridges(samples: TrackSample[], rng: Rng, startGuard: number, spacing: number): boolean {
  const n = samples.length;
  const plateau = Math.round(WATER_BRIDGE_PLATEAU / spacing);
  const half = plateau + Math.round(WATER_BRIDGE_RAMP / spacing);
  const lo = startGuard + half;
  const hi = n - half - 5;
  if (hi - lo < n / 3) return false;
  const first = Math.round(rng.range(lo, lo + (hi - lo) / 2 - half));
  const second = Math.round(Math.min(hi, first + (hi - lo) / 2 + rng.range(0, half)));
  if (second - first < 2 * half + 20) return false;
  for (const center of [first, second]) {
    const floor = samples[center].y;
    liftSpan(samples, center, WATER_BRIDGE_LIFT, plateau, half - plateau, floor, WATER_DECK_LIFT);
  }
  return true;
}

/** Contiguous runs of deck samples as [start, end] ranges. */
export function bridgeRanges(samples: readonly TrackSample[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  samples.forEach((s, i) => {
    if (!s.bridge) return;
    const last = ranges.at(-1);
    if (last && last.end === i - 1) last.end = i;
    else ranges.push({ start: i, end: i });
  });
  return ranges;
}
