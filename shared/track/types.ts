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
  /** Raised deck with open space below (overpass or bridge over water): no embankment, pillars instead. */
  bridge?: boolean;
}

/** loop: one level; figure8: crosses itself once on an overpass; island: islets joined by bridges over water. */
export type TrackLayout = 'loop' | 'figure8' | 'island';
/** Visual theme only; physics are identical. */
export type TrackTheme = 'meadow' | 'desert' | 'snow' | 'dusk' | 'island';

export interface TrackCrossing {
  /** Sample on the raised branch (the overpass deck). */
  upper: number;
  /** Sample on the branch passing underneath. */
  lower: number;
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
  layout: TrackLayout;
  theme: TrackTheme;
  crossing: TrackCrossing | null;
  /** Sample ranges (start <= end, never wrapping the start line) drawn as bridges. */
  bridges: { start: number; end: number }[];
}
