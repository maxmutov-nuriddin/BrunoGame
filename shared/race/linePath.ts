import type { TrackDefinition } from '../track/types.ts';

/** Racing line resolved into world points with tangents and curvature, computed once per track. */
export interface LinePath {
  x: Float64Array;
  z: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  curvature: Float64Array;
}

const cache = new WeakMap<TrackDefinition, LinePath>();

export function linePath(track: TrackDefinition): LinePath {
  const cached = cache.get(track);
  if (cached) return cached;
  const n = track.samples.length;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  track.samples.forEach((s, i) => {
    const offset = track.racingLine[i].offset;
    x[i] = s.x + s.nx * offset;
    z[i] = s.z + s.nz * offset;
  });
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  const curvature = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 2 + n) % n;
    const b = (i + 2) % n;
    const dx = x[b] - x[a];
    const dz = z[b] - z[a];
    const len = Math.hypot(dx, dz) || 1;
    tx[i] = dx / len;
    tz[i] = dz / len;
    curvature[i] = circleCurvature(x[a], z[a], x[i], z[i], x[b], z[b]);
  }
  const path = { x, z, tx, tz, curvature };
  cache.set(track, path);
  return path;
}

/** Signed curvature through three points; positive is a left turn (same convention as the track). */
function circleCurvature(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ab = Math.hypot(bx - ax, bz - az);
  const bc = Math.hypot(cx - bx, cz - bz);
  const ca = Math.hypot(ax - cx, az - cz);
  const cross = (bz - az) * (cx - bx) - (bx - ax) * (cz - bz);
  const denominator = ab * bc * ca;
  return denominator < 1e-9 ? 0 : (2 * cross) / denominator;
}
