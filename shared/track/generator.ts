import { GENERATOR_VERSION } from '../constants.ts';
import { createRng, type Rng } from '../rng.ts';
import { buildRacingLine } from './racingLine.ts';
import { closedCatmullRom, curvatures, resampleClosed, signedArea, smoothClosed, type Point2 } from './spline.ts';
import type { Checkpoint, GridSlot, PickupSpot, TrackDefinition, TrackSample } from './types.ts';
import { validateTrack, type TrackIssue } from './validate.ts';

export const TRACK_WIDTH = 18;
export const SAMPLE_SPACING = 2;
export const BARRIER_HEIGHT = 1.4;
export const WORLD_LIMIT = 290;
export const MIN_RADIUS = 16;
export const START_STRAIGHT = 90;
const MAX_ATTEMPTS = 24;
const MAX_SMOOTH_PASSES = 60;
const CHECKPOINT_SPACING = 70;
const GRID_SLOTS = 8;
const GRID_ROW_SPACING = 8;
const GRID_FIRST_ROW = 14;
const PICKUP_ROWS = 4;
const RAMP_RISE = 1.9;
const RAMP_UP_LENGTH = 24;
const RAMP_DOWN_LENGTH = 44;
const MIN_ROAD_HEIGHT = 0.12;

export interface GeneratedTrack {
  track: TrackDefinition;
  attempts: { attempt: number; issues: TrackIssue[] }[];
}

/** Deterministic: same seed + GENERATOR_VERSION always yields the same definition. */
export function generateTrack(seed: string, name = `Circuit ${seed}`): GeneratedTrack {
  const attempts: GeneratedTrack['attempts'] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = createRng(`${seed}|track|v${GENERATOR_VERSION}|${attempt}`);
    const candidate = buildCandidate(rng, seed, name, attempt);
    if (!candidate) {
      attempts.push({ attempt, issues: [{ code: 'shape', message: 'no straight long enough for the grid' }] });
      continue;
    }
    const issues = validateTrack(candidate);
    if (issues.length === 0) return { track: candidate, attempts };
    attempts.push({ attempt, issues });
  }
  return { track: buildFallbackTrack(seed, name), attempts };
}

function controlPoints(rng: Rng): Point2[] {
  const count = rng.int(9, 13);
  const step = (Math.PI * 2) / count;
  const hairpin = rng.int(0, count - 1);
  const points: Point2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * step + rng.range(-0.22, 0.22) * step;
    const radius = i === hairpin ? rng.range(70, 105) : rng.range(165, 250);
    points.push({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius });
  }
  return points;
}

function buildCandidate(rng: Rng, seed: string, name: string, attempt: number): TrackDefinition | null {
  let points = closedCatmullRom(controlPoints(rng), 24);
  if (rng.chance(0.5)) points = points.reverse();
  points = resampleClosed(points, SAMPLE_SPACING);

  let passes = 0;
  while (passes < MAX_SMOOTH_PASSES && minRadius(points) < MIN_RADIUS) {
    points = resampleClosed(smoothClosed(points, 4, 0.5), SAMPLE_SPACING);
    passes += 4;
  }

  const start = findStartStraight(points);
  if (start < 0) return null;
  // Start line sits at the beginning of the straight so the grid fits after it.
  points = [...points.slice(start), ...points.slice(0, start)];

  const flat = buildFlatSamples(points);
  const ramp = placeRamp(flat, rng);
  applyElevation(flat, rng, ramp);
  return assemble(flat, { seed, name, attempt, source: 'generated', ramp });
}

function minRadius(points: readonly Point2[]): number {
  return curvatures(points).reduce((min, k) => Math.min(min, Math.abs(k) > 1e-9 ? 1 / Math.abs(k) : Infinity), Infinity);
}

/** Index of the window with the gentlest curvature long enough for the grid; -1 if none qualifies. */
function findStartStraight(points: readonly Point2[]): number {
  const k = curvatures(points);
  const n = points.length;
  const window = Math.round(START_STRAIGHT / SAMPLE_SPACING);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    let worst = 0;
    for (let j = 0; j < window; j++) worst = Math.max(worst, Math.abs(k[(i + j) % n]));
    if (worst < bestScore) {
      bestScore = worst;
      best = i;
    }
  }
  return bestScore < 1 / 120 ? best : -1;
}

