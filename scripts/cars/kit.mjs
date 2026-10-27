// Building blocks for the generated car models (see docs/VEHICLES.md for the contract they follow).
// Metres, +Y up, front faces -Z, origin at the chassis centre. Bodies are extruded side profiles with the
// wheel arches cut in, so every car has a real silhouette at a few thousand triangles.
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const WHEEL_X = 0.97;
export const WHEEL_Y = -0.28;
export const WHEEL_Z = 1.3;
export const WHEEL_RADIUS = 0.35;
const ARCH_RADIUS = 0.42;
const ARCH_SEGMENTS = 8;
const BODY_BEVEL = 0.05;
const CABIN_BEVEL = 0.04;
const GLASS_OFFSET = 0.045;
const TIRE_SEGMENTS = 22;
const RIM_RADIUS = 0.235;
const TURBINE_TWIST = 0.45;

const standard = (name, color, extra = {}) => Object.assign(new T.MeshStandardMaterial({ color, roughness: 0.6, ...extra }), { name });

/** One set of materials per car. `Paint` and `BrakeLights` names are part of the contract. */
export function createMaterials({ paint, accent }) {
  return {
    paint: Object.assign(new T.MeshPhysicalMaterial({ color: paint, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }), { name: 'Paint' }),
    accent: Object.assign(new T.MeshPhysicalMaterial({ color: accent, metalness: 0.3, roughness: 0.4, clearcoat: 0.6 }), { name: 'Accent' }),
    trim: standard('Trim', '#1d2128', { metalness: 0.3, roughness: 0.55 }),
    black: standard('GlossBlack', '#0b0d10', { metalness: 0.4, roughness: 0.25 }),
    chrome: standard('Chrome', '#d9dee5', { metalness: 1, roughness: 0.12 }),
    glass: Object.assign(new T.MeshPhysicalMaterial({ color: '#0f1d29', metalness: 0.2, roughness: 0.05, clearcoat: 1, side: T.DoubleSide }), { name: 'Glass' }),
    rubber: standard('Rubber', '#141518', { roughness: 0.92 }),
    alloy: standard('Alloy', '#b9c2cc', { metalness: 0.9, roughness: 0.22 }),
    rimBlack: standard('RimBlack', '#202328', { metalness: 0.6, roughness: 0.35 }),
    rimWhite: standard('RimWhite', '#eef0f2', { metalness: 0.2, roughness: 0.4 }),
    well: standard('WheelWell', '#07080a', { roughness: 1 }),
    headlight: standard('Headlight', '#eef8ff', { emissive: '#cfeaff', emissiveIntensity: 3 }),
    lamp: standard('Lamp', '#fff4d6', { emissive: '#ffd27a', emissiveIntensity: 2.5 }),
    brake: standard('BrakeLights', '#8f0710', { emissive: '#ff1020', emissiveIntensity: 0.7 }),
    nitro: standard('NitroTip', '#9ff3ff', { emissive: '#22d3ee', emissiveIntensity: 2.5 })
  };
}

/** Side outline: front bottom, the given top line (front to rear), rear bottom, then the floor with arches. */
function profileShape(top, bottom) {
  const front = top[0][0];
  const rear = top.at(-1)[0];
  // Floor corners never pass the outer edge of an arch (matters on short cars).
  const points = [[front, bottom + 0.1], ...top, [rear, bottom + 0.1], [Math.max(rear - 0.08, WHEEL_Z + ARCH_RADIUS), bottom]];
  for (const zc of [WHEEL_Z, -WHEEL_Z]) {
    points.push([zc + ARCH_RADIUS, bottom], [zc + ARCH_RADIUS, WHEEL_Y]);
    for (let i = 1; i < ARCH_SEGMENTS; i++) {
      const a = (i / ARCH_SEGMENTS) * Math.PI;
      points.push([zc + Math.cos(a) * ARCH_RADIUS, WHEEL_Y + Math.sin(a) * ARCH_RADIUS]);
    }
    points.push([zc - ARCH_RADIUS, WHEEL_Y], [zc - ARCH_RADIUS, bottom]);
  }
  points.push([Math.min(front + 0.08, -WHEEL_Z - ARCH_RADIUS), bottom]);
  return new T.Shape(points.map(([z, y]) => new T.Vector2(z, y)));
}

/** Extrude a side-profile shape (x = world z) across the car to `width` (bevel included), centred on x = 0. */
function extrudeAcross(shape, width, bevel) {
  const depth = Math.max(0.05, width - 2 * bevel);
  const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(depth / 2, 0, 0);
  return geometry;
}

