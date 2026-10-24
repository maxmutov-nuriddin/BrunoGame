import * as THREE from 'three';
import { createRng } from '../../shared/rng.ts';
import { worldResourceName } from '../worldPack.js';
import { extractTemplates, instanceTile, pushBackLayers } from './instancing.js';

const TILE_OFFSETS = [-240, -80, 80, 240];
const CLEARANCE = 9;
const CELL = 24;
const SCENERY_ATTEMPTS = 420;
const BUILDING_ATTEMPTS = 60;
const LAMP_SPACING_SAMPLES = 22;
const WORLD_RADIUS = 300;
const NATURE = [
  ['Tree_Round', 0.27],
  ['Tree_Pine', 0.27],
  ['Tree_Tall', 0.14],
  ['Bush', 0.14],
  ['Rock_Small', 0.08],
  ['Rock_Big', 0.04],
  ['FlowerPatch', 0.06]
];
const BUILDINGS = ['Building_1', 'Building_2', 'Building_3', 'Building_4', 'Building_5'];

/** Everything outside the barriers, placed from the track seed so every client sees the same world. */
export default class RaceScenery {
  constructor(resources, track) {
    this.group = new THREE.Group();
    this.group.name = 'RaceScenery';
    this.track = track;
    this.scene = (key) => resources.items[worldResourceName(key)].scene;
    this.buildIndex();

    this.addGround();
    this.addBorder();
    const placements = new Map();
    const rng = createRng(`${track.seed}|scenery|${track.generatorVersion}`);
    this.scatter(rng, extractTemplates(this.scene('scenery')), extractTemplates(this.scene('landmarks')), placements);
    for (const { template, matrices } of placements.values()) {
      this.group.add(instanceTile(template.object, matrices, { castShadow: true, receiveShadow: true }));
    }
  }

  buildIndex() {
    this.cells = new Map();
    for (const s of this.track.samples) {
      const key = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`;
      const bucket = this.cells.get(key) ?? [];
      bucket.push(s);
      this.cells.set(key, bucket);
    }
  }

  distanceToTrack(x, z) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = Infinity;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (const s of this.cells.get(`${cx + dx},${cz + dz}`) ?? []) best = Math.min(best, Math.hypot(s.x - x, s.z - z));
      }
    }
    return best;
  }

  addGround() {
    const matrices = TILE_OFFSETS.flatMap((x) => TILE_OFFSETS.map((z) => new THREE.Matrix4().makeTranslation(x, -0.06, z)));
    this.group.add(instanceTile(pushBackLayers(this.scene('grass'), /^Soil$/), matrices));
  }

  addBorder() {
    const border = this.scene('border').clone(true);
    border.getObjectByName('InnerFloor')?.removeFromParent();
    border.traverse((node) => {
      if (node.isMesh) node.receiveShadow = true;
    });
    this.group.add(border);
  }

  place(placements, template, x, z, yaw, scale = 1) {
    const key = template.object.uuid;
    const entry = placements.get(key) ?? { template, matrices: [] };
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(scale, scale, scale)
    );
    entry.matrices.push(matrix);
    placements.set(key, entry);
  }

  scatter(rng, nature, landmarks, placements) {
    const half = this.track.width / 2;
    const taken = [];
    const free = (x, z, radius) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + radius);

    for (let i = 0; i < BUILDING_ATTEMPTS; i++) {
      const template = landmarks.get(rng.pick(BUILDINGS));
      if (!template) continue;
      const angle = rng.angle();
      const radius = rng.range(150, WORLD_RADIUS - 20);
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const size = Math.max(template.size.x, template.size.z) * 0.7;
      if (this.distanceToTrack(x, z) < half + CLEARANCE + size || !free(x, z, size)) continue;
      taken.push({ x, z, r: size });
      this.place(placements, template, x, z, Math.atan2(-x, -z) + rng.range(-0.3, 0.3));
    }

    for (let i = 0; i < SCENERY_ATTEMPTS; i++) {
      const template = nature.get(rng.weighted(NATURE));
      if (!template) continue;
      const angle = rng.angle();
      const radius = Math.sqrt(rng.range(0, 1)) * (WORLD_RADIUS - 10);
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const scale = rng.range(0.85, 1.35);
      const size = Math.max(template.size.x, template.size.z) * 0.5 * scale;
      if (this.distanceToTrack(x, z) < half + CLEARANCE + size || !free(x, z, size)) continue;
      taken.push({ x, z, r: size });
      this.place(placements, template, x, z, rng.angle(), scale);
    }

    const lamp = landmarks.get('StreetLamp');
    if (lamp) {
      const { samples } = this.track;
      for (let i = 0; i < samples.length; i += LAMP_SPACING_SAMPLES) {
        const s = samples[i];
        const side = Math.floor(i / LAMP_SPACING_SAMPLES) % 2 === 0 ? 1 : -1;
        const lateral = side * (half + 3.4);
        const x = s.x + s.nx * lateral;
        const z = s.z + s.nz * lateral;
        if (this.distanceToTrack(x, z) < half + 2.5) continue;
        this.place(placements, lamp, x, z, Math.atan2(-s.nx * side, -s.nz * side));
      }
    }

    for (const name of ['WindTurbine', 'WindTurbine', 'WaterTower']) {
      const template = landmarks.get(name);
      if (!template) continue;
      for (let attempt = 0; attempt < 20; attempt++) {
        const angle = rng.angle();
        const radius = rng.range(200, WORLD_RADIUS - 15);
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        if (this.distanceToTrack(x, z) < half + 20 || !free(x, z, 8)) continue;
        taken.push({ x, z, r: 8 });
        this.place(placements, template, x, z, rng.angle());
        break;
      }
    }
  }
}
