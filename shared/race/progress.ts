import type { Checkpoint, TrackDefinition } from '../track/types.ts';

/** +1 forward crossing, -1 backward crossing, 0 none. Only counts inside the road width. */
export function gateCrossing(track: TrackDefinition, checkpoint: Checkpoint, ax: number, az: number, bx: number, bz: number): number {
  const s = track.samples[checkpoint.sample];
  const da = (ax - s.x) * s.tx + (az - s.z) * s.tz;
  const db = (bx - s.x) * s.tx + (bz - s.z) * s.tz;
  const forward = da < 0 && db >= 0;
  const backward = da >= 0 && db < 0;
  if (!forward && !backward) return 0;
  const t = da / (da - db);
  const px = ax + (bx - ax) * t;
  const pz = az + (bz - az) * t;
  const lateral = (px - s.x) * s.nx + (pz - s.z) * s.nz;
  if (Math.abs(lateral) > track.width / 2 + 2) return 0;
  return forward ? 1 : -1;
}

/** Monotonic race progress in metres: completed laps + checkpoint + distance along the current sector. */
export function raceProgress(track: TrackDefinition, lapsCompleted: number, lastCheckpoint: number, nextCheckpoint: number, arc: number): number {
  const { samples, checkpoints, length } = track;
  const fromS = samples[checkpoints[lastCheckpoint].sample].s;
  let toS = samples[checkpoints[nextCheckpoint].sample].s;
  if (toS <= fromS) toS += length;
  let since = arc - fromS;
  if (since < -length / 2) since += length;
  if (since > length / 2) since -= length;
  const sector = toS - fromS;
  return lapsCompleted * length + fromS + Math.max(-20, Math.min(since, sector + 5));
}
