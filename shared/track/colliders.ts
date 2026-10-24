import type PhysicsWorld from '../physics/PhysicsWorld.ts';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { TrackDefinition } from './types.ts';

/** Invisible barrier height above the road: tall enough that the jump crest never clears it. */
export const BARRIER_COLLIDER_HEIGHT = 5;
export const BARRIER_THICKNESS = 1.2;
/** Road surface extends a little under the barriers so wheels never fall into a seam. */
const ROAD_EDGE_OVERLAP = 1.4;
const ROAD_FRICTION = 1.9;
const BARRIER_FRICTION = 0.35;

/** Road ribbon, both barriers and the ground below, all built from one track definition. */
export function buildTrackColliders(physics: PhysicsWorld, track: TrackDefinition): RigidBody[] {
  const bodies: RigidBody[] = [];
  const half = track.width / 2;
  bodies.push(
    physics.createTrimesh({ position: { x: 0, y: 0, z: 0 }, ...roadMesh(track, half + ROAD_EDGE_OVERLAP), friction: ROAD_FRICTION }).rigidBody
  );
  for (const side of [1, -1]) {
    bodies.push(
      physics.createTrimesh({ position: { x: 0, y: 0, z: 0 }, ...barrierMesh(track, side, half), friction: BARRIER_FRICTION, restitution: 0.1 }).rigidBody
    );
  }
  bodies.push(
    physics.createBox({ position: { x: 0, y: -0.5, z: 0 }, size: { x: 800, y: 1, z: 800 }, friction: 1.6 }).rigidBody
  );
  return bodies;
}

function roadMesh(track: TrackDefinition, halfWidth: number) {
  const { samples } = track;
  const n = samples.length;
  const vertices = new Float32Array(n * 2 * 3);
  samples.forEach((s, i) => {
    vertices.set([s.x + s.nx * halfWidth, s.y, s.z + s.nz * halfWidth], i * 6);
    vertices.set([s.x - s.nx * halfWidth, s.y, s.z - s.nz * halfWidth], i * 6 + 3);
  });
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const l0 = i * 2, r0 = i * 2 + 1;
    const l1 = ((i + 1) % n) * 2, r1 = ((i + 1) % n) * 2 + 1;
    indices.set([l0, r0, l1, r0, r1, l1], i * 6);
  }
  return { vertices, indices };
}

/** A closed wall strip (inner face, top, outer face) along one side of the road. */
function barrierMesh(track: TrackDefinition, side: number, halfWidth: number) {
  const { samples } = track;
  const n = samples.length;
  const inner = halfWidth + 0.4;
  const outer = inner + BARRIER_THICKNESS;
  // Four vertices per sample: inner-bottom, inner-top, outer-top, outer-bottom.
  const vertices = new Float32Array(n * 4 * 3);
  samples.forEach((s, i) => {
    const ix = s.x + s.nx * inner * side, iz = s.z + s.nz * inner * side;
    const ox = s.x + s.nx * outer * side, oz = s.z + s.nz * outer * side;
    const bottom = Math.min(s.y - 1, -0.2);
    const top = s.y + BARRIER_COLLIDER_HEIGHT;
    vertices.set([ix, bottom, iz, ix, top, iz, ox, top, oz, ox, bottom, oz], i * 12);
  });
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = ((i + 1) % n) * 4;
    for (let face = 0; face < 3; face++) {
      const p0 = a + face, p1 = a + face + 1, q0 = b + face, q1 = b + face + 1;
      indices.push(p0, q0, p1, p1, q0, q1);
    }
  }
  return { vertices, indices: new Uint32Array(indices) };
}
