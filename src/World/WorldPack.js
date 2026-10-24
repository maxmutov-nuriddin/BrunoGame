import * as THREE from 'three';
import { worldResourceName } from '../worldPack.js';
import { createPlacer, JUMP_SPOTS, PLAZA_CENTERS, ZONES } from './pack/zones.js';
import { createRng } from './pack/seed.js';
import { enableShadows, extractTemplates, instanceTile, pushBackLayers } from './pack/instancing.js';
import { addGroundedHull, addStaticBox } from './pack/statics.js';
import { addLandmarks, addScenery } from './pack/scatter.js';
import { addKnockableProps, syncDynamics } from './pack/props.js';
import { pickPalette } from './pack/palettes.js';

const TILE_OFFSETS = [-240, -80, 80, 240];
const SOLID_PLAZA_PART = /^(InfoKiosk|Bench|Tree_|LowPlanter|GalleryPanel|Spotlight|LowHedge|BuildingBlock|ScatteredCube|OversizedMailbox|PhoneBooth|PaperPlane|StringLightPole)/;
const QUARTER_TURNS = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
// Layers that share Y=0 with the grass tile would z-fight, so lift them a few centimetres.
const SURFACE_LIFT = 0.04;
const PLAZA_BASE_LAYER = /^(Paving|HexagonalPaving)$/;
const JUMP_SOLID_PART = /^(Tabletop|Takeoff|Landing)$/;

const translation = (x, z) => new THREE.Matrix4().makeTranslation(x, 0, z);
const gridMatrices = () => TILE_OFFSETS.flatMap((x) => TILE_OFFSETS.map((z) => translation(x, z)));
const lineMatrices = () => TILE_OFFSETS.map((z) => translation(0, z));

/** Seeded, GLB-driven world: terrain, plazas, jumps, scenery, landmarks and knockable props. */
export default class WorldPack {
  constructor(application, seedCode) {
    this.application = application;
    this.seedCode = seedCode;
    this.group = new THREE.Group();
    this.group.name = 'WorldPack';

    const rng = createRng(seedCode);
    this.ctx = {
      application,
      rng,
      physics: application.physics,
      group: this.group,
      placer: createPlacer(rng),
      bodies: [],
      dynamics: [],
      propScenes: {},
      // Z ranges that road-side lamps and billboards must skip.
      keepOutRanges: [...ZONES.plazas, ...ZONES.challenges]
    };

    this.palette = pickPalette(rng);
    application.applyPalette(this.palette);

    this.addTerrain();
    this.addBorder();
    this.addPlazas();
    this.addJumps();
    addScenery(this.ctx, this.templates('scenery'));
    addLandmarks(this.ctx, this.templates('landmarks'));
    this.collectPropScenes();
    addKnockableProps(this.ctx);

    application.scene.add(this.group);
  }

  scene(key) {
    return this.application.resources.items[worldResourceName(key)].scene;
  }

  templates(key) {
    return extractTemplates(this.scene(key));
  }

  collectPropScenes() {
    ['crate', 'barrel', 'pin', 'brick', 'tire', 'cone'].forEach((key) => {
      this.ctx.propScenes[key] = this.scene(key).children[0];
    });
  }

  addTerrain() {
    this.group.add(instanceTile(pushBackLayers(this.scene('grass'), /^Soil$/), gridMatrices()));
    const road = instanceTile(pushBackLayers(this.scene('road'), /^RoadFoundation$/), lineMatrices());
    road.position.y = SURFACE_LIFT;
    this.group.add(road);
  }

  addBorder() {
    const border = this.scene('border').clone(true);
    border.getObjectByName('InnerFloor')?.removeFromParent();
    enableShadows(border, { cast: false, receive: true });
    this.group.add(border);
  }