function buildFlatSamples(points: readonly Point2[]): TrackSample[] {
  const n = points.length;
  const k = curvatures(points);
  let s = 0;
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    if (i > 0) s += Math.hypot(p.x - prev.x, p.z - prev.z);
    return { x: p.x, y: 0, z: p.z, tx, tz, nx: tz, nz: -tx, s, curvature: k[i] };
  });
}

/** Put the jump crest on a long gentle stretch away from the start straight. */
function placeRamp(samples: TrackSample[], rng: Rng): { start: number; end: number } | null {
  const n = samples.length;
  const upCount = Math.round(RAMP_UP_LENGTH / SAMPLE_SPACING);
  const downCount = Math.round(RAMP_DOWN_LENGTH / SAMPLE_SPACING);
  const landing = Math.round(40 / SAMPLE_SPACING);
  const need = upCount + downCount + landing;
  const startGuard = Math.round((START_STRAIGHT + 40) / SAMPLE_SPACING);
  const candidates: number[] = [];
  for (let i = startGuard; i < n - need - 10; i++) {
    let ok = true;
    for (let j = 0; j < need && ok; j++) ok = Math.abs(samples[i + j].curvature) < 1 / 160;
    if (ok) candidates.push(i);
  }
  if (candidates.length === 0) return null;
  const start = candidates[Math.floor(rng.next() * candidates.length)];
  return { start, end: start + upCount + downCount };
}

