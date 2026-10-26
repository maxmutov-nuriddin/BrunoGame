import type { TrackDefinition } from './types.ts';
import { OVERPASS_MIN_CLEARANCE } from './layouts.ts';

export interface TrackIssue { code: string; message: string; sample?: number }

const MIN_LENGTH = 1200;
const MAX_LENGTH = 3800;
const MIN_RADIUS = 15;
const WORLD_LIMIT = 440;
const CLEARANCE_MARGIN = 10;
const MAX_GRADE = 0.12;
const MAX_RAMP_GRADE = 0.2;
const MIN_GRID_GAP = 3.5;
const LANDING_STRAIGHT = 30;

/** Returns every rule the track breaks; an empty list means it is raceable. */
export function validateTrack(track: TrackDefinition): TrackIssue[] {
  return [
    ...checkContinuity(track),
    ...checkShape(track),
    ...checkClearance(track),
    ...checkGrades(track),
    ...checkGrid(track),
    ...checkCheckpoints(track),
    ...checkPickups(track),
    ...checkRacingLine(track),
    ...checkLayout(track)
  ];
}

function checkContinuity({ samples, spacing }: TrackDefinition): TrackIssue[] {
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const gap = Math.hypot(b.x - a.x, b.z - a.z);
    if (gap > spacing * 1.6 || gap < spacing * 0.4) {
      return [{ code: 'gap', message: `sample spacing ${gap.toFixed(2)}m breaks the loop`, sample: i }];
    }
    const turn = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
    if (turn > 0.35) return [{ code: 'kink', message: `heading jumps ${turn.toFixed(2)} rad`, sample: i }];
  }
  return [];
}

function checkShape(track: TrackDefinition): TrackIssue[] {
  const issues: TrackIssue[] = [];
  if (track.length < MIN_LENGTH || track.length > MAX_LENGTH) {
    issues.push({ code: 'length', message: `lap length ${track.length.toFixed(0)}m out of range` });
  }
  track.samples.forEach((sample, i) => {
    const radius = 1 / Math.max(Math.abs(sample.curvature), 1e-9);
    if (radius < MIN_RADIUS && !issues.some((issue) => issue.code === 'radius')) {
      issues.push({ code: 'radius', message: `corner radius ${radius.toFixed(1)}m too tight`, sample: i });
    }
    const reach = Math.hypot(sample.x, sample.z) + track.width / 2 + 3;
    if (reach > WORLD_LIMIT && !issues.some((issue) => issue.code === 'bounds')) {
      issues.push({ code: 'bounds', message: `road reaches ${reach.toFixed(0)}m from the centre`, sample: i });
    }
  });
  return issues;
}

/** Non-neighbouring parts of the loop must never come close enough for the roads to touch. */
function checkClearance(track: TrackDefinition): TrackIssue[] {
  const { samples, width, length } = track;
  const n = samples.length;
  const minDistance = width + CLEARANCE_MARGIN;
  const cell = minDistance;
  const grid = new Map<string, number[]>();
  samples.forEach((sample, i) => {
    const key = `${Math.floor(sample.x / cell)},${Math.floor(sample.z / cell)}`;
    const bucket = grid.get(key) ?? [];
    bucket.push(i);
    grid.set(key, bucket);
  });

  // Two points this far apart along the road may be close in space only on purpose (never, here).
  const minArcSeparation = Math.PI * minDistance;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const cx = Math.floor(a.x / cell);
    const cz = Math.floor(a.z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (j <= i) continue;
          const arc = Math.min(Math.abs(samples[j].s - a.s), length - Math.abs(samples[j].s - a.s));
          if (arc < minArcSeparation) continue;
          const distance = Math.hypot(samples[j].x - a.x, samples[j].z - a.z);
          // An overpass: one road passes over the other with headroom to spare.
          if (Math.abs(samples[j].y - a.y) >= OVERPASS_MIN_CLEARANCE) continue;
          if (distance < minDistance) {
            return [{ code: 'overlap', message: `road comes within ${distance.toFixed(1)}m of itself`, sample: i }];
          }
        }
      }
    }
  }
  return [];
}

