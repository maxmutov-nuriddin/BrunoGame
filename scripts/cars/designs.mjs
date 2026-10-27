// The twelve Nitro Clash cars (docs/VEHICLES.md §3). Each builder returns a THREE.Group that follows the
// contract: front -Z, origin at the chassis centre, Wheel_0..3, materials Paint and BrakeLights.
// Profiles are [z, y] points from the front bumper to the rear; heights are relative to the chassis centre
// (ground is at y = -0.63).
import { createKit } from './kit.mjs';

/** Windscreen, rear window and side glass for a cabin outline [baseFront, roofFront, roofRear, baseRear]. */
function glassFor(k, outline, width, side) {
  const [baseFront, roofFront, roofRear, baseRear] = outline;
  k.panel('Windscreen', baseFront, roofFront, width - 0.14);
  k.panel('RearWindow', roofRear, baseRear, width - 0.2);
  k.sideGlass(side, width / 2);
}

function nitroGt() {
  const k = createKit('NitroGT', { paint: '#d7192e', accent: '#f5f5f5' });
  const { m } = k;
  k.body({ width: 1.86, top: [[-2.1, -0.06], [-2.06, 0.12], [-1.6, 0.24], [-0.9, 0.3], [-0.5, 0.32], [0.9, 0.35], [1.6, 0.37], [2.06, 0.34], [2.1, 0.16]] });
  const cabin = [[-0.5, 0.3], [0.1, 0.66], [0.95, 0.66], [1.7, 0.36]];
  k.cabin({ outline: cabin, width: 1.5 });
  glassFor(k, cabin, 1.5, [[-0.38, 0.37], [0.13, 0.62], [0.92, 0.62], [1.45, 0.4]]);
  for (const s of [-1, 1]) {
    k.box('RoofStripe', [0.14, 0.012, 0.85], [s * 0.14, 0.705, 0.52], m.accent, { radius: 0.004 });
    k.box('SideIntake', [0.04, 0.12, 0.45], [s * 0.935, 0.02, 0.75], m.black, { radius: 0.01 });
    k.box('Skirt', [0.05, 0.08, 1.6], [s * 0.93, -0.38, 0], m.black, { radius: 0.02 });
  }
  k.headlights({ z: -2.13, y: 0.06, x: 0.6, size: [0.42, 0.07, 0.06] });
  k.box('Grille', [0.9, 0.14, 0.05], [0, -0.14, -2.14], m.black);
  k.box('Splitter', [1.8, 0.04, 0.28], [0, -0.43, -2.0], m.black, { radius: 0.01 });
  k.box('LipSpoiler', [1.5, 0.04, 0.22], [0, 0.41, 1.95], m.paint, { rotation: [-0.12, 0, 0] });
  k.taillights({ z: 2.15, y: 0.24, size: [1.5, 0.06, 0.05], full: true });
  k.box('Diffuser', [1.4, 0.08, 0.2], [0, -0.36, 2.08], m.black);
  k.exhaust({ z: 2.15, y: -0.3, xs: [-0.12, 0.12] });
  k.mirrors({ z: -0.35, y: 0.42, x: 0.84 });
  k.wheels({ front: 0.26, rear: 0.28, rim: 'alloy', spokes: 5 });
  return k.car;
}

