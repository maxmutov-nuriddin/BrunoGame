const BASE_HANDLING = {
  mass: 1250,
  topSpeed: 36,
  boostSpeed: 48,
  reverseSpeed: 11,
  engineForce: 6200,
  boostForce: 8500,
  grip: 1.7,
  suspensionStiffness: 32,
  suspensionTravel: 0.2,
  steerScale: 1,
  jumpImpulse: 4
};

const define = (vehicle) => Object.freeze({
  ...vehicle,
  handling: Object.freeze({ ...BASE_HANDLING, ...vehicle.handling })
});

export const VEHICLES = Object.freeze([
  define({
    id: 'bruno-gt',
    resource: 'car',
    name: 'Bruno GT',
    role: 'Balanced all-rounder',
    zone: 'Free roam',
    file: 'bruno-gt.glb'
  }),
  define({
    id: 'atlas-hauler',
    resource: 'car-atlas-hauler',
    name: 'Atlas Hauler',
    role: 'Heavy pickup, carries the projects',
    zone: 'Projects',
    file: 'atlas-hauler.glb',
    handling: { mass: 1650, topSpeed: 30, boostSpeed: 40, engineForce: 7600, boostForce: 9800, grip: 1.5, suspensionStiffness: 38 }
  }),
  define({
    id: 'pixel-hatch',
    resource: 'car-pixel-hatch',
    name: 'Pixel Hatch',
    role: 'Light and nimble, sharp steering',
    zone: 'Skills / Slalom',
    file: 'pixel-hatch.glb',
    handling: { mass: 950, topSpeed: 32, boostSpeed: 42, engineForce: 5200, boostForce: 7200, grip: 1.9, suspensionStiffness: 28, steerScale: 1.15 }
  }),
  define({
    id: 'nova-coupe',
    resource: 'car-nova-coupe',
    name: 'Nova Coupe',
    role: 'Fastest, strong boost',
    zone: 'About / Gates',
    file: 'nova-coupe.glb',
    handling: { mass: 1150, topSpeed: 42, boostSpeed: 56, engineForce: 7000, boostForce: 10500, grip: 1.8, suspensionStiffness: 34, steerScale: 0.9 }
  }),
  define({
    id: 'courier-van',
    resource: 'car-courier-van',
    name: 'Courier Van',
    role: 'Steady delivery van',
    zone: 'Contact',
    file: 'courier-van.glb',
    handling: { mass: 1500, topSpeed: 28, boostSpeed: 36, engineForce: 6800, boostForce: 8800, grip: 1.5, suspensionStiffness: 36, steerScale: 0.9 }
  }),
  define({
    id: 'dune-jumper',
    resource: 'car-dune-jumper',
    name: 'Dune Jumper',
    role: 'Soft suspension, big jumps',
    zone: 'Jump 01 / Jump 02',
    file: 'dune-jumper.glb',
    handling: { mass: 1300, topSpeed: 34, boostSpeed: 46, engineForce: 6400, boostForce: 9000, grip: 1.4, suspensionStiffness: 22, suspensionTravel: 0.3, jumpImpulse: 5.5 }
  })
]);

export const DEFAULT_VEHICLE = VEHICLES[0];

export function findVehicle(id) {
  return VEHICLES.find((vehicle) => vehicle.id === id) ?? DEFAULT_VEHICLE;
}