function checkGrades(track: TrackDefinition): TrackIssue[] {
  const { samples, spacing, ramp } = track;
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const next = samples[(i + 1) % n];
    const grade = Math.abs(next.y - samples[i].y) / spacing;
    const onRamp = ramp !== null && i >= ramp.start && i <= ramp.end;
    if (grade > (onRamp ? MAX_RAMP_GRADE : MAX_GRADE)) {
      return [{ code: 'grade', message: `slope ${(grade * 100).toFixed(0)}% too steep`, sample: i }];
    }
    if (samples[i].y < 0.05) return [{ code: 'buried', message: 'road dips below the ground', sample: i }];
  }
  if (ramp) {
    const landing = Math.round(LANDING_STRAIGHT / spacing);
    for (let j = ramp.end; j < ramp.end + landing; j++) {
      if (Math.abs(samples[j % n].curvature) > 1 / 120) {
        return [{ code: 'landing', message: 'jump lands into a corner', sample: j % n }];
      }
    }
  }
  return [];
}

function lateralOffset(track: TrackDefinition, sampleIndex: number, x: number, z: number) {
  const s = track.samples[sampleIndex];
  return { lateral: (x - s.x) * s.nx + (z - s.z) * s.nz, along: (x - s.x) * s.tx + (z - s.z) * s.tz };
}

function checkGrid(track: TrackDefinition): TrackIssue[] {
  const { grid, width, samples } = track;
  if (grid.length < 8) return [{ code: 'grid', message: 'fewer than 8 grid slots' }];
  for (const [i, slot] of grid.entries()) {
    const { lateral } = lateralOffset(track, slot.sample, slot.x, slot.z);
    if (Math.abs(lateral) > width / 2 - 1.4) return [{ code: 'grid', message: `slot ${i} hangs off the road` }];
    if (Math.abs(slot.y - 0.9 - samples[slot.sample].y) > 0.05) return [{ code: 'grid', message: `slot ${i} is not level` }];
    for (const other of grid.slice(i + 1)) {
      if (Math.hypot(other.x - slot.x, other.z - slot.z) < MIN_GRID_GAP) return [{ code: 'grid', message: 'grid slots overlap' }];
    }
  }
  return [];
}

function checkCheckpoints({ checkpoints, samples }: TrackDefinition): TrackIssue[] {
  if (checkpoints.length < 8) return [{ code: 'checkpoints', message: 'need at least 8 checkpoints' }];
  if (checkpoints[0].sample !== 0) return [{ code: 'checkpoints', message: 'checkpoint 0 must be the start line' }];
  for (let i = 1; i < checkpoints.length; i++) {
    if (checkpoints[i].sample <= checkpoints[i - 1].sample || checkpoints[i].sample >= samples.length) {
      return [{ code: 'checkpoints', message: 'checkpoints must run forward around the loop' }];
    }
  }
  return [];
}

function checkPickups(track: TrackDefinition): TrackIssue[] {
  for (const pickup of track.pickups) {
    const { lateral } = lateralOffset(track, pickup.sample, pickup.x, pickup.z);
    if (Math.abs(lateral) > track.width / 2 - 1) return [{ code: 'pickup', message: `pickup ${pickup.id} is off the road` }];
  }
  return track.pickups.length >= 6 ? [] : [{ code: 'pickup', message: 'not enough item boxes' }];
}

/** Layout promises: a figure 8 has a real overpass, an island has bridges over water. */
function checkLayout(track: TrackDefinition): TrackIssue[] {
  const { samples, crossing, layout, bridges } = track;
  if (layout === 'figure8') {
    if (!crossing) return [{ code: 'layout', message: 'figure 8 without a crossing' }];
    const headroom = samples[crossing.upper].y - samples[crossing.lower].y;
    if (headroom < OVERPASS_MIN_CLEARANCE) return [{ code: 'layout', message: `overpass headroom ${headroom.toFixed(1)}m`, sample: crossing.upper }];
  }
  if (layout === 'island' && bridges.length < 2) return [{ code: 'layout', message: 'island track needs two bridges' }];
  return [];
}

function checkRacingLine(track: TrackDefinition): TrackIssue[] {
  if (track.racingLine.length !== track.samples.length) return [{ code: 'line', message: 'racing line length mismatch' }];
  const limit = track.width / 2 - 1.5;
  const bad = track.racingLine.findIndex((point) => Math.abs(point.offset) > limit || !(point.speed > 5));
  return bad < 0 ? [] : [{ code: 'line', message: 'racing line leaves the road', sample: bad }];
}