function atlasHauler() {
  const k = createKit('AtlasHauler', { paint: '#5b6b2f', accent: '#c9a227' });
  const { m } = k;
  k.body({ width: 1.9, bottom: -0.36, top: [[-2.2, 0.28], [-2.12, 0.44], [-0.72, 0.5], [0.38, 0.52], [2.14, 0.52], [2.2, 0.36]] });
  const cabin = [[-0.72, 0.48], [-0.38, 1.06], [0.3, 1.08], [0.36, 0.5]];
  k.cabin({ outline: cabin, width: 1.66 });
  k.panel('Windscreen', cabin[0], cabin[1], 1.5);
  k.panel('RearWindow', [0.36, 0.62], [0.31, 1.0], 1.4);
  k.sideGlass([[-0.6, 0.62], [-0.37, 0.98], [0.24, 0.98], [0.27, 0.62]], 0.83);
  k.box('BedLiner', [1.64, 0.02, 1.66], [0, 0.575, 1.28], m.black, { radius: 0 });
  k.box('BedFront', [1.7, 0.14, 0.08], [0, 0.64, 0.42], m.paint);
  for (const s of [-1, 1]) {
    k.box('BedRail', [0.1, 0.14, 1.7], [s * 0.86, 0.64, 1.28], m.paint);
    for (const z of [-1.3, 1.3]) k.box('FenderFlare', [0.16, 0.12, 1.0], [s * 0.95, 0.18, z], m.black, { radius: 0.04 });
    k.bar('PushBarPost', [s * 0.75, -0.2, -2.3], [s * 0.75, 0.4, -2.33], 0.035, m.black);
  }
  for (const y of [0.05, 0.35]) k.bar('PushBar', [-0.75, y, -2.33], [0.75, y, -2.33], 0.035, m.black);
  k.box('LightBarMount', [1.2, 0.04, 0.06], [0, 1.12, -0.25], m.black, { radius: 0.01 });
  k.box('LightBar', [1.2, 0.07, 0.1], [0, 1.16, -0.25], m.lamp);
  k.headlights({ z: -2.27, y: 0.3, x: 0.62, size: [0.34, 0.16, 0.06] });
  k.box('Grille', [1.0, 0.3, 0.05], [0, 0.24, -2.27], m.black);
  for (const y of [0.16, 0.24, 0.32]) k.box('GrilleBar', [0.96, 0.03, 0.02], [0, y, -2.3], m.chrome, { radius: 0.005 });
  k.box('RearBumper', [1.86, 0.18, 0.18], [0, -0.2, 2.26], m.black);
  k.box('TailgateStripe', [1.5, 0.05, 0.012], [0, 0.42, 2.255], m.accent, { radius: 0.004 });
  k.taillights({ z: 2.27, y: 0.3, x: 0.82, size: [0.12, 0.3, 0.05] });
  k.exhaust({ z: 2.27, y: -0.28, xs: [-0.6, 0.6] });
  k.mirrors({ z: -0.45, y: 0.75, x: 0.92 });
  k.wheels({ front: 0.3, rim: 'black', spokes: 6 });
  return k.car;
}

function pixelHatch() {
  const k = createKit('PixelHatch', { paint: '#ffc928', accent: '#f5f5f0' });
  const { m } = k;
  k.body({ width: 1.8, top: [[-1.9, 0.04], [-1.86, 0.2], [-1.4, 0.3], [-0.85, 0.37], [1.82, 0.43], [1.9, 0.22]] });
  const cabin = [[-0.85, 0.35], [-0.2, 0.9], [1.5, 0.92], [1.82, 0.43]];
  k.cabin({ outline: cabin, width: 1.56 });
  glassFor(k, cabin, 1.56, [[-0.7, 0.45], [-0.18, 0.86], [1.42, 0.87], [1.62, 0.47]]);
  k.box('Roof', [1.5, 0.03, 1.62], [0, 0.955, 0.65], m.accent, { radius: 0.012 });
  k.box('RoofSpoiler', [1.4, 0.05, 0.28], [0, 0.94, 1.72], m.paint, { rotation: [-0.15, 0, 0] });
  for (const s of [-1, 1]) for (const z of [-1.3, 1.3]) k.box('FenderFlare', [0.14, 0.1, 0.95], [s * 0.91, 0.14, z], m.black, { radius: 0.04 });
  k.headlights({ z: -1.93, y: 0.17, x: 0.56, round: 0.13 });
  k.box('Grille', [1.0, 0.13, 0.05], [0, -0.08, -1.93], m.black);
  k.box('RearBumper', [1.7, 0.14, 0.12], [0, -0.22, 1.92], m.black);
  k.taillights({ z: 1.93, y: 0.32, x: 0.66, size: [0.22, 0.2, 0.05] });
  k.exhaust({ z: 1.93, y: -0.3, xs: [0.42, 0.56], radius: 0.04 });
  k.mirrors({ z: -0.7, y: 0.5, x: 0.82 });
  k.wheels({ front: 0.24, rim: 'alloy', spokes: 4 });
  return k.car;
}

