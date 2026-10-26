import * as THREE from 'three';
import TrackView from './TrackView.js';
import RaceScenery from './RaceScenery.js';
import CarView, { TREAD_DETAIL_DISTANCE } from './CarView.js';
import RaceProps from './fx/RaceProps.js';
import Particles from './fx/Particles.js';
import SkidMarks from './fx/SkidMarks.js';
import ChaseCamera from './ChaseCamera.js';
import { themeFor } from './themes.js';
import Cockpit, { COCKPIT_LAYER } from './cockpit/Cockpit.js';

const ACCENTS = ['#ff4f6d', '#4fd1ff', '#ffd23f', '#7cff6b', '#c18cff', '#ff9f43', '#3dffd0', '#ff6bd6'];
const SHADOW_EXTENT = 45;
const tmp = new THREE.Vector3();
const side = new THREE.Vector3();
const rearLeft = new THREE.Vector3();
const rearRight = new THREE.Vector3();

export const accentFor = (index) => ACCENTS[index % ACCENTS.length];

/** Everything visible during a race; driven each frame by car frames from any session type. */
export default class RaceView {
  constructor(resources, renderer, { track, participants, localId, quality, showTags }) {
    const theme = themeFor(track);
    this.theme = theme;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.sky, ...theme.fog);
    this.chase = new ChaseCamera();
    this.camera = this.chase.camera;
    this.camera.layers.enable(COCKPIT_LAYER);
    this.track = track;
    this.localId = localId;
    this.renderer = renderer;

