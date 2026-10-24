export interface Point2 { x: number; z: number }

/** Closed centripetal Catmull-Rom through `points`, densely sampled. */
export function closedCatmullRom(points: readonly Point2[], subdivisions = 32): Point2[] {
  const n = points.length;
  const out: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.hypot(p1.x - p0.x, p1.z - p0.z)) || t0 + 1e-6;
    const t2 = t1 + Math.sqrt(Math.hypot(p2.x - p1.x, p2.z - p1.z)) || t1 + 1e-6;
    const t3 = t2 + Math.sqrt(Math.hypot(p3.x - p2.x, p3.z - p2.z)) || t2 + 1e-6;
    for (let k = 0; k < subdivisions; k++) {
      const t = t1 + ((t2 - t1) * k) / subdivisions;
      out.push(barryGoldman(p0, p1, p2, p3, t0, t1, t2, t3, t));
    }
  }
  return out;
}

function lerpPoint(a: Point2, b: Point2, ta: number, tb: number, t: number): Point2 {
  const span = tb - ta || 1e-6;
  const wa = (tb - t) / span;
  const wb = (t - ta) / span;
  return { x: a.x * wa + b.x * wb, z: a.z * wa + b.z * wb };
}

function barryGoldman(p0: Point2, p1: Point2, p2: Point2, p3: Point2, t0: number, t1: number, t2: number, t3: number, t: number): Point2 {
  const a1 = lerpPoint(p0, p1, t0, t1, t);
  const a2 = lerpPoint(p1, p2, t1, t2, t);
  const a3 = lerpPoint(p2, p3, t2, t3, t);
  const b1 = lerpPoint(a1, a2, t0, t2, t);
  const b2 = lerpPoint(a2, a3, t1, t3, t);
  return lerpPoint(b1, b2, t1, t2, t);
}

/** Resample a closed polyline at uniform arc-length spacing. */
export function resampleClosed(points: readonly Point2[], spacing: number): Point2[] {
  const n = points.length;
  const cumulative = [0];
  for (let i = 1; i <= n; i++) {
    const a = points[i - 1];
    const b = points[i % n];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cumulative[n];
  const count = Math.max(8, Math.round(total / spacing));
  const step = total / count;
  const out: Point2[] = [];
  let segment = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (cumulative[segment + 1] < target) segment++;
    const a = points[segment];
    const b = points[(segment + 1) % n];
    const len = cumulative[segment + 1] - cumulative[segment] || 1e-6;
    const t = (target - cumulative[segment]) / len;
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

/** Laplacian smoothing on a closed polyline. */
export function smoothClosed(points: readonly Point2[], passes: number, strength = 0.5): Point2[] {
  let current = points.map((p) => ({ ...p }));
  const n = current.length;
  for (let pass = 0; pass < passes; pass++) {
    current = current.map((p, i) => {
      const prev = current[(i - 1 + n) % n];
      const next = current[(i + 1) % n];
      return {
        x: p.x + strength * ((prev.x + next.x) * 0.5 - p.x),
        z: p.z + strength * ((prev.z + next.z) * 0.5 - p.z)
      };
    });
  }
  return current;
}

/** Signed curvature at each point of a closed polyline (positive = left turn). */
export function curvatures(points: readonly Point2[]): number[] {
  const n = points.length;
  return points.map((p, i) => {
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const h1x = p.x - a.x, h1z = p.z - a.z;
    const h2x = b.x - p.x, h2z = b.z - p.z;
    const l1 = Math.hypot(h1x, h1z), l2 = Math.hypot(h2x, h2z);
    if (l1 < 1e-9 || l2 < 1e-9) return 0;
    // Heading change, sign from the cross product; left turn when travelling on the x/z plane with +Y up.
    const cross = h1z * h2x - h1x * h2z;
    const dot = h1x * h2x + h1z * h2z;
    return Math.atan2(cross, dot) / ((l1 + l2) * 0.5);
  });
}

export function signedArea(points: readonly Point2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area * 0.5;
}