function novaCoupe() {
  const k = createKit('NovaCoupe', { paint: '#eef2f7', accent: '#22d3ee' });
  const { m } = k;
  k.body({ width: 1.94, top: [[-2.2, -0.12], [-2.14, 0.03], [-1.6, 0.2], [-0.9, 0.27], [-0.35, 0.28], [1.0, 0.3], [1.8, 0.33], [2.17, 0.28], [2.2, 0.1]] });
  const cabin = [[-0.6, 0.27], [0.0, 0.6], [0.7, 0.6], [1.5, 0.31]];
  k.cabin({ outline: cabin, width: 1.42 });
  glassFor(k, cabin, 1.42, [[-0.45, 0.33], [0.02, 0.56], [0.68, 0.56], [1.2, 0.35]]);
  k.box('RoofStripe', [0.22, 0.012, 0.65], [0, 0.645, 0.35], m.accent, { radius: 0.004 });
  k.box('DeckStripe', [0.22, 0.012, 0.7], [0, 0.37, 1.55], m.accent, { radius: 0.004 });
  for (const s of [-1, 1]) k.box('SideChannel', [0.04, 0.12, 0.9], [s * 0.98, 0.08, 0.55], m.black, { radius: 0.01 });
  k.wing({ z: 1.95, y: 0.62, width: 1.8, postX: 0.55, baseY: 0.34 });
  k.headlights({ z: -2.23, y: 0.05, x: 0.55, size: [0.5, 0.04, 0.06] });
  k.box('Splitter', [1.86, 0.035, 0.32], [0, -0.43, -2.08], m.black, { radius: 0.01 });
  k.taillights({ z: 2.24, y: 0.2, size: [1.6, 0.04, 0.05], full: true });
  k.box('Diffuser', [1.5, 0.08, 0.22], [0, -0.36, 2.16], m.black);
  k.exhaust({ z: 2.24, y: -0.27, xs: [-0.18, 0.18] });
  k.mirrors({ z: -0.2, y: 0.42, x: 0.85 });
  k.wheels({ front: 0.25, rear: 0.28, rim: 'alloy', spokes: 6 });
  return k.car;
}

function courierVan() {
  const k = createKit('CourierVan', { paint: '#ff8a1f', accent: '#1f2937' });
  const { m } = k;
  k.body({ width: 1.86, top: [[-2.1, 0.08], [-2.05, 0.3], [-1.6, 0.42], [-1.25, 0.5], [2.05, 0.55], [2.1, 0.32]] });
  const cabin = [[-1.25, 0.48], [-0.8, 1.22], [2.02, 1.24], [2.08, 0.53]];
  k.cabin({ outline: cabin, width: 1.78 });
  k.panel('Windscreen', cabin[0], cabin[1], 1.6);
  k.panel('RearWindow', [2.08, 0.8], [2.07, 1.15], 1.2);
  k.sideGlass([[-1.1, 0.62], [-0.82, 1.1], [-0.25, 1.1], [-0.25, 0.62]], 0.89);
  for (const s of [-1, 1]) {
    k.box('SideStripe', [0.012, 0.1, 2.8], [s * 0.936, 0.3, 0.4], m.accent, { radius: 0.004 });
    for (const z of [0.35, 1.2]) k.box('DoorLine', [0.012, 0.62, 0.02], [s * 0.895, 0.82, z], m.black, { radius: 0 });
    k.bar('RackRail', [s * 0.7, 1.36, 0.0], [s * 0.7, 1.36, 1.7], 0.02, m.black);
  }
  for (const z of [0.1, 0.9, 1.6]) k.bar('RackBar', [-0.7, 1.36, z], [0.7, 1.36, z], 0.02, m.black);
  k.box('FrontBumper', [1.88, 0.22, 0.2], [0, -0.2, -2.13], m.black);
  k.box('RearBumper', [1.88, 0.22, 0.2], [0, -0.2, 2.13], m.black);
  k.headlights({ z: -2.13, y: 0.26, x: 0.6, size: [0.34, 0.15, 0.06] });
  k.box('Grille', [0.8, 0.16, 0.05], [0, 0.12, -2.14], m.black);
  k.taillights({ z: 2.13, y: 0.8, x: 0.8, size: [0.12, 0.38, 0.05] });
  k.exhaust({ z: 2.12, y: -0.32, xs: [-0.6, -0.46], radius: 0.04 });
  k.mirrors({ z: -0.95, y: 0.85, x: 0.97 });
  k.wheels({ front: 0.26, rim: 'white', spokes: 6 });
  return k.car;
}

