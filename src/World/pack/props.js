import * as THREE from 'three';
import { enableShadows } from './instancing.js';
import { yawQuaternion } from './statics.js';

const PROP_KEEP_OUT = ['plazas', 'jumps', 'challenges', 'spawn'];
const SETTLE_GAP = 0.01;

const PROP_SPECS = Object.freeze({
  crate: { shape: 'box', size: [1.2, 1.2, 1.2], density: 0.22, friction: 0.9 },
  barrel: { shape: 'cylinder', radius: 0.39, height: 1.1, density: 0.18, friction: 0.9 },
  pin: { shape: 'cylinder', radius: 0.2, height: 1, density: 0.35, friction: 0.8 },
  brick: { shape: 'box', size: [1, 0.5, 0.5], density: 0.3, friction: 1.0 },
  tire: { shape: 'cylinder', radius: 0.45, height: 0.25, density: 0.4, friction: 1.1 },
  cone: { shape: 'cylinder', radius: 0.27, height: 0.7, density: 0.3, friction: 0.9 }
});

const CLUSTERS = Object.freeze({
  pinPyramid: { prop: 'pin', copies: [1, 2], layout: pinPyramidLayout },
  crateStack: { prop: 'crate', copies: [1, 2], layout: crateStackLayout },
  barrelRing: { prop: 'barrel', copies: [1, 2], layout: barrelRingLayout },
  brickWall: { prop: 'brick', copies: [1, 1], layout: brickWallLayout },
  tireTower: { prop: 'tire', copies: [1, 2], layout: tireTowerLayout },
  coneLine: { prop: 'cone', copies: [1, 2], layout: coneLineLayout }
});

function pinPyramidLayout() {
  const rows = 4;
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: row + 1 }, (_, col) => [(col - row / 2) * 0.55, 0.5, row * 0.5])
  ).flat();
}

function crateStackLayout() {
  return [3, 2, 1].flatMap((count, layer) =>
    Array.from({ length: count }, (_, i) => [(i - (count - 1) / 2) * 1.3, 0.6 + layer * 1.22, 0])
  );
}

function barrelRingLayout() {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2;
    return [Math.cos(angle) * 1.1, 0.55, Math.sin(angle) * 1.1];
  });
}

function brickWallLayout() {
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => [(col - 2) * 1.02 + (row % 2) * 0.5, 0.25 + row * 0.5, 0])
  ).flat();
}

function tireTowerLayout() {
  return Array.from({ length: 6 }, (_, i) => [(i % 2) * 0.04, 0.125 + i * 0.25, 0]);
}

function coneLineLayout() {
  return Array.from({ length: 8 }, (_, i) => [(i - 3.5) * 2.2, 0.35, 0]);
}

function createBody(physics, spec, position, yaw) {
  if (spec.shape === 'box') {
    return physics.createBox({
      position,
      size: new THREE.Vector3(...spec.size),
      rotation: yawQuaternion(yaw),
      type: 'dynamic',
      density: spec.density,
      friction: spec.friction,
      restitution: 0.12
    }).rigidBody;
  }

  return physics.createCylinder({
    position,
    radius: spec.radius,
    height: spec.height,
    type: 'dynamic',
    density: spec.density,
    friction: spec.friction,
    restitution: 0.12
  }).rigidBody;
}

function spawnProp(ctx, key, localOffset, origin, yaw) {
  const spec = PROP_SPECS[key];
  const scene = ctx.propScenes[key];
  const [lx, ly, lz] = localOffset;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const position = new THREE.Vector3(
    origin.x + lx * cos + lz * sin,
    ly + SETTLE_GAP,
    origin.z - lx * sin + lz * cos
  );

  const object = scene.clone(true);
  object.position.copy(position);
  object.quaternion.copy(yawQuaternion(yaw));
  enableShadows(object);
  ctx.group.add(object);

  const body = createBody(ctx.physics, spec, position, yaw);
  ctx.bodies.push(body);
  ctx.dynamics.push({ body, object });
}

export function addKnockableProps(ctx) {
  const { rng, placer } = ctx;

  Object.values(CLUSTERS).forEach(({ prop, copies, layout }) => {
    const count = Math.round(rng.range(copies[0], copies[1]));

    for (let i = 0; i < count; i++) {
      const spot = placer.tryPlace({ minRadius: 20, maxRadius: 270, size: 5, avoid: PROP_KEEP_OUT });
      if (!spot) continue;

      const yaw = rng.angle();
      layout().forEach((offset) => spawnProp(ctx, prop, offset, spot, yaw));
    }
  });
}

export function syncDynamics(dynamics) {
  dynamics.forEach(({ body, object }) => {
    if (body.isSleeping()) return;
    const t = body.translation();
    const r = body.rotation();
    object.position.set(t.x, t.y, t.z);
    object.quaternion.set(r.x, r.y, r.z, r.w);
  });
}
