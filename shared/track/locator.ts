import type { TrackDefinition } from './types.ts';

export interface TrackLocation {
  index: number;
  /** Signed distance from the centre line along the left normal. */
  lateral: number;
  /** Distance along the tangent from the sample. */
  along: number;
  /** Arc length of the projected point within the lap (0..length). */
  s: number;
  distance: number;
}

const LOCAL_WINDOW = 40;

/** Nearest-sample queries with a temporal hint so per-tick lookups stay O(window). */
export class TrackLocator {
  readonly track: TrackDefinition;
  private readonly n: number;

  constructor(track: TrackDefinition) {
    this.track = track;
    this.n = track.samples.length;
  }

  locate(x: number, z: number, hint = -1): TrackLocation {
    const { samples } = this.track;
    let best = 0;
    let bestDistance = Infinity;
    const scan = (i: number) => {
      const s = samples[i];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    };
    if (hint >= 0) {
      for (let k = -LOCAL_WINDOW; k <= LOCAL_WINDOW; k++) scan((hint + k + this.n) % this.n);
    }
    // Fall back to a full scan when there is no hint or the hint is clearly stale.
    if (hint < 0 || bestDistance > (this.track.width * 1.5) ** 2) {
      for (let i = 0; i < this.n; i++) scan(i);
    }
    const s = samples[best];
    const dx = x - s.x;
    const dz = z - s.z;
    const along = dx * s.tx + dz * s.tz;
    const lateral = dx * s.nx + dz * s.nz;
    const arc = (s.s + along + this.track.length) % this.track.length;
    return { index: best, lateral, along, s: arc, distance: Math.sqrt(bestDistance) };
  }

  sampleAt(index: number) {
    return this.track.samples[((index % this.n) + this.n) % this.n];
  }

  /** Point on the road `ahead` metres past `index`, shifted `lateral` metres to the left. */
  pointAhead(index: number, ahead: number, lateral = 0) {
    const steps = Math.round(ahead / this.track.spacing);
    const s = this.sampleAt(index + steps);
    return { x: s.x + s.nx * lateral, y: s.y, z: s.z + s.nz * lateral, sample: s, index: (index + steps + this.n) % this.n };
  }
}
