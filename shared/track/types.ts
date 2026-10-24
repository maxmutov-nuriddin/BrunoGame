export interface TrackSample {
  x: number;
  y: number;
  z: number;
  /** Unit horizontal tangent (direction of travel). */
  tx: number;
  tz: number;
  /** Unit horizontal left normal: (tz, -tx). */
  nx: number;
  nz: number;
  /** Arc length from the start line (m). */
  s: number;
  /** Signed curvature (1/m), positive = turning left. */
  curvature: number;
}

export interface Checkpoint {
  index: number;
  sample: number;
}

export interface GridSlot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sample: number;
}

export interface PickupSpot {
  id: number;
  x: number;
  y: number;
  z: number;
  sample: number;
}

export interface RacingLinePoint {
  /** Lateral offset from the centre line along the left normal (m). */
  offset: number;
  /** Target speed for a perfect driver (m/s). */
  speed: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  seed: string;
  generatorVersion: number;
  source: 'generated' | 'fallback';
  attempt: number;
  width: number;
  length: number;
  spacing: number;
  samples: TrackSample[];
  checkpoints: Checkpoint[];
  grid: GridSlot[];
  pickups: PickupSpot[];
  racingLine: RacingLinePoint[];
  /** Sample range of the jump crest, if any. */
  ramp: { start: number; end: number } | null;
  hairpins: number[];
  barrierHeight: number;
}