  addPlazas() {
    const { rng } = this.ctx;
    const plazas = [
      { key: 'info', at: PLAZA_CENTERS.about, yaw: rng.pick(QUARTER_TURNS) },
      { key: 'blocks', at: PLAZA_CENTERS.skills, yaw: rng.pick([0, Math.PI]) },
      { key: 'contact', at: PLAZA_CENTERS.contact, yaw: rng.pick(QUARTER_TURNS) },
      { key: 'gallery', at: PLAZA_CENTERS.projects, yaw: null }
    ];

    plazas.forEach(({ key, at, yaw }) => {
      const plaza = pushBackLayers(this.scene(key).children[0], PLAZA_BASE_LAYER).clone(true);
      plaza.updateMatrixWorld(true);
      const heading = yaw ?? this.galleryYaw(plaza, at);
      this.placePlaza(plaza, at, heading);
    });
  }

  /** Turn the gallery so its panels sit on the side away from the road. */
  galleryYaw(plaza, at) {
    const centroid = new THREE.Vector3();
    let count = 0;
    plaza.children
      .filter((child) => child.name.startsWith('GalleryPanel'))
      .forEach((panel) => {
        centroid.add(new THREE.Box3().setFromObject(panel).getCenter(new THREE.Vector3()));
        count += 1;
      });
    if (count === 0) return 0;

    centroid.divideScalar(count);
    const panelAngle = Math.atan2(centroid.x, centroid.z);
    return Math.sign(at.x) * Math.PI * 0.5 - panelAngle;
  }

  placePlaza(plaza, at, yaw) {
    const solids = plaza.children
      .filter((child) => SOLID_PLAZA_PART.test(child.name))
      .map((child) => {
        const box = new THREE.Box3().setFromObject(child);
        return { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
      });

    plaza.position.set(at.x, SURFACE_LIFT, at.z);
    plaza.rotation.y = yaw;
    enableShadows(plaza);
    this.group.add(plaza);

    solids.forEach(({ size, center }) => {
      addStaticBox(this.ctx, { position: new THREE.Vector3(at.x, 0, at.z), yaw, size, center });
    });
  }

  addJumps() {
    const templates = this.templates('jumps');
    this.placeJump(templates.get('Jump_01'), JUMP_SPOTS.tabletop, false);
    this.placeJump(templates.get('Jump_02'), JUMP_SPOTS.bigAir, true);
  }

  /** `faceTakeoffAhead` flips the ramp so the take-off side meets traffic coming from the spawn. */
  placeJump(template, { x, z }, faceTakeoffAhead) {
    if (!template) return;

    const jump = template.object.clone(true);
    const takeoffAtLowZ = this.takeoffIsOnLowZ(jump);
    const yaw = faceTakeoffAhead && !takeoffAtLowZ ? Math.PI : 0;

    jump.position.set(x, 0, z);
    jump.rotation.y = yaw;
    enableShadows(jump);
    this.group.add(jump);
    this.group.updateMatrixWorld(true);

    const solids = [];
    jump.traverse((node) => {
      if (node.isMesh && JUMP_SOLID_PART.test(node.name)) solids.push(node);
    });
    solids.forEach((mesh) => addGroundedHull(this.ctx, [mesh]));
  }

  takeoffIsOnLowZ(jump) {
    jump.updateMatrixWorld(true);
    const takeoff = jump.getObjectByName('Takeoff');
    const landing = jump.getObjectByName('Landing');
    if (!takeoff || !landing) return true;

    const takeoffZ = new THREE.Box3().setFromObject(takeoff).getCenter(new THREE.Vector3()).z;
    const landingZ = new THREE.Box3().setFromObject(landing).getCenter(new THREE.Vector3()).z;
    return takeoffZ < landingZ;
  }

  update() {
    syncDynamics(this.ctx.dynamics);
  }

  dispose() {
    this.ctx.bodies.forEach((body) => this.application.physics.world.removeRigidBody(body));
    this.application.scene.remove(this.group);
    this.ctx.bodies.length = 0;
    this.ctx.dynamics.length = 0;
  }
}