function applyElevation(samples: TrackSample[], rng: Rng, ramp: { start: number; end: number } | null): void {
  const n = samples.length;
  const length = samples[n - 1].s + SAMPLE_SPACING;
  const k1 = rng.int(1, 2);
  const k2 = rng.int(3, 4);
  const a1 = rng.range(1.2, 3);
  const a2 = rng.range(0.4, 1.2);
  const p1 = rng.angle();
  const p2 = rng.angle();

  const heights = samples.map((sample) => {
    const u = (sample.s / length) * Math.PI * 2;
    const base = a1 * Math.sin(k1 * u + p1) + a2 * Math.sin(k2 * u + p2);
    // Keep the grid and start line flat so cars line up level.
    const fromStart = Math.min(sample.s, length - sample.s);
    return base * smoothstep(START_STRAIGHT * 0.6, START_STRAIGHT + 40, fromStart);
  });

  if (ramp) {
    const up = Math.round(RAMP_UP_LENGTH / SAMPLE_SPACING);
    for (let i = ramp.start; i <= ramp.end; i++) {
      const local = i - ramp.start;
      const lift = local <= up ? smoothstep(0, up, local) : 1 - smoothstep(up, ramp.end - ramp.start, local);
      heights[i] += lift * RAMP_RISE;
    }
  }

  const min = Math.min(...heights);
  samples.forEach((sample, i) => {
    sample.y = heights[i] - min + MIN_ROAD_HEIGHT;
  });
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

interface AssembleOptions {
  seed: string;
  name: string;
  attempt: number;
  source: TrackDefinition['source'];
  ramp: { start: number; end: number } | null;
}

function assemble(samples: TrackSample[], options: AssembleOptions): TrackDefinition {
  const n = samples.length;
  const length = samples[n - 1].s + SAMPLE_SPACING;
  const checkpointCount = Math.max(8, Math.round(length / CHECKPOINT_SPACING));
  const checkpoints: Checkpoint[] = Array.from({ length: checkpointCount }, (_, index) => ({
    index,
    sample: Math.round((index * n) / checkpointCount) % n
  }));

  const track: TrackDefinition = {
    id: `${options.seed}@${GENERATOR_VERSION}`,
    name: options.name,
    seed: options.seed,
    generatorVersion: GENERATOR_VERSION,
    source: options.source,
    attempt: options.attempt,
    width: TRACK_WIDTH,
    length,
    spacing: SAMPLE_SPACING,
    samples,
    checkpoints,
    grid: buildGrid(samples),
    pickups: [],
    racingLine: [],
    ramp: options.ramp,
    hairpins: findHairpins(samples),
    barrierHeight: BARRIER_HEIGHT
  };
  track.pickups = placePickups(track);
  track.racingLine = buildRacingLine(track);
  return track;
}

/** Two staggered columns, pole furthest up the road; every slot sits on the flat start straight. */
function buildGrid(samples: TrackSample[]): GridSlot[] {
  return Array.from({ length: GRID_SLOTS }, (_, slot) => {
    const row = Math.floor(slot / 2);
    const column = slot % 2 === 0 ? 1 : -1;
    const distance = GRID_FIRST_ROW + (GRID_SLOTS / 2 - 1 - row) * GRID_ROW_SPACING + (column < 0 ? 3 : 0);
    const index = Math.round(distance / SAMPLE_SPACING);
    const s = samples[index];
    const lateral = column * 4;
    return {
      x: s.x + s.nx * lateral,
      y: s.y + 0.9,
      z: s.z + s.nz * lateral,
      yaw: Math.atan2(-s.tx, -s.tz),
      sample: index
    };
  });
}

function findHairpins(samples: TrackSample[]): number[] {
  const n = samples.length;
  const out: number[] = [];
  samples.forEach((sample, i) => {
    const k = Math.abs(sample.curvature);
    const isPeak = k > 1 / 32 && k >= Math.abs(samples[(i - 1 + n) % n].curvature) && k >= Math.abs(samples[(i + 1) % n].curvature);
    if (isPeak && !out.some((other) => Math.abs(other - i) < 20)) out.push(i);
  });
  return out;
}

/** Rows of three item boxes spread evenly, clear of the grid, the ramp and the tightest corners. */
function placePickups(track: TrackDefinition): PickupSpot[] {
  const { samples, ramp } = track;
  const n = samples.length;
  const pickups: PickupSpot[] = [];
  const startGuard = Math.round((START_STRAIGHT + 30) / SAMPLE_SPACING);
  for (let row = 0; row < PICKUP_ROWS; row++) {
    let index = Math.round(startGuard + ((n - startGuard - 20) * (row + 0.5)) / PICKUP_ROWS);
    for (let tries = 0; tries < 40; tries++) {
      const inRamp = ramp !== null && index > ramp.start - 15 && index < ramp.end + 15;
      const tight = Math.abs(samples[index % n].curvature) > 1 / 45;
      if (!inRamp && !tight) break;
      index = (index + 3) % n;
    }
    const s = samples[index % n];
    [-1, 0, 1].forEach((lane) => {
      const lateral = lane * (track.width / 3.2);
      pickups.push({ id: pickups.length, x: s.x + s.nx * lateral, y: s.y + 1, z: s.z + s.nz * lateral, sample: index % n });
    });
  }
  return pickups;
}

/** Hand-placed circuit with one hairpin; validated in tests and used when generation keeps failing. */
const FALLBACK_POINTS: Point2[] = [
  { x: 0, z: 230 }, { x: 150, z: 200 }, { x: 230, z: 80 }, { x: 230, z: -80 }, { x: 160, z: -200 },
  { x: 40, z: -230 }, { x: -20, z: -120 }, { x: -90, z: -110 }, { x: -200, z: -170 }, { x: -240, z: -30 },
  { x: -200, z: 130 }, { x: -110, z: 215 }
];

export function buildFallbackTrack(seed: string, name: string): TrackDefinition {
  let points = resampleClosed(closedCatmullRom(FALLBACK_POINTS, 24), SAMPLE_SPACING);
  points = resampleClosed(smoothClosed(points, 12, 0.5), SAMPLE_SPACING);
  if (signedArea(points) < 0) points = points.reverse();
  const start = Math.max(0, findStartStraight(points));
  points = [...points.slice(start), ...points.slice(0, start)];
  const flat = buildFlatSamples(points);
  const ramp = placeRamp(flat, createRng('fallback-ramp'));
  applyElevation(flat, createRng(`fallback|${GENERATOR_VERSION}`), ramp);
  return assemble(flat, { seed, name, attempt: -1, source: 'fallback', ramp });
}
