// Original, locally generated vehicle pack. Metres; +Y up, -Z forward.
// Contract (see src/World/Car.js): origin at chassis centre, Wheel_0..3 at (±.97, -.28, ±1.30),
// wheel radius .35, material "BrakeLights", meshes named "Headlight".
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};

const standard = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .6, ...extra });
const rubber = standard('#151719', { roughness: .92 });
const trim = standard('#20242b', { metalness: .4, roughness: .4 });
const alloy = standard('#bbc4ce', { metalness: .9, roughness: .22 });
const glass = new T.MeshPhysicalMaterial({ color: '#152b3a', metalness: .35, roughness: .12, clearcoat: 1 });
const white = standard('#e4f7ff', { emissive: '#b9e7ff', emissiveIntensity: 3 });
const wood = standard('#9a6b3c', { roughness: .85 });
const paintMaterial = (color) => new T.MeshPhysicalMaterial({ color, metalness: .6, roughness: .3, clearcoat: 1, clearcoatRoughness: .2 });
const brakeLights = () => {
  const material = standard('#a40812', { emissive: '#ff1010', emissiveIntensity: .7 });
  material.name = 'BrakeLights';
  return material;
};

function createKit(name) {
  const car = new T.Group();
  car.name = name;
  const geometries = new Map();
  const mesh = (geo, mat, meshName, pos = [0, 0, 0], parent = car) => {
    const m = new T.Mesh(geo, mat);
    m.name = meshName;
    m.position.set(...pos);
    parent.add(m);
    return m;
  };
  const box = (meshName, size, pos, mat, radius = .05, parent = car) => {
    const key = [...size, radius].join(',');
    if (!geometries.has(key)) geometries.set(key, new RoundedBoxGeometry(...size, 2, radius));
    return mesh(geometries.get(key), mat, meshName, pos, parent);
  };
  const cylinder = (meshName, radius, length, pos, mat, axis = 'z') => {
    const m = mesh(new T.CylinderGeometry(radius, radius, length, 24), mat, meshName, pos);
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    return m;
  };
  const bar = (meshName, a, b, radius, mat) => {
    const start = new T.Vector3(...a);
    const end = new T.Vector3(...b);
    const d = end.clone().sub(start);
    const m = mesh(new T.CylinderGeometry(radius, radius, d.length(), 10), mat, meshName, start.clone().add(end).multiplyScalar(.5).toArray());
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const wheels = ({ width = .25, spokes = 5, rim = alloy } = {}) => {
    for (const [index, x, z] of [[0, -.97, -1.30], [1, .97, -1.30], [2, -.97, 1.30], [3, .97, 1.30]]) {
      const wheel = new T.Group();
      wheel.name = `Wheel_${index}`;
      wheel.position.set(x, -.28, z);
      car.add(wheel);
      const tire = mesh(new T.CylinderGeometry(.35, .35, width, 40), rubber, 'Tire', [0, 0, 0], wheel);
      tire.rotation.z = Math.PI / 2;
      const side = x < 0 ? -1 : 1;
      const face = mesh(new T.CylinderGeometry(.22, .22, .02, 32), rim, 'RimFace', [side * (width / 2 + .004), 0, 0], wheel);
      face.rotation.z = Math.PI / 2;
      for (let j = 0; j < spokes; j++) {
        const spoke = box('Spoke', [.03, .05, .4], [side * (width / 2 + .02), 0, 0], rim, .012, wheel);
        spoke.rotation.x = j * Math.PI / spokes;
      }
      for (let j = 0; j < 24; j++) {
        const a = j * Math.PI / 12;
        const tread = box('Tread', [width * .9, .014, .03], [0, Math.cos(a) * .35, Math.sin(a) * .35], trim, .003, wheel);
        tread.rotation.x = a;
      }
    }
  };
  const lights = ({ headZ = -2.02, headY = .3, tailZ = 2.02, tailY = .34, x = .58 } = {}) => {
    const tail = brakeLights();
    for (const s of [-1, 1]) {
      box('Headlight', [.42, .09, .08], [s * x, headY, headZ], white, .03);
      box('TailLight', [.42, .09, .08], [s * x, tailY, tailZ], tail, .03);
    }
  };
  return { car, mesh, box, cylinder, bar, wheels, lights };
}

const builders = {
  'atlas-hauler'() {
    const kit = createKit('AtlasHauler');
    const paint = paintMaterial('#e8801f');
    const { car, box, bar, wheels, lights } = kit;
    box('Chassis', [1.78, .5, 4.0], [0, .1, 0], paint, .08);
    box('Hood', [1.7, .12, 1.3], [0, .4, -1.3], paint, .06);
    box('Cabin', [1.62, .62, 1.35], [0, .72, -.35], paint, .1);
    box('Glass', [1.66, .38, 1.15], [0, .78, -.38], glass, .06);
    box('Roof', [1.6, .07, 1.2], [0, 1.06, -.38], paint, .03);
    box('BedFloor', [1.7, .08, 1.75], [0, .38, 1.1], trim, .02);
    for (const s of [-1, 1]) box('BedWall', [.08, .34, 1.75], [s * .85, .58, 1.1], paint, .02);
    box('BedFront', [1.7, .34, .08], [0, .58, .24], paint, .02);
    box('Tailgate', [1.7, .3, .08], [0, .54, 1.98], paint, .02);
    box('CrateA', [.6, .45, .6], [-.42, .65, .8], wood, .03);
    box('CrateB', [.5, .4, .5], [.4, .62, 1.4], wood, .03);
    box('FrontBumper', [1.84, .2, .2], [0, -.02, -2.02], trim, .05);
    box('RearBumper', [1.84, .2, .2], [0, -.02, 2.02], trim, .05);
    box('LightBar', [1.1, .08, .12], [0, 1.14, -.62], standard('#fff2c0', { emissive: '#ffd36b', emissiveIntensity: 2 }), .03);
    for (const s of [-1, 1]) bar('BedHoop', [s * .85, .75, .3], [s * .85, .75, 1.95], .03, trim);
    lights({ headZ: -2.04, headY: .28, tailZ: 2.05, tailY: .36 });
    wheels({ width: .32, spokes: 6 });
    return car;
  },
  'pixel-hatch'() {
    const kit = createKit('PixelHatch');
    const paint = paintMaterial('#1fb5a8');
    const { car, box, cylinder, wheels } = kit;
    box('Body', [1.7, .55, 3.7], [0, .1, 0], paint, .16);
    box('Cabin', [1.56, .72, 2.1], [0, .72, .35], paint, .22);
    box('Glass', [1.6, .45, 1.8], [0, .78, .35], glass, .14);
    box('Roof', [1.5, .08, 1.9], [0, 1.1, .35], standard('#f4f7f7'), .04);
    box('RearWindow', [1.3, .35, .06], [0, .8, 1.32], glass, .03);
    box('FrontBumper', [1.72, .18, .2], [0, -.04, -1.9], standard('#f4f7f7'), .06);
    const tail = brakeLights();
    for (const s of [-1, 1]) {
      cylinder('Headlight', .17, .08, [s * .55, .3, -1.86], white);
      box('TailLight', [.3, .16, .06], [s * .6, .32, 1.86], tail, .03);
    }
    wheels({ width: .24, spokes: 4 });
    return car;
  },
  'nova-coupe'() {
    const kit = createKit('NovaCoupe');
    const paint = paintMaterial('#7a2fe0');
    const stripe = standard('#f4f4ff');
    const cyan = standard('#9ff6ff', { emissive: '#27e6ff', emissiveIntensity: 3 });
    const { car, box, bar, wheels } = kit;
    box('Body', [1.82, .34, 4.1], [0, .02, 0], paint, .1);
    const nose = box('Nose', [1.7, .2, 1.5], [0, .2, -1.5], paint, .08);
    nose.rotation.x = .1;
    box('Cabin', [1.3, .3, 1.5], [0, .4, .3], paint, .12);
    box('Glass', [1.34, .22, 1.2], [0, .44, .25], glass, .08);
    box('Stripe', [.22, .02, 3.9], [0, .205, 0], stripe, .005);
    for (const s of [-1, 1]) {
      box('Intake', [.14, .16, .7], [s * .93, .12, .3], trim, .03);
      box('Headlight', [.6, .05, .06], [s * .52, .2, -2.06], cyan, .02);
      bar('WingPost', [s * .55, .2, 1.85], [s * .55, .68, 1.9], .03, trim);
    }
    box('RearWing', [1.8, .05, .45], [0, .72, 1.92], paint, .02);
    box('Splitter', [1.9, .04, .3], [0, -.12, -2.0], trim, .01);
    const tail = brakeLights();
    box('TailLight', [1.3, .06, .06], [0, .26, 2.06], tail, .02);
    wheels({ width: .24, spokes: 5 });
    return car;
  },
  'courier-van'() {
    const kit = createKit('CourierVan');
    const paint = paintMaterial('#f2c21b');
    const { car, box, bar, wheels, lights } = kit;
    box('Chassis', [1.78, .5, 4.0], [0, .1, 0], paint, .08);
    box('Cab', [1.7, .75, 1.35], [0, .6, -1.15], paint, .12);
    box('Windshield', [1.66, .4, .08], [0, .78, -1.78], glass, .03);
    box('SideGlassL', [.06, .34, .85], [-.86, .8, -1.1], glass, .02);
    box('SideGlassR', [.06, .34, .85], [.86, .8, -1.1], glass, .02);
    box('Cargo', [1.76, 1.0, 2.55], [0, .75, .75], paint, .1);
    box('Envelope', [.04, .38, .56], [-.89, .78, .75], standard('#fffaf0'), .01);
    box('EnvelopeFlap', [.045, .02, .56], [-.89, .96, .75], standard('#d9534f'), .005);
    box('RoofRackA', [1.4, .04, .05], [0, 1.28, .2], trim, .01);
    box('RoofRackB', [1.4, .04, .05], [0, 1.28, 1.2], trim, .01);
    for (const s of [-1, 1]) bar('RackRail', [s * .7, 1.28, .2], [s * .7, 1.28, 1.2], .02, trim);
    box('Parcel', [.7, .3, .5], [0, 1.45, .7], wood, .03);
    box('FrontBumper', [1.82, .2, .2], [0, -.02, -2.02], trim, .05);
    lights({ headZ: -2.04, headY: .3, tailZ: 2.03, tailY: .4 });
    wheels({ width: .26, spokes: 6, rim: standard('#f2f2f2', { metalness: .3 }) });
    return car;
  },
  'dune-jumper'() {
    const kit = createKit('DuneJumper');
    const paint = paintMaterial('#e1b95b');
    const red = standard('#cf3b2a');
    const { car, box, cylinder, bar, wheels } = kit;
    box('Chassis', [1.5, .32, 3.7], [0, .08, 0], paint, .06);
    for (const [x, z] of [[-.97, -1.3], [.97, -1.3], [-.97, 1.3], [.97, 1.3]]) {
      box('Fender', [.5, .12, 1.05], [x, .2, z], red, .05);
    }
    box('SeatBlock', [1.1, .28, 1.2], [0, .3, .2], trim, .06);
    for (const s of [-1, 1]) {
      bar('CageFrontPost', [s * .62, .24, -.45], [s * .55, 1.05, -.1], .035, red);
      bar('CageRearPost', [s * .62, .24, 1.0], [s * .55, 1.05, .9], .035, red);
      bar('CageRoofRail', [s * .55, 1.05, -.1], [s * .55, 1.05, .9], .035, red);
      bar('CageDiagonal', [s * .62, .3, -.45], [s * .55, 1.05, .9], .025, red);
      box('RoofLight', [.22, .12, .1], [s * .3, 1.12, -.12], white, .03);
    }
    bar('CageRoofCross', [-.55, 1.05, -.1], [.55, 1.05, -.1], .035, red);
    bar('BullBarTop', [-.6, .38, -1.95], [.6, .38, -1.95], .04, trim);
    for (const s of [-1, 1]) bar('BullBarPost', [s * .6, .1, -1.9], [s * .6, .38, -1.95], .035, trim);
    cylinder('SpareTire', .32, .22, [0, .55, 1.98], rubber);
    const tail = brakeLights();
    for (const s of [-1, 1]) {
      box('Headlight', [.3, .14, .08], [s * .55, .22, -1.88], white, .03);
      box('TailLight', [.3, .08, .06], [s * .55, .25, 1.86], tail, .02);
    }
    wheels({ width: .34, spokes: 8 });
    return car;
  }
};

for (const [id, build] of Object.entries(builders)) {
  const car = build();
  car.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(car, { binary: true });
  await writeFile(new URL(`../public/models/${id}.glb`, import.meta.url), Buffer.from(glb));
  console.log(`${id}.glb: ${glb.byteLength} bytes`);
}