export function createKit(name, colors) {
  const car = new T.Group();
  car.name = name;
  const m = createMaterials(colors);
  const add = (geometry, material, meshName, position = [0, 0, 0], rotation = [0, 0, 0], parent = car) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = meshName;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  };
  const box = (meshName, size, position, material, { radius = 0.02, rotation = [0, 0, 0], parent = car } = {}) =>
    add(radius > 0 ? new RoundedBoxGeometry(...size, 1, radius) : new T.BoxGeometry(...size), material, meshName, position, rotation, parent);
  /** Cylinder whose axis runs along 'x', 'y' or 'z'. */
  const cyl = (meshName, radius, length, position, material, axis = 'z', segments = 14) => {
    const rotation = axis === 'z' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, 0, Math.PI / 2] : [0, 0, 0];
    return add(new T.CylinderGeometry(radius, radius, length, segments), material, meshName, position, rotation);
  };
  const bar = (meshName, a, b, radius, material) => {
    const start = new T.Vector3(...a);
    const end = new T.Vector3(...b);
    const dir = end.clone().sub(start);
    const mesh = add(new T.CylinderGeometry(radius, radius, dir.length(), 8), material, meshName, start.clone().add(end).multiplyScalar(0.5).toArray());
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  };

  return {
    car, m, box, cyl, bar, add,
    body({ top, width, bottom = -0.42 }) {
      add(extrudeAcross(profileShape(top, bottom), width, BODY_BEVEL), m.paint, 'Body');
      // Dark wheel wells, so the arches never show daylight through the body.
      for (const z of [-WHEEL_Z, WHEEL_Z]) box('WheelWell', [width - 0.5, 0.36, ARCH_RADIUS * 2 - 0.02], [0, WHEEL_Y + 0.17, z], m.well, { radius: 0 });
    },
    /** Greenhouse in body paint; glass is added with `panel` and `sideGlass`. */
    cabin({ outline, width, material = m.paint }) {
      add(extrudeAcross(new T.Shape(outline.map(([z, y]) => new T.Vector2(z, y))), width, CABIN_BEVEL), material, 'Cabin');
    },
    /** Flat glass from side point a to b (z, y), laid on the slope and pushed outward off the surface. */
    panel(meshName, a, b, width, material = m.glass, outward = GLASS_OFFSET) {
      const dz = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dz, dy);
      // Unit normal of the segment, flipped to point up/out of the body.
      let nz = -dy / length;
      let ny = dz / length;
      if (ny < 0 || (Math.abs(ny) < 1e-6 && nz > 0 !== a[0] > 0)) {
        nz = -nz;
        ny = -ny;
      }
      const center = [(a[0] + b[0]) / 2 + nz * outward, (a[1] + b[1]) / 2 + ny * outward];
      return box(meshName, [width, 0.02, length], [0, center[1], center[0]], material, { radius: 0.008, rotation: [-Math.atan2(dy, dz), 0, 0] });
    },
    /** Side windows: the polygon (z, y) as thin glass on both flanks at |x| = halfWidth. */
    sideGlass(polygon, halfWidth) {
      const geometry = new T.ShapeGeometry(new T.Shape(polygon.map(([z, y]) => new T.Vector2(z, y))));
      geometry.rotateY(-Math.PI / 2);
      // Glass is double-sided, so one geometry serves both flanks without mirroring front and back.
      for (const s of [-1, 1]) add(geometry, m.glass, 'SideGlass', [s * (halfWidth + 0.004), 0, 0]);
    },
    headlights({ z, y, x, size = [0.4, 0.09, 0.06], round = 0 }) {
      for (const s of [-1, 1]) {
        if (round > 0) {
          cyl('HeadlightBezel', round + 0.02, 0.05, [s * x, y, z + 0.015], m.chrome, 'z', 16);
          cyl('Headlight', round, 0.06, [s * x, y, z], m.headlight, 'z', 16);
        } else {
          box('Headlight', size, [s * x, y, z], m.headlight);
        }
      }
    },
    taillights({ z, y, x = 0, size = [0.4, 0.08, 0.05], round = 0, full = false }) {
      if (full) {
        box('TailLight', size, [0, y, z], m.brake, { radius: 0.015 });
        return;
      }
      for (const s of [-1, 1]) {
        if (round > 0) cyl('TailLight', round, 0.05, [s * x, y, z], m.brake, 'z', 14);
        else box('TailLight', size, [s * x, y, z], m.brake, { radius: 0.015 });
      }
    },
    /** Exhaust tips glow blue; `Exhaust_L/R` nodes tell the game where the nitro flames start. */
    exhaust({ z, y, xs, radius = 0.05 }) {
      for (const x of xs) {
        cyl('ExhaustPipe', radius + 0.012, 0.16, [x, y, z - 0.06], m.chrome, 'z', 12);
        cyl('NitroTip', radius, 0.02, [x, y, z + 0.02], m.nitro, 'z', 12);
      }
      for (const [nodeName, x] of [['Exhaust_L', Math.min(...xs)], ['Exhaust_R', Math.max(...xs)]]) {
        const node = new T.Object3D();
        node.name = nodeName;
        node.position.set(x, y, z + 0.05);
        car.add(node);
      }
    },
    mirrors({ z, y, x }) {
      for (const s of [-1, 1]) {
        box('MirrorArm', [0.12, 0.03, 0.05], [s * (x - 0.05), y - 0.03, z], m.black, { radius: 0.01 });
        box('Mirror', [0.1, 0.08, 0.13], [s * x, y, z], m.paint, { radius: 0.03 });
      }
    },
    wing({ z, y, width, chord = 0.32, postX = 0.5, baseY }) {
      box('Wing', [width, 0.04, chord], [0, y, z], m.paint, { radius: 0.015, rotation: [-0.08, 0, 0] });
      for (const s of [-1, 1]) {
        box('WingEndplate', [0.03, 0.16, chord + 0.06], [s * width / 2, y - 0.03, z], m.black, { radius: 0.01 });
        bar('WingPost', [s * postX, baseY, z + 0.05], [s * postX, y - 0.02, z], 0.025, m.black);
      }
    },
    /** Four wheels on the physics contract; widths can differ front/rear. rim: alloy | black | white | aero | turbine. */
    wheels({ front = 0.26, rear = front, rim = 'alloy', spokes = 5 } = {}) {
      const rimMaterial = rim === 'black' || rim === 'turbine' ? m.rimBlack : rim === 'white' ? m.rimWhite : m.alloy;
      [[0, -1, -1], [1, 1, -1], [2, -1, 1], [3, 1, 1]].forEach(([index, side, end]) => {
        const node = new T.Group();
        node.name = `Wheel_${index}`;
        node.position.set(side * WHEEL_X, WHEEL_Y, end * WHEEL_Z);
        car.add(node);
        buildWheel(add, node, { width: end < 0 ? front : rear, side, rimMaterial, rubber: m.rubber, hub: m.chrome, spokes, aero: rim === 'aero' ? m.paint : null, turbine: rim === 'turbine' ? m.nitro : null });
      });
    }
  };
}