function duneJumper() {
  const k = createKit('DuneJumper', { paint: '#d9b77a', accent: '#15181d' });
  const { m } = k;
  k.body({ width: 1.5, bottom: -0.34, top: [[-1.95, 0.0], [-1.86, 0.18], [-1.3, 0.28], [-0.55, 0.3], [0.9, 0.32], [1.6, 0.34], [1.95, 0.2]] });
  for (const s of [-1, 1]) {
    k.box('SeatBase', [0.5, 0.12, 0.5], [s * 0.3, 0.42, 0.45], m.black);
    k.box('SeatBack', [0.5, 0.5, 0.1], [s * 0.3, 0.64, 0.72], m.black, { rotation: [-0.12, 0, 0] });
    k.bar('CageFront', [s * 0.62, 0.33, -0.4], [s * 0.55, 1.1, -0.05], 0.035, m.accent);
    k.bar('CageRear', [s * 0.62, 0.33, 1.05], [s * 0.55, 1.1, 0.95], 0.035, m.accent);
    k.bar('CageRoof', [s * 0.55, 1.1, -0.05], [s * 0.55, 1.1, 0.95], 0.035, m.accent);
    k.bar('CageDiagonal', [s * 0.62, 0.33, 1.05], [-s * 0.55, 1.1, 0.95], 0.025, m.accent);
    k.cyl('Spotlight', 0.07, 0.1, [s * 0.25, 1.18, -0.05], m.lamp, 'z', 12);
    k.bar('BullBarPost', [s * 0.6, 0.0, -1.92], [s * 0.6, 0.32, -2.0], 0.035, m.black);
    for (const z of [-1.3, 1.3]) {
      k.bar('ArmUpper', [s * 0.62, -0.05, z], [s * 0.9, -0.2, z], 0.025, m.trim);
      k.bar('ArmLower', [s * 0.62, -0.22, z], [s * 0.9, -0.34, z], 0.025, m.trim);
    }
  }
  for (const z of [-0.05, 0.95]) k.bar('CageCross', [-0.55, 1.1, z], [0.55, 1.1, z], 0.035, m.accent);
  k.bar('BullBar', [-0.6, 0.32, -2.0], [0.6, 0.32, -2.0], 0.04, m.black);
  k.cyl('SpareTire', 0.3, 0.2, [0, 0.55, 1.95], m.rubber, 'z', 20);
  k.headlights({ z: -1.98, y: 0.12, x: 0.5, round: 0.1 });
  k.taillights({ z: 1.98, y: 0.22, x: 0.5, size: [0.25, 0.08, 0.05] });
  k.exhaust({ z: 1.98, y: -0.15, xs: [-0.1, 0.1], radius: 0.045 });
  k.wheels({ front: 0.32, rim: 'black', spokes: 8 });
  return k.car;
}

function vandalV8() {
  const k = createKit('VandalV8', { paint: '#4c1d95', accent: '#f5f5f5' });
  const { m } = k;
  k.body({ width: 1.94, top: [[-2.25, 0.0], [-2.2, 0.22], [-1.5, 0.32], [-0.55, 0.36], [0.85, 0.38], [1.7, 0.4], [2.22, 0.36], [2.25, 0.16]] });
  const cabin = [[-0.55, 0.35], [0.05, 0.72], [0.85, 0.72], [1.45, 0.39]];
  k.cabin({ outline: cabin, width: 1.5 });
  glassFor(k, cabin, 1.5, [[-0.42, 0.42], [0.08, 0.68], [0.82, 0.68], [1.22, 0.42]]);
  k.box('PowerBulge', [0.62, 0.08, 1.3], [0, 0.39, -1.05], m.paint, { radius: 0.03, rotation: [-0.042, 0, 0] });
  k.box('HoodScoop', [0.3, 0.06, 0.2], [0, 0.45, -1.1], m.black);
  for (const s of [-1, 1]) {
    k.box('HoodStripe', [0.16, 0.012, 1.3], [s * 0.13, 0.435, -1.05], m.accent, { radius: 0.004, rotation: [-0.042, 0, 0] });
    k.box('RoofStripe', [0.16, 0.012, 0.75], [s * 0.13, 0.765, 0.45], m.accent, { radius: 0.004 });
    k.box('DeckStripe', [0.16, 0.012, 0.7], [s * 0.13, 0.445, 1.85], m.accent, { radius: 0.004 });
    k.cyl('SidePipe', 0.05, 1.0, [s * 0.98, -0.36, 0.0], m.chrome, 'z', 12);
  }
  k.headlights({ z: -2.29, y: 0.1, x: 0.68, round: 0.1 });
  k.headlights({ z: -2.29, y: 0.1, x: 0.42, round: 0.08 });
  k.box('Grille', [1.5, 0.2, 0.05], [0, 0.08, -2.29], m.black);
  k.box('FrontBumper', [1.8, 0.06, 0.08], [0, -0.12, -2.3], m.chrome, { radius: 0.02 });
  k.box('Ducktail', [1.6, 0.05, 0.22], [0, 0.44, 2.15], m.paint, { rotation: [-0.15, 0, 0] });
  k.taillights({ z: 2.29, y: 0.3, x: 0.45, size: [0.55, 0.09, 0.05] });
  k.box('RearBumper', [1.8, 0.06, 0.08], [0, -0.12, 2.3], m.chrome, { radius: 0.02 });
  k.exhaust({ z: 2.29, y: -0.3, xs: [-0.55, 0.55] });
  k.mirrors({ z: -0.4, y: 0.48, x: 0.86 });
  k.wheels({ front: 0.26, rear: 0.32, rim: 'alloy', spokes: 5 });
  return k.car;
}

