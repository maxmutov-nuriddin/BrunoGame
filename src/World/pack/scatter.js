import * as THREE from 'three';
import { enableShadows } from './instancing.js';
import { addStaticBox } from './statics.js';

const ALL_KEEP_OUT = ['road', 'plazas', 'jumps', 'challenges', 'spawn'];
const SCENERY_KEEP_OUT = ['road', 'plazas', 'jumps', 'challenges', 'spawn'];

const SCENERY_COUNT = 120;
const BUILDING_COUNT = 16;
const BILLBOARD_COUNT = 3;
const TURBINE_COUNT = 2;
const LAMP_SPACING = 36;
const LAMP_OFFSET_X = 31;
const LAMP_KEEP_PROBABILITY = 0.85;

const SCENERY_WEIGHTS = [
  ['Tree_Round', 0.26],
  ['Tree_Pine', 0.26],
  ['Tree_Tall', 0.12],
  ['Bush', 0.12],
  ['Rock_Small', 0.07],
  ['Rock_Big', 0.04],
  ['FlowerPatch', 0.09],
  ['WoodFence_Segment', 0.04]
];

const TRUNK_ONLY = new Set(['Tree_Round', 'Tree_Pine', 'Tree_Tall']);
const NO_COLLIDER = new Set(['Bush', 'FlowerPatch']);
const TRUNK_WIDTH = 0.9;
const TURBINE_COLUMN = new THREE.Vector3(2, 0, 2.4);

function placeInstance(ctx, template, { x, z, yaw = 0, scale = 1 }) {
  const object = template.object.clone(true);
  object.position.set(x, 0, z);
  object.rotation.y = yaw;
  object.scale.setScalar(scale);
  enableShadows(object);
  ctx.group.add(object);
  return object;
}

function addInstanceCollider(ctx, name, template, { x, z, yaw = 0, scale = 1 }) {
  if (NO_COLLIDER.has(name)) return;

  const size = template.size.clone().multiplyScalar(scale);
  const center = template.center.clone().multiplyScalar(scale);

  if (TRUNK_ONLY.has(name)) {
    size.x = TRUNK_WIDTH * scale;
    size.z = TRUNK_WIDTH * scale;
    center.x = 0;
    center.z = 0;
  }

  if (name === 'WindTurbine') {
    size.x = TURBINE_COLUMN.x;
    size.z = TURBINE_COLUMN.z;
    center.x = 0;
    center.z = 0;
  }

  addStaticBox(ctx, { position: new THREE.Vector3(x, 0, z), yaw, size, center });
}

function spawn(ctx, templates, name, transform) {
  const template = templates.get(name);
  if (!template) return;
  placeInstance(ctx, template, transform);
  addInstanceCollider(ctx, name, template, transform);
}

const footprint = (template, scale = 1) => Math.max(template.size.x, template.size.z) * scale * 0.6 + 1;

export function addScenery(ctx, templates) {
  const { rng, placer } = ctx;

  for (let i = 0; i < SCENERY_COUNT; i++) {
    const name = rng.weighted(SCENERY_WEIGHTS);
    const template = templates.get(name);
    if (!template) continue;

    const scale = rng.range(0.85, 1.25);
    const spot = placer.tryPlace({
      minRadius: 36,
      size: footprint(template, scale),
      avoid: SCENERY_KEEP_OUT
    });
    if (!spot) continue;

    const yaw = rng.angle();

    if (name !== 'WoodFence_Segment') {
      spawn(ctx, templates, name, { x: spot.x, z: spot.z, yaw, scale });
      continue;
    }

    const length = Math.round(rng.range(3, 5));
    const stepX = Math.cos(yaw) * template.size.x;
    const stepZ = -Math.sin(yaw) * template.size.x;
    for (let segment = 0; segment < length; segment++) {
      spawn(ctx, templates, name, { x: spot.x + stepX * segment, z: spot.z + stepZ * segment, yaw });
    }
  }
}

function addBuildings(ctx, templates) {
  const { rng, placer } = ctx;
  const names = ['Building_1', 'Building_2', 'Building_3', 'Building_4', 'Building_5'];

  for (let i = 0; i < BUILDING_COUNT; i++) {
    const name = rng.pick(names);
    const template = templates.get(name);
    if (!template) continue;

    const spot = placer.tryPlace({
      minRadius: 130,
      maxRadius: 285,
      size: footprint(template) + 3,
      avoid: ALL_KEEP_OUT
    });
    if (!spot) continue;

    const yaw = Math.atan2(-spot.x, -spot.z) + rng.range(-0.35, 0.35);
    spawn(ctx, templates, name, { x: spot.x, z: spot.z, yaw });
  }
}

function addStreetLamps(ctx, templates) {
  const { rng } = ctx;
  for (let z = -280; z <= 280; z += LAMP_SPACING) {
    const blocked = ctx.keepOutRanges.some(({ minZ, maxZ }) => z > minZ && z < maxZ);
    if (blocked || !rng.chance(LAMP_KEEP_PROBABILITY)) continue;

    spawn(ctx, templates, 'StreetLamp', { x: -LAMP_OFFSET_X, z, yaw: Math.PI * 0.5 });
    spawn(ctx, templates, 'StreetLamp', { x: LAMP_OFFSET_X, z, yaw: -Math.PI * 0.5 });
  }
}

function addRoadsideBillboards(ctx, templates) {
  const { rng, placer } = ctx;

  for (let i = 0; i < BILLBOARD_COUNT; i++) {
    const side = rng.chance(0.5) ? -1 : 1;
    const x = side * rng.range(38, 62);
    const z = rng.range(-230, 230);
    const blocked = ctx.keepOutRanges.some(({ minZ, maxZ }) => z > minZ - 8 && z < maxZ + 8);
    if (blocked) continue;

    placer.placed.push({ x, z, size: 6 });
    spawn(ctx, templates, 'Billboard', { x, z, yaw: Math.atan2(-x, 0) });
  }
}

function addFarLandmarks(ctx, templates) {
  const { rng, placer } = ctx;
  const entries = [...Array(TURBINE_COUNT).fill('WindTurbine'), 'WaterTower'];

  entries.forEach((name) => {
    const template = templates.get(name);
    if (!template) return;

    const spot = placer.tryPlace({
      minRadius: 170,
      maxRadius: 285,
      size: footprint(template) + 2,
      avoid: ALL_KEEP_OUT
    });
    if (!spot) return;

    spawn(ctx, templates, name, { x: spot.x, z: spot.z, yaw: Math.atan2(-spot.x, -spot.z) + rng.range(-0.3, 0.3) });
  });
}

export function addLandmarks(ctx, templates) {
  addBuildings(ctx, templates);
  addStreetLamps(ctx, templates);
  addRoadsideBillboards(ctx, templates);
  addFarLandmarks(ctx, templates);
}
