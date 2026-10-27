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
const COCKPIT_FOV = 75;
/** Instruments sit this far below and ahead of the eyes (wheel and dash follow), keeping the road in view. */
const CLUSTER_DROP = 0.36;
const CLUSTER_REACH = 1.2;
const WHEEL_TILT = { bus: -0.95, default: -0.45 };
/** Instrument anchor above the belt line: keeps the dash top (anchor + 0.05) clear of the body's top surface. */
const CUTAWAY_ABOVE_BELT = 0.12;
/** Centre console width and its minimum gap to the steering wheel rim. */
const CONSOLE_WIDTH = 0.24;
const CONSOLE_WHEEL_GAP = 0.04;
/** Cabin floor below the belt line, visible past the dash and steering wheel. */
const FLOOR_BELOW_BELT = 0.3;

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
    const ey = cabin.roof !== null ? Math.min(cabin.belt + 0.36, cabin.roof - 0.1) : cabin.belt + 0.34;
    // Open cars sit as far behind their windscreen base as roofed ones, so the dash stays in view.
    const ez = cabin.roof !== null ? top[0] + 0.35 : base[0] + 0.95;
    this.eye = { x: ex, y: ey, z: ez };
    // Laid out from the eyes, not the windscreen, so the wheel and dash never come too close or too high.
    // Low cars keep the instruments above the body's top surface (belt + bevel) instead.
    // The dash top never sits below the cutaway line, so it always closes the cut-open body at the windscreen.
    this.dash = { y: Math.max(ey - CLUSTER_DROP, cabin.belt + CUTAWAY_ABOVE_BELT - 0.05), z: ez - CLUSTER_REACH };
    /** The car model's solid body is cut away behind this z and below this y (see RaceView), so the cabin is hollow. */
    this.cutaway = { z: base[0] - 0.02, y: cabin.belt + CUTAWAY_ABOVE_BELT };
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
      // Light roof lining, like a real headliner; a dark one makes the top of the view feel closed in.
      headliner: this.material(new THREE.MeshStandardMaterial({ color: '#4a5059', roughness: 0.95 })),
      vent: this.material(new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.8 })),
      screen: this.material(new THREE.MeshStandardMaterial({ color: '#0a1220', emissive: this.style.accent, emissiveIntensity: 0.15, roughness: 0.2 })),
      floor: this.material(new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 1 })),
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
    const { cabin } = this.style;
    const width = cabin.width - 0.08;
    // One deep dashboard from the windscreen base back to just before the driver's knees, with a face that
    // drops below the belt line: from the seat you see its top, never the floor or the bare body.
    const dashTop = belt + 0.05;
    const dashFront = cabin.screen[0][0];
    const dashBack = front + 0.62;
    const faceBottom = cabin.belt - 0.3;
    this.box([width, 0.06, dashBack - dashFront], [0, dashTop - 0.03, (dashFront + dashBack) / 2], mat.dash);
    this.box([width, dashTop - faceBottom, 0.06], [0, (dashTop + faceBottom) / 2, dashBack - 0.03], mat.dash);
    this.box([width - 0.06, 0.02, 0.02], [0, dashTop + 0.005, dashBack - 0.01], mat.trim);
    // Dash face details: air vents at both ends and in the middle, centre screen, glovebox on the passenger side.
    const face = dashBack + 0.005;
    for (const vx of [-(width / 2 - 0.12), -0.08, 0.08, width / 2 - 0.12]) {
      this.box([0.13, 0.05, 0.012], [vx, dashTop - 0.07, face], mat.vent);
      for (let i = 0; i < 3; i++) this.box([0.12, 0.006, 0.014], [vx, dashTop - 0.085 + i * 0.015, face + 0.002], mat.trim);
    }
    this.box([0.22, 0.12, 0.012], [0, dashTop - 0.17, face], mat.screen);
    this.box([0.34, 0.14, 0.01], [width / 2 - 0.3, dashTop - 0.16, face], mat.trim);
    this.box([0.3, 0.12, 0.012], [width / 2 - 0.3, dashTop - 0.16, face + 0.003], mat.dash);
    // Centre tunnel between the seats, below the eye line. In narrow cabins the wheel sits near the middle,
    // so the console moves aside to stay clear of the rim instead of cutting through it.
    const cx = Math.max(0, x + this.style.wheel.radius + CONSOLE_WHEEL_GAP + CONSOLE_WIDTH / 2);
    this.box([CONSOLE_WIDTH, 0.12, z + 0.4 - dashBack], [cx, cabin.belt - 0.24, (dashBack + z + 0.4) / 2], mat.trim);
    this.box([CONSOLE_WIDTH, 0.3, 0.6], [cx, belt - 0.22, front + 0.75], mat.dash);
    this.tube([cx, belt - 0.1, z - 0.3], [cx, belt - 0.02, z - 0.26], 0.012, mat.chrome);
    const knob = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(0.028, 12, 8)), mat.accent);
    knob.position.set(cx, belt - 0.01, z - 0.26);
    this.group.add(knob);
  }

  /**
   * Inside of the real cabin: roof lining under the roof, door sills and door panels.
   * Open cars show their own exterior windscreen frame or roll cage, so they only get sills.
   */
  buildFrame() {
    const { z } = this.eye;
    const { mat } = this;
    const { cabin } = this.style;
    const [base, top] = cabin.screen;
    const half = cabin.width / 2;
    for (const side of [-1, 1]) this.box([0.05, 0.05, Math.max(0.6, z - base[0] + 0.5)], [side * (half - 0.03), cabin.belt + 0.02, (base[0] + 0.2 + z + 0.6) / 2], mat.trim);
    // Dark cabin floor over the model's (solid) body between the dash and the seat, so no paint shows inside.
    const floorFront = this.dash.z + 0.62;
    this.box([cabin.width - 0.1, 0.02, z + 0.7 - floorFront], [0, cabin.belt - FLOOR_BELOW_BELT, (floorFront + z + 0.7) / 2], mat.floor);
    // Door panels on both sides, from the dashboard back past the seat.
    const doorFront = base[0] + 0.1;
    const doorBack = z + 0.7;
    for (const side of [-1, 1]) {
      this.box([0.05, 0.42, doorBack - doorFront], [side * (half - 0.05), cabin.belt - 0.08, (doorFront + doorBack) / 2], mat.trim);
    }
    if (cabin.roof === null) return;
    // No A-pillars: this close to the eyes they cut across the road; the roof line frames the cabin.
    // From just ahead of the windscreen top to the back of the roof: also hides roof stripes seen from below.
    this.box([cabin.width - 0.08, 0.03, 1.0], [0, cabin.roof + 0.025, top[0] + 0.45], mat.headliner);
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
    const { y: anchor, z: front } = this.dash;
    // On the dash face, just under the dash top and behind the wheel: seen through the wheel's upper
    // half, never sticking up into the view of the road.
    const top = anchor + 0.05;
    const face = front + 0.632;
    const at = (dx, dy = 0) => [x + dx, top - 0.075 + dy, face];
    const { style } = this;
    switch (style.cluster) {
      case 'twin':
        this.addInstrument(this.tacho(0.058), at(-0.07), 0);
        this.addInstrument(this.speedo(0.058), at(0.07), 0);
        break;
      case 'single':
        this.addInstrument(this.speedo(0.07), at(-0.03), 0);
        this.addInstrument(new Screen({ width: 0.1, height: 0.05, colors: style.dial }), at(0.1, -0.01), 0);
        break;
      case 'digital':
        this.addInstrument(new Screen({ width: 0.24, height: 0.11, colors: style.dial }), at(0), 0);
        break;
      case 'triple':
        this.addInstrument(this.tacho(0.042), at(-0.095), 0);
        this.addInstrument(this.speedo(0.042), at(0), 0);
        this.addInstrument(this.nitroDial(0.042), at(0.095), 0);
        break;
      case 'tablet':
        // EV: a slim speed strip behind the yoke and a tablet in the centre of the dash face.
        this.addInstrument(new Screen({ width: 0.18, height: 0.06, colors: style.dial, showRevs: false }), at(0), 0);
        this.addInstrument(new Screen({ width: 0.24, height: 0.13, colors: style.dial, showRevs: false }), [0.14, top - 0.13, face + 0.004], 0);
        break;
      default: // retro: cream twin dials plus a trio of small dials on the centre stack
        this.addInstrument(this.tacho(0.06), at(-0.07), 0);
        this.addInstrument(this.speedo(0.06), at(0.07), 0);
        for (const [dx, dial] of [[-0.02, this.nitroDial(0.03)], [0.06, this.tacho(0.03)], [0.14, this.nitroDial(0.03, 'BOOST')]]) {
          this.addInstrument(dial, [dx, top - 0.2, face], 0);
        }
    }
    if (style.boostGauge) this.addInstrument(this.nitroDial(0.04, 'BOOST'), at(-0.24), 0);
  }


  buildWheel() {
    const { x } = this.eye;
    const { y: belt, z: front } = this.dash;
    const { radius, type, spokes = 3 } = this.style.wheel;
    const { mat } = this;
    this.wheel = new THREE.Group();
    // Around the gauges: rim top level with the dash top, 10 cm in front of the dash face.
    this.wheel.position.set(x, this.dash.y + 0.05 - 0.15, front + 0.72);
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