function gravelFox() {
  const k = createKit('GravelFox', { paint: '#f8fafc', accent: '#f97316' });
  const { m } = k;
  k.body({ width: 1.84, bottom: -0.38, top: [[-2.0, 0.08], [-1.95, 0.25], [-1.4, 0.34], [-0.8, 0.39], [1.9, 0.45], [2.0, 0.25]] });
  const cabin = [[-0.8, 0.37], [-0.2, 0.9], [1.55, 0.9], [1.9, 0.45]];
  k.cabin({ outline: cabin, width: 1.56 });
  glassFor(k, cabin, 1.56, [[-0.65, 0.47], [-0.18, 0.86], [1.48, 0.86], [1.7, 0.48]]);
  k.box('RoofScoop', [0.36, 0.1, 0.45], [0, 0.98, 0.05], m.black);
  k.box('RoofSpoiler', [1.45, 0.05, 0.3], [0, 0.93, 1.72], m.paint, { rotation: [-0.15, 0, 0] });
  for (const x of [-0.55, -0.2, 0.2, 0.55]) {
    k.cyl('RallyLampBack', 0.09, 0.05, [x, 0.46, -1.74], m.black, 'z', 12);
    k.cyl('RallyLamp', 0.08, 0.06, [x, 0.46, -1.78], m.lamp, 'z', 12);
  }
  for (const s of [-1, 1]) {
    k.box('SideStripe', [0.012, 0.1, 3.2], [s * 0.925, 0.1, 0], m.accent, { radius: 0.004 });
    k.box('SideStripeThin', [0.012, 0.04, 3.2], [s * 0.925, 0.22, 0], m.accent, { radius: 0.004 });
    for (const z of [-0.82, 1.78]) k.box('MudFlap', [0.3, 0.26, 0.02], [s * 0.97, -0.42, z], m.black, { radius: 0.005 });
  }
  k.headlights({ z: -2.03, y: 0.17, x: 0.58, size: [0.34, 0.12, 0.06] });
  k.box('Grille', [0.9, 0.12, 0.05], [0, 0.0, -2.03], m.black);
  k.taillights({ z: 2.03, y: 0.36, x: 0.68, size: [0.22, 0.18, 0.05] });
  k.exhaust({ z: 2.03, y: -0.3, xs: [0.45, 0.6], radius: 0.045 });
  k.mirrors({ z: -0.62, y: 0.55, x: 0.84 });
  k.wheels({ front: 0.26, rim: 'white', spokes: 6 });
  return k.car;
}

