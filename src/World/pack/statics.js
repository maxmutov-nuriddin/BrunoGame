import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();

export const yawQuaternion = (yaw) => new THREE.Quaternion().setFromAxisAngle(UP, yaw);

/** Fixed box collider; `center` is the box centre in the body's local (yawed) frame. */
export function addStaticBox(ctx, { position, yaw = 0, size, center = ORIGIN, friction = 1.4 }) {
  const { rigidBody } = ctx.physics.createBox({
    position,
    size,
    rotation: yawQuaternion(yaw),
    colliderOffset: center,
    type: 'fixed',
    friction
  });
  ctx.bodies.push(rigidBody);
  return rigidBody;
}

/** Convex hull collider from the world-space vertices of `meshes`, closed down to the ground. */
export function addGroundedHull(ctx, meshes, { friction = 2.2 } = {}) {
  const points = [];
  const vertex = new THREE.Vector3();

  meshes.forEach((mesh) => {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      points.push(vertex.x, vertex.y, vertex.z, vertex.x, 0, vertex.z);
    }
  });

  const { rigidBody } = ctx.physics.createConvexHull({
    position: ORIGIN,
    points,
    type: 'fixed',
    friction,
    contactSkin: 0.02
  });
  ctx.bodies.push(rigidBody);
  return rigidBody;
}
