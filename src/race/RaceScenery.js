import * as THREE from 'three';
import { createRng } from '../../shared/rng.ts';
import { worldResourceName } from '../worldPack.js';
import { extractTemplates, instanceTile, pushBackLayers } from './instancing.js';
import { groundTexture } from './textures.js';

const TILE_SIZE = 160;
const CLEARANCE = 9;
const CELL = 24;
/** Scenery attempts per square metre of world (about 420 on a 300 m world, as before). */
const SCENERY_DENSITY = 420 / (Math.PI * 300 * 300);
const MAX_SCENERY_ATTEMPTS = 1200;
const LAMP_SPACING_SAMPLES = 22;
/** World reaches this far past the furthest road, then the edge is hidden by fog and the border ring. */
const WORLD_MARGIN = 70;
const GROUND_TEXTURE_REPEAT = 40;
const WATER_LEVEL = -0.3;
/** Islets: one every ISLET_STEP samples along the road, none within ISLET_BRIDGE_GAP samples of a bridge. */
const ISLET_STEP = 14;
const ISLET_BRIDGE_GAP = 22;
const ISLET_RADIUS = [36, 56];
const ISLET_SEGMENTS = 28;
const BEACH = 6;

/** Everything outside the barriers, placed from the track seed so every client sees the same world. */
export default class RaceScenery {
  constructor(resources, track, theme) {
    this.group = new THREE.Group();
    this.group.name = 'RaceScenery';
    this.track = track;
    this.theme = theme;
    this.scene = (key) => resources.items[worldResourceName(key)].scene;
    this.disposables = [];
    this.worldRadius = Math.max(...track.samples.map((s) => Math.hypot(s.x, s.z))) + track.width / 2 + WORLD_MARGIN;
    this.buildIndex();

    const rng = createRng(`${track.seed}|scenery|${track.generatorVersion}`);
    if (theme.ground === 'island') this.addIslands(rng);
    else if (theme.ground === 'tiles') this.addGrassTiles();
    else this.addPlainGround(theme.ground);
    this.addBorder();
    const placements = new Map();
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

  addGrassTiles() {
    const reach = Math.ceil(this.worldRadius / TILE_SIZE - 0.5);
    const offsets = Array.from({ length: reach * 2 + 1 }, (_, i) => (i - reach) * TILE_SIZE);
    const matrices = offsets.flatMap((x) => offsets.map((z) => new THREE.Matrix4().makeTranslation(x, -0.06, z)));
    const tiles = instanceTile(pushBackLayers(this.scene('grass'), /^Soil$/), matrices);
    if (this.theme.groundTint !== '#ffffff') {
      tiles.traverse((node) => {
        if (!node.isMesh) return;
        node.material = node.material.clone();
        node.material.color.multiply(new THREE.Color(this.theme.groundTint));
        this.disposables.push(node.material);
      });
    }
    this.group.add(tiles);
  }

  addPlainGround(color) {
    const size = this.worldRadius * 2 + TILE_SIZE;
    const texture = groundTexture(color);
    texture.repeat.set(GROUND_TEXTURE_REPEAT, GROUND_TEXTURE_REPEAT);
    const geometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
    this.disposables.push(texture, geometry, material);
    const ground = new THREE.Mesh(geometry, material);
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  /** Sea everywhere, sandy islets with grass tops along the road, open water under every bridge. */
  addIslands(rng) {
    const { samples, bridges } = this.track;
    const n = samples.length;
    const size = this.worldRadius * 2 + TILE_SIZE * 2;
    const waterGeometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    const water = new THREE.MeshStandardMaterial({ color: this.theme.water, roughness: 0.18, metalness: 0.15 });
    this.disposables.push(waterGeometry, water);
    const sea = new THREE.Mesh(waterGeometry, water);
    sea.position.y = WATER_LEVEL;
    sea.receiveShadow = true;
    this.group.add(sea);

    const nearBridge = (i) => bridges.some(({ start, end }) => i > start - ISLET_BRIDGE_GAP && i < end + ISLET_BRIDGE_GAP);
    this.islets = [];
    for (let i = 0; i < n; i += ISLET_STEP) {
      if (nearBridge(i)) continue;
      const s = samples[i];
      const lateral = rng.range(-12, 12);
      this.islets.push({ x: s.x + s.nx * lateral, z: s.z + s.nz * lateral, r: rng.range(...ISLET_RADIUS) });
    }
    const sandGeometry = new THREE.CylinderGeometry(1, 1.12, 1, ISLET_SEGMENTS);
    const grassGeometry = new THREE.CylinderGeometry(1, 1, 1, ISLET_SEGMENTS);
    const sand = new THREE.MeshStandardMaterial({ color: this.theme.sand, roughness: 1 });
    const grass = new THREE.MeshStandardMaterial({ color: this.theme.grass, roughness: 1 });
    this.disposables.push(sandGeometry, grassGeometry, sand, grass);
    const sandMesh = new THREE.InstancedMesh(sandGeometry, sand, this.islets.length);
    const grassMesh = new THREE.InstancedMesh(grassGeometry, grass, this.islets.length);
    const matrix = new THREE.Matrix4();
    const none = new THREE.Quaternion();
    this.islets.forEach(({ x, z, r }, k) => {
      matrix.compose(new THREE.Vector3(x, -0.6, z), none, new THREE.Vector3(r, 1.2, r));
      sandMesh.setMatrixAt(k, matrix);
      // Grass top sits 3 cm above the sand top so the two never z-fight.
      matrix.compose(new THREE.Vector3(x, -0.02, z), none, new THREE.Vector3(r - BEACH, 0.1, r - BEACH));
      grassMesh.setMatrixAt(k, matrix);
    });
    sandMesh.receiveShadow = true;
    grassMesh.receiveShadow = true;
    this.group.add(sandMesh, grassMesh);
  }

  /** Scenery stands on land: anywhere for normal themes, only on an islet's grass for islands. */
  onLand(x, z, margin = 0) {
    if (!this.islets) return true;
    return this.islets.some((islet) => Math.hypot(islet.x - x, islet.z - z) < islet.r - BEACH - margin);
  }

  addBorder() {
    if (this.theme.ground === 'island') return;
    const border = this.scene('border').clone(true);
    border.getObjectByName('InnerFloor')?.removeFromParent();
    // The ring was modelled for a 300 m world; scale it out to this track's world.
    border.scale.setScalar(Math.max(1, this.worldRadius / 300));
    const recolor = this.track.theme !== 'meadow';
    border.traverse((node) => {
      if (!node.isMesh) return;
      node.receiveShadow = true;
      // The ring's hills (vertex-coloured green) take each theme's own ground colour.
      if (recolor && /^ContinuousCliff/.test(node.name)) {
        node.material = node.material.clone();
        node.material.color.set(this.theme.slope);
        node.material.vertexColors = false;
        this.disposables.push(node.material);
      }
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
    const radius = this.worldRadius - 20;
    const taken = [];
    const free = (x, z, r) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r);
    const fits = (x, z, size, clearance = CLEARANCE) => this.distanceToTrack(x, z) >= half + clearance + size && free(x, z, size) && this.onLand(x, z, size);

    const buildings = ['Building_1', 'Building_2', 'Building_3', 'Building_4', 'Building_5'];
    const city = this.track.theme === 'dusk';
    for (let i = 0; i < this.theme.buildings; i++) {
      const template = landmarks.get(rng.pick(buildings));
      if (!template) continue;
      const angle = rng.angle();
      // Dusk is a city, so buildings line the road too; elsewhere they stay towards the edge.
      const distance = city ? rng.range(40, radius) : rng.range(radius * 0.5, radius);
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      const size = Math.max(template.size.x, template.size.z) * 0.7;
      if (!fits(x, z, size)) continue;
      taken.push({ x, z, r: size });
      this.place(placements, template, x, z, Math.atan2(-x, -z) + rng.range(-0.3, 0.3));
    }

    const attempts = Math.min(MAX_SCENERY_ATTEMPTS, Math.round(SCENERY_DENSITY * Math.PI * radius * radius));
    for (let i = 0; i < attempts; i++) {
      const template = nature.get(rng.weighted(this.theme.nature));
      if (!template) continue;
      const angle = rng.angle();
      const distance = Math.sqrt(rng.range(0, 1)) * radius;
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      const scale = rng.range(0.85, 1.35);
      const size = Math.max(template.size.x, template.size.z) * 0.5 * scale;
      if (!fits(x, z, size)) continue;
      taken.push({ x, z, r: size });
      this.place(placements, template, x, z, rng.angle(), scale);
    }

    const lamp = landmarks.get('StreetLamp');
    if (lamp) {
      const { samples } = this.track;
      for (let i = 0; i < samples.length; i += LAMP_SPACING_SAMPLES) {
        const s = samples[i];
        if (s.bridge || s.y > 2.5) continue;
        const side = Math.floor(i / LAMP_SPACING_SAMPLES) % 2 === 0 ? 1 : -1;
        const lateral = side * (half + 3.4);
        const x = s.x + s.nx * lateral;
        const z = s.z + s.nz * lateral;
        if (this.distanceToTrack(x, z) < half + 2.5 || !this.onLand(x, z)) continue;
        this.place(placements, lamp, x, z, Math.atan2(-s.nx * side, -s.nz * side));
      }
    }

    for (const name of ['WindTurbine', 'WindTurbine', 'WaterTower']) {
      const template = landmarks.get(name);
      if (!template) continue;
      for (let attempt = 0; attempt < 20; attempt++) {
        const angle = rng.angle();
        const distance = rng.range(radius * 0.6, radius);
        const x = Math.sin(angle) * distance;
        const z = Math.cos(angle) * distance;
        if (!fits(x, z, 8, 20)) continue;
        taken.push({ x, z, r: 8 });
        this.place(placements, template, x, z, rng.angle());
        break;
      }
    }
  }

  dispose() {
    for (const item of this.disposables) item.dispose?.();
  }
}