function voltArrow() {
  const k = createKit('VoltArrow', { paint: '#3f4650', accent: '#38bdf8' });
  const { m } = k;
  k.body({ width: 1.9, top: [[-2.2, -0.05], [-2.12, 0.15], [-1.6, 0.26], [-0.7, 0.32], [1.0, 0.35], [2.1, 0.36], [2.2, 0.2]] });
  const cabin = [[-0.7, 0.31], [0.0, 0.7], [0.6, 0.7], [2.0, 0.37]];
  k.cabin({ outline: cabin, width: 1.52 });
  glassFor(k, cabin, 1.52, [[-0.55, 0.37], [0.03, 0.66], [0.6, 0.66], [1.6, 0.4]]);
  k.box('LightBar', [1.6, 0.03, 0.04], [0, 0.16, -2.24], m.headlight, { radius: 0.01 });
  k.box('LowerIntake', [1.2, 0.08, 0.05], [0, -0.2, -2.24], m.black);
  k.taillights({ z: 2.24, y: 0.28, size: [1.66, 0.04, 0.05], full: true });
  for (const s of [-1, 1]) {
    k.box('UnderGlow', [0.03, 0.03, 2.2], [s * 0.9, -0.42, 0], m.nitro, { radius: 0 });
    k.box('AccentLine', [0.012, 0.025, 2.6], [s * 0.955, 0.12, 0.1], m.accent, { radius: 0.004 });
    k.box('FlushHandle', [0.012, 0.02, 0.12], [s * 0.955, 0.3, 0.35], m.black, { radius: 0 });
  }
  k.exhaust({ z: 2.24, y: -0.28, xs: [-0.4, 0.4], radius: 0.04 });
  k.mirrors({ z: -0.4, y: 0.42, x: 0.84 });
  k.wheels({ front: 0.25, rim: 'aero' });
  return k.car;
}

function keiBolt() {
  const k = createKit('KeiBolt', { paint: '#7dd3b0', accent: '#fafaf9' });
  const { m } = k;
  k.body({ width: 1.7, top: [[-1.75, 0.14], [-1.72, 0.32], [-1.45, 0.42], [-1.05, 0.46], [1.72, 0.5], [1.75, 0.3]] });
  const cabin = [[-1.05, 0.44], [-0.78, 1.12], [1.55, 1.14], [1.72, 0.5]];
  k.cabin({ outline: cabin, width: 1.5 });
  glassFor(k, cabin, 1.5, [[-0.92, 0.56], [-0.76, 1.06], [1.45, 1.07], [1.55, 0.58]]);
  k.box('Roof', [1.46, 0.03, 2.2], [0, 1.19, 0.38], m.accent, { radius: 0.012 });
  for (const s of [-1, 1]) for (const z of [-1.3, 1.3]) k.box('FenderFlare', [0.14, 0.1, 0.9], [s * 0.86, 0.16, z], m.black, { radius: 0.04 });
  k.headlights({ z: -1.78, y: 0.27, x: 0.5, round: 0.14 });
  k.box('Grille', [0.6, 0.08, 0.05], [0, 0.05, -1.78], m.black);
  k.taillights({ z: 1.78, y: 0.45, x: 0.68, size: [0.14, 0.26, 0.05] });
  k.exhaust({ z: 1.78, y: -0.32, xs: [0.4, 0.5], radius: 0.035 });
  k.mirrors({ z: -0.85, y: 0.62, x: 0.8 });
  k.wheels({ front: 0.22, rim: 'white', spokes: 4 });
  return k.car;
}

function sundownRoadster() {
  const k = createKit('SundownRoadster', { paint: '#c81d25', accent: '#f3e9d2' });
  const { m } = k;
  k.body({ width: 1.82, top: [[-2.05, 0.0], [-2.0, 0.2], [-1.4, 0.3], [-0.4, 0.34], [0.2, 0.34], [1.2, 0.36], [1.9, 0.36], [2.05, 0.18]] });
  k.box('Cockpit', [1.4, 0.04, 1.1], [0, 0.395, 0.45], m.black, { radius: 0.01 });
  for (const s of [-1, 1]) {
    k.box('SeatBase', [0.48, 0.1, 0.45], [s * 0.33, 0.45, 0.5], m.accent);
    k.box('SeatBack', [0.48, 0.42, 0.1], [s * 0.33, 0.62, 0.76], m.accent, { rotation: [-0.15, 0, 0] });
    k.bar('HoopPostIn', [s * 0.15, 0.4, 0.92], [s * 0.15, 0.82, 0.92], 0.025, m.chrome);
    k.bar('HoopPostOut', [s * 0.52, 0.4, 0.92], [s * 0.52, 0.82, 0.92], 0.025, m.chrome);
    k.bar('HoopTop', [s * 0.15, 0.82, 0.92], [s * 0.52, 0.82, 0.92], 0.025, m.chrome);
    k.bar('WindscreenSide', [s * 0.7, 0.38, -0.42], [s * 0.7, 0.66, -0.22], 0.015, m.chrome);
  }
  k.panel('Windscreen', [-0.42, 0.38], [-0.22, 0.66], 1.4, m.glass, 0);
  k.bar('WindscreenTop', [-0.7, 0.66, -0.22], [0.7, 0.66, -0.22], 0.015, m.chrome);
  k.headlights({ z: -2.08, y: 0.22, x: 0.62, round: 0.13 });
  k.box('Grille', [0.5, 0.14, 0.04], [0, 0.02, -2.08], m.black);
  k.box('GrilleSurround', [0.56, 0.2, 0.03], [0, 0.02, -2.065], m.chrome, { radius: 0.05 });
  k.box('FrontBumper', [1.7, 0.05, 0.07], [0, -0.15, -2.08], m.chrome, { radius: 0.02 });
  k.box('RearBumper', [1.7, 0.05, 0.07], [0, -0.12, 2.08], m.chrome, { radius: 0.02 });
  k.taillights({ z: 2.08, y: 0.26, x: 0.62, round: 0.07 });
  k.exhaust({ z: 2.08, y: -0.3, xs: [-0.35, 0.35], radius: 0.045 });
  k.mirrors({ z: -0.3, y: 0.46, x: 0.86 });
  k.wheels({ front: 0.25, rim: 'alloy', spokes: 8 });
  return k.car;
}