    this.hemisphere = new THREE.HemisphereLight(...theme.hemisphere);
    this.sun = new THREE.DirectionalLight(...theme.sun);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(renderer.shadowMapSize, renderer.shadowMapSize);
    Object.assign(this.sun.shadow.camera, { near: 1, far: 140, left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT });
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemisphere, this.sun, this.sun.target);

    this.trackView = new TrackView(track, theme);
    this.scenery = new RaceScenery(resources, track, theme);
    this.props = new RaceProps(track);
    this.smoke = new Particles(quality);
    this.glow = new Particles(quality, THREE.AdditiveBlending);
    this.skids = new SkidMarks(quality);
    this.scene.add(this.trackView.group, this.scenery.group, this.props.group, this.smoke.points, this.glow.points, this.skids.mesh);

    this.cars = new Map();
    participants.forEach((p, index) => {
      const view = new CarView(resources, { vehicleId: p.vehicleId, name: p.name, accent: accentFor(index), showTag: showTags && p.id !== localId && p.kind === 'human' });
      this.cars.set(p.id, view);
      this.scene.add(view.group);
    });
    // The interior belongs to the local car: its style, and its bonnet in that car's paint.
    const local = this.cars.get(localId);
    if (local) {
      const paint = local.materials.find((material) => material.name === 'Paint');
      this.cockpit = new Cockpit(local.vehicle, paint ? paint.color : new THREE.Color('#888888'));
      this.scene.add(this.cockpit.group);
    }
  }

  update(dt, frames, world) {
    for (const [id, frame] of frames) {
      const view = this.cars.get(id);
      if (!view) continue;
      view.update(frame, dt);
      // Low quality never draws tread lugs; the plain tyre underneath stays.
      view.updateDetail(this.camera.position, this.renderer.quality === 'low' ? 0 : TREAD_DETAIL_DISTANCE);
      this.emitDriving(id, frame, view, dt);
    }
    this.props.update(dt, world);
    this.smoke.update(dt);
    this.glow.update(dt);

    const local = frames.get(this.localId);
    if (local) {
      this.sun.position.copy(local.position).add(tmp.set(30, 60, 20));
      this.sun.target.position.copy(local.position);
    }
  }

  /** Tyre smoke and skid marks while sliding, nitro trail while boosting. */
  emitDriving(id, frame, view, dt) {
    const sliding = frame.flags.grounded && (frame.flags.drifting || Math.abs(frame.slip) > 0.22) && frame.speed > 6;
    side.set(1, 0, 0).applyQuaternion(frame.quaternion);
    rearLeft.set(-0.97, -0.6, 1.3).applyQuaternion(frame.quaternion).add(frame.position);
    this.skids.add(`${id}:L`, rearLeft, side, sliding ? 0.9 : 0);
    rearRight.set(0.97, -0.6, 1.3).applyQuaternion(frame.quaternion).add(frame.position);
    this.skids.add(`${id}:R`, rearRight, side, sliding ? 0.9 : 0);
    if (sliding && Math.random() < dt * 40) {
      const p = Math.random() < 0.5 ? rearLeft : rearRight;
      this.smoke.emit({ x: p.x, y: p.y + 0.3, z: p.z, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 2, size: 1.6, grow: 3.5, color: [0.92, 0.93, 0.96], alpha: 0.5, life: 1.2, drag: 1.5 });
    }
    if (frame.flags.nitro && Math.random() < dt * 60) {
      view.group.updateMatrixWorld();
      for (const point of view.exhaustPoints()) {
        this.glow.emit({ x: point.x, y: point.y, z: point.z, vx: -frame.velocity.x * 0.2, vy: 0.3, vz: -frame.velocity.z * 0.2, size: 0.9, grow: -0.6, color: [0.35, 0.8, 1], alpha: 0.9, life: 0.35 });
      }
    }
    if (frame.flags.wrecked && Math.random() < dt * 25) {
      this.smoke.emit({ x: frame.position.x, y: frame.position.y + 0.8, z: frame.position.z, vy: 2.5, size: 2.2, grow: 4, color: [0.2, 0.2, 0.22], alpha: 0.6, life: 1.6, drag: 0.6 });
    }
  }

  /** Hidden in the first-person camera so the body does not fill the screen. */
  setLocalCarVisible(visible) {
    const view = this.cars.get(this.localId);
    if (view) view.group.visible = visible;
  }

  sparks(x, y, z, intensity) {
    const count = Math.min(30, 6 + intensity * 4);
    for (let i = 0; i < count; i++) {
      this.glow.emit({ x, y: y + 0.4, z, vx: (Math.random() - 0.5) * 12, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 12, size: 0.35, color: [1, 0.75, 0.3], alpha: 1, life: 0.4 + Math.random() * 0.3, gravity: 14, drag: 1 });
    }
  }

  explosion(x, y, z, kind) {
    const color = kind === 'shock' ? [0.4, 0.8, 1] : kind === 'pulse' ? [1, 0.4, 0.6] : [1, 0.6, 0.2];
    const radius = kind === 'shock' ? 10 : 3;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (kind === 'shock' ? 18 : 8) * (0.4 + Math.random() * 0.6);
      this.glow.emit({ x, y: y + 0.5, z, vx: Math.cos(a) * speed, vy: Math.random() * 5, vz: Math.sin(a) * speed, size: 1.2, grow: radius * 0.6, color, alpha: 0.9, life: 0.5, drag: 3 });
    }
    for (let i = 0; i < 12; i++) {
      this.smoke.emit({ x, y: y + 0.5, z, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 4, size: 2.5, grow: 4, color: [0.3, 0.3, 0.32], alpha: 0.55, life: 1.4, drag: 1.2 });
    }
  }

  applyPalette({ sky, hemiSky, hemiGround, sun }) {
    this.scene.background = new THREE.Color(sky);
    this.scene.fog.color.set(sky);
    this.hemisphere.color.set(hemiSky);
    this.hemisphere.groundColor.set(hemiGround);
    this.sun.color.set(sun);
  }

  dispose() {
    this.trackView.dispose();
    this.scenery.dispose();
    this.cockpit?.dispose();
    this.props.dispose();
    this.smoke.dispose();
    this.glow.dispose();
    this.skids.dispose();
    for (const view of this.cars.values()) view.dispose();
    this.sun.shadow.map?.dispose();
  }
}
