import * as THREE from 'three';
import { Dial, Screen, instrumentState } from './gauges.js';
import { cockpitStyleFor } from './styles.js';

/** Render layer for the interior: the main camera sees it, the rear-view mirror camera does not. */
export const COCKPIT_LAYER = 1;
/** Steering-wheel turn per radian of front-wheel steer. Positive steer is left, so the wheel turns left. */
const STEERING_RATIO = 1.7;
const KMH_PER_MS = 3.6;
const SPEEDO_STEP = 20;
const REV_MAX = 8;
const LOOK_DROP = 0.17;
const LOOK_DISTANCE = 30;
const COCKPIT_FOV = 72;
const WHEEL_TILT = { bus: -0.95, default: -0.45 };
/** The model's body top sits about this far above its belt line (extrusion bevel), so the dash goes higher. */
const DASH_LIFT = 0.07;

/**
 * Driver's-eye interior for cockpit camera mode, different for every car (cockpit/styles.js) and built
 * inside that car's real cabin: dashboard, steering wheel that turns with the car, working speedometer,
 * rev counter and nitro gauge, A-pillars and roof lining along the model's own windscreen and roof. The
 * exterior (bonnet, mirrors, wing, cage) is the car model itself, drawn around it.
 */
export default class Cockpit {
  constructor(vehicle) {
    const style = cockpitStyleFor(vehicle.id);
    this.style = style;
    this.group = new THREE.Group();
    this.group.name = 'Cockpit';
    this.group.visible = false;
    this.disposables = [];
    this.instruments = [];
    const { cabin } = style;
    const [base, top] = cabin.screen;
    // Driver's eyes inside the real cabin: under the roof, behind the windscreen top (open cars: behind the screen).
    const ex = -Math.min(0.33, cabin.width / 2 - 0.42);
    const ey = cabin.roof !== null ? Math.min(cabin.belt + 0.32, cabin.roof - 0.16) : cabin.belt + 0.42;
    // Open cars sit as far behind their windscreen base as roofed ones, so the dash stays in view.
    const ez = cabin.roof !== null ? top[0] + 0.35 : base[0] + 0.95;
    this.eye = { x: ex, y: ey, z: ez };
    /** Dashboard anchor: behind the windscreen base, above the body's top surface (belt + bevel). */
    this.dash = { y: cabin.belt + DASH_LIFT, z: base[0] };
    this.mount = {
      offset: new THREE.Vector3(ex, ey, ez),
      look: new THREE.Vector3(ex, ey - LOOK_DROP, -LOOK_DISTANCE),
      fov: COCKPIT_FOV
    };
    this.speedMax = Math.ceil(((vehicle.handling.maxSpeed + vehicle.handling.nitro.speedBonus) * KMH_PER_MS) / SPEEDO_STEP) * SPEEDO_STEP;

    this.mat = {
      dash: this.material(new THREE.MeshStandardMaterial({ color: style.dash, roughness: 0.75 })),
      trim: this.material(new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.45, metalness: 0.35 })),
      accent: this.material(new THREE.MeshBasicMaterial({ color: style.accent })),
      wheel: this.material(new THREE.MeshStandardMaterial({ color: style.wheel.color, roughness: 0.6, metalness: 0.2 })),
      wheelAccent: this.material(new THREE.MeshStandardMaterial({ color: style.wheel.accent, roughness: 0.5 })),
      chrome: this.material(new THREE.MeshStandardMaterial({ color: '#d9dee5', metalness: 1, roughness: 0.15 }))
    };

    this.buildBody();
    this.buildFrame();
    this.buildCluster();
    this.buildWheel();
    this.group.traverse((node) => node.layers.set(COCKPIT_LAYER));
  }

  material(material) {
    this.disposables.push(material);
    return material;
  }

  geometry(geometry) {
    this.disposables.push(geometry);
    return geometry;
  }

  box(size, position, material, rotation = [0, 0, 0], parent = this.group) {
    const mesh = new THREE.Mesh(this.geometry(new THREE.BoxGeometry(...size)), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }

  tube(a, b, radius, material, parent = this.group) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const dir = end.clone().sub(start);
    const mesh = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(radius, radius, dir.length(), 8)), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);
    return mesh;
  }

  /** Dashboard under the windscreen, trim strip, centre console and gear lever. The bonnet is the real one. */
  buildBody() {
    const { x, z } = this.eye;
    const { mat } = this;
    const { y: belt, z: front } = this.dash;
    const width = this.style.cabin.width - 0.08;
    this.box([width, 0.14, 0.56], [0, belt - 0.02, front + 0.3], mat.dash, [-0.08, 0, 0]);
    this.box([width - 0.06, 0.02, 0.02], [0, belt + 0.04, front + 0.58], mat.trim);
    this.box([0.46, 0.03, 0.14], [x, belt + 0.2, front + 0.4], mat.dash);
    this.box([0.24, 0.3, 0.6], [0, belt - 0.22, front + 0.75], mat.dash);
    this.tube([0, belt - 0.1, z - 0.3], [0, belt - 0.02, z - 0.26], 0.012, mat.chrome);
    const knob = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(0.028, 12, 8)), mat.accent);
    knob.position.set(0, belt - 0.01, z - 0.26);
    this.group.add(knob);
  }

  /**
   * Inside of the real cabin: A-pillars along the windscreen edges, roof lining under the roof and door sills.
   * Open cars show their own exterior windscreen frame or roll cage, so they only get sills.
   */
  buildFrame() {
    const { z } = this.eye;
    const { mat } = this;
    const { cabin } = this.style;
    const [base, top] = cabin.screen;
    const half = cabin.width / 2;
    for (const side of [-1, 1]) this.box([0.05, 0.05, Math.max(0.6, z - base[0] + 0.5)], [side * (half - 0.03), cabin.belt + 0.02, (base[0] + 0.2 + z + 0.6) / 2], mat.trim);
    if (cabin.roof === null) return;
    for (const side of [-1, 1]) this.tube([side * (half - 0.06), base[1] + 0.02, base[0]], [side * (half - 0.1), cabin.roof - 0.02, top[0]], 0.03, mat.dash);
    this.box([cabin.width - 0.12, 0.03, 0.8], [0, cabin.roof - 0.02, top[0] + 0.55], mat.dash);
  }

  addInstrument(instrument, position, tilt = -0.15) {
    instrument.group.position.set(...position);
    instrument.group.rotation.x = tilt;
    this.group.add(instrument.group);
    this.instruments.push(instrument);
    this.disposables.push(instrument);
  }

  speedo(radius) {
    return new Dial({ radius, max: this.speedMax, step: SPEEDO_STEP / 2, labelEvery: this.speedMax > 200 ? 4 : 2, label: 'km/h', read: (s) => s.kmh, colors: this.style.dial });
  }

  tacho(radius) {
    return new Dial({ radius, max: REV_MAX, step: 0.5, labelEvery: 2, label: 'x1000', read: (s) => s.revs * REV_MAX, colors: this.style.dial, redFrom: 6.5 });
  }

  nitroDial(radius, label = 'NITRO') {
    return new Dial({ radius, max: 100, step: 10, labelEvery: 5, label, read: (s) => s.nitro * 100, colors: this.style.dial });
  }

  /** The gauge cluster behind the wheel, by style. Every style has a working speed readout. */
  buildCluster() {
    const { x } = this.eye;
    const { y: belt, z: front } = this.dash;
    // Seen through the upper half of the steering wheel, as in a real car.
    const at = (dx, dy = 0, dz = 0) => [x + dx, belt + 0.11 + dy, front + 0.42 + dz];
    const { style } = this;
    switch (style.cluster) {
      case 'twin':
        this.addInstrument(this.tacho(0.075), at(-0.1));
        this.addInstrument(this.speedo(0.075), at(0.1));
        break;
      case 'single':
        this.addInstrument(this.speedo(0.1), at(-0.04));
        this.addInstrument(new Screen({ width: 0.13, height: 0.065, colors: style.dial }), at(0.14, -0.02));
        break;
      case 'digital':
        this.addInstrument(new Screen({ width: 0.32, height: 0.16, colors: style.dial }), at(0, 0.005));
        break;
      case 'triple':
        this.addInstrument(this.tacho(0.055), at(-0.13));
        this.addInstrument(this.speedo(0.055), at(0));
        this.addInstrument(this.nitroDial(0.055), at(0.13));
        break;
      case 'tablet':
        // EV: a slim speed strip behind the yoke and a landscape tablet on the centre of the dash.
        this.addInstrument(new Screen({ width: 0.2, height: 0.07, colors: style.dial, showRevs: false }), at(0, -0.01, -0.06));
        this.addInstrument(new Screen({ width: 0.3, height: 0.17, colors: style.dial, showRevs: false }), [0.12, belt + 0.12, front + 0.4], -0.3);
        break;
      default: // retro: cream twin dials plus a trio of small dials on the centre stack
        this.addInstrument(this.tacho(0.08), at(-0.1));
        this.addInstrument(this.speedo(0.08), at(0.1));
        this.addInstrument(this.nitroDial(0.035), [-0.04, belt - 0.02, front + 0.55], -0.3);
        this.addInstrument(this.tacho(0.035), [0.06, belt - 0.02, front + 0.55], -0.3);
        this.addInstrument(this.nitroDial(0.035, 'BOOST'), [0.16, belt - 0.02, front + 0.55], -0.3);
    }
    if (style.boostGauge) this.addInstrument(this.nitroDial(0.05, 'BOOST'), [x - 0.42, belt + 0.25, front + 0.35], -0.2);
  }

  buildWheel() {
    const { x } = this.eye;
    const { y: belt, z: front } = this.dash;
    const { radius, type, spokes = 3 } = this.style.wheel;
    const { mat } = this;
    this.wheel = new THREE.Group();
    this.wheel.position.set(x, belt - 0.02, front + 0.72);
    this.wheel.rotation.x = WHEEL_TILT[type] ?? WHEEL_TILT.default;
    const rimMaterial = type === 'retro' ? mat.wheelAccent : mat.wheel;
    const spokeMaterial = type === 'retro' ? mat.chrome : mat.wheel;
    const thickness = type === 'retro' ? 0.012 : 0.022;
    if (type === 'yoke') {
      // Open-top yoke: two grips joined by a lower bar, slim hub.
      for (const side of [-1, 1]) this.box([0.035, 0.16, 0.03], [side * radius, -0.01, 0], mat.wheel, [0, 0, 0], this.wheel);
      this.box([radius * 2 + 0.035, 0.03, 0.03], [0, -0.08, 0], mat.wheel, [0, 0, 0], this.wheel);
      this.box([0.08, 0.05, 0.03], [0, -0.05, 0], mat.wheelAccent, [0, 0, 0], this.wheel);
    } else {
      const flat = type === 'flat';
      // A D-shaped wheel is a 300° rim plus a straight bottom.
      const arc = flat ? (5 * Math.PI) / 3 : Math.PI * 2;
      const rim = new THREE.Mesh(this.geometry(new THREE.TorusGeometry(radius, thickness, 8, 32, arc)), rimMaterial);
      if (flat) rim.rotation.z = -Math.PI / 2 + Math.PI / 6;
      this.wheel.add(rim);
      if (flat) this.box([radius, thickness * 2, thickness * 2], [0, -radius * Math.cos(Math.PI / 6), 0], rimMaterial, [0, 0, 0], this.wheel);
      for (let i = 0; i < spokes; i++) {
        const angle = spokes === 2 ? i * Math.PI : -Math.PI / 2 + (i * Math.PI * 2) / spokes;
        const spoke = this.box([radius, 0.026, 0.016], [Math.cos(angle) * radius / 2, Math.sin(angle) * radius / 2, 0], spokeMaterial, [0, 0, angle], this.wheel);
        spoke.position.z = type === 'rally' ? -0.04 : 0;
      }
      const hub = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(0.05, type === 'rally' ? 0.07 : 0.05, 0.05, 14).rotateX(Math.PI / 2)), mat.wheel);
      hub.position.z = type === 'rally' ? -0.03 : 0;
      this.wheel.add(hub);
      this.box([0.03, 0.04, 0.03], [0, radius, 0.005], mat.wheelAccent, [0, 0, 0], this.wheel);
    }
    this.group.add(this.wheel);
  }

  /** Follow the local car and drive the instruments; hidden in every mode except cockpit. */
  update(frame, visible, dt) {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.copy(frame.position);
    this.group.quaternion.copy(frame.quaternion);
    this.wheel.rotation.z = frame.steer * STEERING_RATIO;
    const state = instrumentState(frame, this.style.gearKmh);
    for (const instrument of this.instruments) instrument.update(state, dt);
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
  }
}