/** Rounded tyre with two tread grooves (lathe), rim barrel, spokes or an aero cover, centre cap. */
function buildWheel(add, node, { width, side, rimMaterial, rubber, hub, spokes, aero, turbine }) {
  const h = width / 2;
  const r = WHEEL_RADIUS;
  const profile = [
    [RIM_RADIUS, -h], [r - 0.035, -h], [r - 0.008, -h + 0.025], [r, -h + 0.06], [r, -0.05], [r - 0.012, -0.045], [r - 0.012, -0.02],
    [r, -0.015], [r, 0.015], [r - 0.012, 0.02], [r - 0.012, 0.045], [r, 0.05], [r, h - 0.06], [r - 0.008, h - 0.025], [r - 0.035, h], [RIM_RADIUS, h]
  ].map(([radius, y]) => new T.Vector2(radius, y));
  const tire = new T.LatheGeometry(profile, TIRE_SEGMENTS);
  tire.rotateZ(Math.PI / 2);
  add(tire, rubber, 'Tire', [0, 0, 0], [0, 0, 0], node);

  const barrel = new T.CylinderGeometry(RIM_RADIUS, RIM_RADIUS, width * 0.86, TIRE_SEGMENTS, 1, true);
  barrel.rotateZ(Math.PI / 2);
  add(barrel, rimMaterial, 'Rim', [0, 0, 0], [0, 0, 0], node);
  const faceX = side * (h - 0.02);
  const dish = new T.CylinderGeometry(RIM_RADIUS - 0.01, RIM_RADIUS - 0.04, 0.03, TIRE_SEGMENTS);
  dish.rotateZ(Math.PI / 2);
  add(dish, aero ?? rubber, 'RimDish', [faceX - side * 0.04, 0, 0], [0, 0, 0], node);
  if (aero) {
    const cover = new T.CylinderGeometry(RIM_RADIUS - 0.005, RIM_RADIUS - 0.005, 0.02, TIRE_SEGMENTS);
    cover.rotateZ(Math.PI / 2);
    add(cover, aero, 'AeroCover', [faceX, 0, 0], [0, 0, 0], node);
  } else if (turbine) {
    // Twisted fan blades and a glowing ring at the lip.
    for (let i = 0; i < spokes; i++) {
      add(new T.BoxGeometry(0.018, 0.075, RIM_RADIUS * 1.9), rimMaterial, 'Spoke', [faceX, 0, 0], [(i * Math.PI) / spokes, 0, side * TURBINE_TWIST], node);
    }
    const ring = new T.TorusGeometry(RIM_RADIUS - 0.012, 0.007, 4, TIRE_SEGMENTS);
    ring.rotateY(Math.PI / 2);
    add(ring, turbine, 'RimGlow', [faceX + side * 0.005, 0, 0], [0, 0, 0], node);
  } else {
    for (let i = 0; i < spokes; i++) {
      add(new T.BoxGeometry(0.03, 0.05, RIM_RADIUS * 1.9), rimMaterial, 'Spoke', [faceX, 0, 0], [(i * Math.PI) / spokes, 0, 0], node);
    }
  }
  const cap = new T.CylinderGeometry(0.055, 0.06, 0.04, 12);
  cap.rotateZ(Math.PI / 2);
  add(cap, hub, 'HubCap', [faceX + side * 0.015, 0, 0], [0, 0, 0], node);
}