function hornetRs() {
  const k = createKit('HornetRS', { paint: '#111318', accent: '#facc15' });
  const { m } = k;
  k.body({ width: 1.96, top: [[-2.12, -0.08], [-2.08, 0.14], [-1.5, 0.26], [-0.7, 0.32], [0.9, 0.35], [1.7, 0.37], [2.1, 0.32], [2.12, 0.12]] });
  const cabin = [[-0.7, 0.31], [-0.05, 0.7], [0.85, 0.7], [1.55, 0.36]];
  k.cabin({ outline: cabin, width: 1.48 });
  glassFor(k, cabin, 1.48, [[-0.55, 0.37], [-0.02, 0.66], [0.82, 0.66], [1.3, 0.39]]);
  for (const s of [-1, 1]) {
    for (const z of [-1.3, 1.3]) k.box('WideFlare', [0.12, 0.16, 1.05], [s * 0.99, 0.18, z], m.paint, { radius: 0.05 });
    k.box('SideStripe', [0.012, 0.08, 3.0], [s * 0.984, 0.1, 0], m.accent, { radius: 0.004 });
    k.cyl('NitroTank', 0.085, 0.8, [s * 0.25, 0.5, 1.75], m.chrome, 'z', 14);
    k.cyl('NitroTankCap', 0.06, 0.04, [s * 0.25, 0.5, 1.33], m.nitro, 'z', 12);
  }
  k.box('HoodStripe', [0.2, 0.012, 1.2], [0, 0.32, -1.15], m.accent, { radius: 0.004, rotation: [-0.08, 0, 0] });
  k.wing({ z: 1.9, y: 0.92, width: 1.9, chord: 0.38, postX: 0.55, baseY: 0.4 });
  k.box('Splitter', [1.98, 0.04, 0.36], [0, -0.43, -2.05], m.black, { radius: 0.01 });
  k.headlights({ z: -2.15, y: 0.07, x: 0.6, size: [0.46, 0.06, 0.06] });
  k.box('Grille', [1.2, 0.18, 0.05], [0, -0.15, -2.15], m.black);
  k.taillights({ z: 2.15, y: 0.26, x: 0.5, size: [0.5, 0.06, 0.05] });
  k.box('Diffuser', [1.5, 0.1, 0.24], [0, -0.36, 2.08], m.black);
  k.exhaust({ z: 2.15, y: -0.28, xs: [-0.1, 0.1], radius: 0.07 });
  k.mirrors({ z: -0.4, y: 0.45, x: 0.84 });
  k.wheels({ front: 0.27, rear: 0.29, rim: 'alloy', spokes: 6 });
  return k.car;
}

/** id → builder; ids and file names match shared/vehicles.ts. */
export const DESIGNS = {
  'bruno-gt': nitroGt,
  'atlas-hauler': atlasHauler,
  'pixel-hatch': pixelHatch,
  'nova-coupe': novaCoupe,
  'courier-van': courierVan,
  'dune-jumper': duneJumper,
  'vandal-v8': vandalV8,
  'gravel-fox': gravelFox,
  'volt-arrow': voltArrow,
  'kei-bolt': keiBolt,
  'sundown-roadster': sundownRoadster,
  'hornet-rs': hornetRs
};
