export interface SuspensionConfig {
  stiffness: number;
  travel: number;
  compression: number;
  relaxation: number;
}

export interface NitroConfig {
  /** Multiplier on engine force while active. */
  strength: number;
  /** Extra top speed (m/s) while active. */
  speedBonus: number;
  /** Energy drained per second (capacity is always 100). */
  burnRate: number;
}

export interface HandlingConfig {
  mass: number;
  /** Peak engine force in newtons. */
  acceleration: number;
  /** Top speed in m/s without nitro. */
  maxSpeed: number;
  reverseSpeed: number;
  /** Front wheel lock (rad) at standstill and at top speed. */
  steering: number;
  steeringAtSpeed: number;
  /** Longitudinal tyre friction (Rapier friction slip). */
  grip: number;
  /** Lateral stiffness of the tyres when not drifting. */
  sideGrip: number;
  /** Rear lateral stiffness factor while drifting (lower = looser). */
  driftGrip: number;
  /** Total brake force in newtons. */
  braking: number;
  suspension: SuspensionConfig;
  nitro: NitroConfig;
  health: number;
  jumpImpulse: number;
  /** Air steering torque scale. */
  airControl: number;
  /** Multiplier on the nitro a clean drift earns (the per-drift cap is unchanged). */
  driftNitroRate: number;
  /**
   * Extra electric thrust (m/s² at standstill, fading to zero just past maxSpeed) on top of the tyres, which
   * saturate around 1.3 g in this model. 0 for every combustion car.
   */
  electricThrust: number;
}

export interface VehicleDefinition {
  id: string;
  resource: string;
  name: string;
  role: string;
  file: string;
  handling: HandlingConfig;
  /** Not offered in garages, lobbies or to bots unless unlocked (promo-code cars). */
  hidden?: boolean;
}

const BASE: HandlingConfig = {
  mass: 1250,
  acceleration: 6400,
  maxSpeed: 38,
  reverseSpeed: 11,
  steering: 0.47,
  steeringAtSpeed: 0.1,
  grip: 1.8,
  sideGrip: 1.15,
  driftGrip: 0.34,
  braking: 10500,
  suspension: { stiffness: 32, travel: 0.2, compression: 4.4, relaxation: 5.2 },
  nitro: { strength: 1.55, speedBonus: 8, burnRate: 28 },
  health: 100,
  jumpImpulse: 4,
  airControl: 1,
  driftNitroRate: 1,
  electricThrust: 0
};

type HandlingOverrides = Partial<Omit<HandlingConfig, 'suspension' | 'nitro'>> & {
  suspension?: Partial<SuspensionConfig>;
  nitro?: Partial<NitroConfig>;
};

const define = (vehicle: Omit<VehicleDefinition, 'handling'> & { handling?: HandlingOverrides }): VehicleDefinition =>
  Object.freeze({
    ...vehicle,
    handling: Object.freeze({
      ...BASE,
      ...vehicle.handling,
      suspension: Object.freeze({ ...BASE.suspension, ...vehicle.handling?.suspension }),
      nitro: Object.freeze({ ...BASE.nitro, ...vehicle.handling?.nitro })
    })
  });

/**
 * Twelve deliberately different cars (docs/VEHICLES.md). Top speed is traded against health, grip or acceleration so the
 * fastest car is fragile and twitchy, the heaviest wins contact but needs room to brake.
 */
export const VEHICLES: readonly VehicleDefinition[] = Object.freeze([
  define({
    id: 'bruno-gt', resource: 'car', name: 'Nitro GT', role: 'Balanced all-rounder',
    file: 'bruno-gt.glb'
  }),
  define({
    id: 'atlas-hauler', resource: 'car-atlas-hauler', name: 'Atlas Hauler', role: 'Heavy hitter, shrugs off damage',
    file: 'atlas-hauler.glb',
    handling: {
      mass: 1650, acceleration: 7900, maxSpeed: 35, steering: 0.42, steeringAtSpeed: 0.09, grip: 1.7, sideGrip: 1.2,
      driftGrip: 0.42, braking: 12500, suspension: { stiffness: 38 }, nitro: { strength: 1.7, speedBonus: 6, burnRate: 24 },
      health: 145
    }
  }),
  define({
    id: 'pixel-hatch', resource: 'car-pixel-hatch', name: 'Pixel Hatch', role: 'Quick off the line, sharp steering',
    file: 'pixel-hatch.glb',
    handling: {
      mass: 950, acceleration: 6300, maxSpeed: 35, steering: 0.56, steeringAtSpeed: 0.13, grip: 2.0, sideGrip: 1.25,
      driftGrip: 0.3, braking: 9000, suspension: { stiffness: 28 }, nitro: { strength: 1.45, speedBonus: 7, burnRate: 30 },
      health: 80
    }
  }),
  define({
    id: 'nova-coupe', resource: 'car-nova-coupe', name: 'Nova Coupe', role: 'Highest top speed, fragile and twitchy',
    file: 'nova-coupe.glb',
    handling: {
      mass: 1150, acceleration: 6900, maxSpeed: 43, steering: 0.4, steeringAtSpeed: 0.075, grip: 1.6, sideGrip: 1.0,
      driftGrip: 0.27, braking: 10000, suspension: { stiffness: 34 }, nitro: { strength: 1.6, speedBonus: 10, burnRate: 32 },
      health: 70
    }
  }),
  define({
    id: 'courier-van', resource: 'car-courier-van', name: 'Courier Van', role: 'Steady, tough, forgiving',
    file: 'courier-van.glb',
    handling: {
      mass: 1500, acceleration: 7200, maxSpeed: 34, steering: 0.44, steeringAtSpeed: 0.1, grip: 1.8, sideGrip: 1.3,
      driftGrip: 0.45, braking: 11500, suspension: { stiffness: 36 }, nitro: { strength: 1.45, speedBonus: 6, burnRate: 22 },
      health: 150
    }
  }),
  define({
    id: 'dune-jumper', resource: 'car-dune-jumper', name: 'Dune Jumper', role: 'Soft suspension, best in the air',
    file: 'dune-jumper.glb',
    handling: {
      mass: 1300, acceleration: 6700, maxSpeed: 37, steering: 0.5, steeringAtSpeed: 0.11, grip: 1.55, sideGrip: 1.05,
      driftGrip: 0.36, braking: 9800, suspension: { stiffness: 22, travel: 0.3, relaxation: 4.6 },
      nitro: { strength: 1.55, speedBonus: 8, burnRate: 27 }, health: 110, jumpImpulse: 5.5, airControl: 1.8
    }
  }),
  define({
    id: 'vandal-v8', resource: 'car-vandal-v8', name: 'Vandal V8', role: 'Drift king: loose rear, big torque',
    file: 'vandal-v8.glb',
    handling: {
      mass: 1450, acceleration: 7600, maxSpeed: 39, steering: 0.45, steeringAtSpeed: 0.09, grip: 1.75, sideGrip: 1.05,
      driftGrip: 0.24, braking: 10500, suspension: { stiffness: 33 }, nitro: { strength: 1.5, speedBonus: 8, burnRate: 28 },
      health: 115, driftNitroRate: 1.25
    }
  }),
  define({
    id: 'gravel-fox', resource: 'car-gravel-fox', name: 'Gravel Fox', role: 'Rally: soaks up jumps and rough landings',
    file: 'gravel-fox.glb',
    handling: {
      mass: 1180, acceleration: 6500, maxSpeed: 37, steering: 0.5, steeringAtSpeed: 0.11, grip: 1.9, sideGrip: 1.2,
      driftGrip: 0.33, braking: 10000, suspension: { stiffness: 26, travel: 0.28 }, nitro: { strength: 1.5, speedBonus: 7, burnRate: 28 },
      health: 105, jumpImpulse: 5, airControl: 1.6
    }
  }),
  define({
    id: 'volt-arrow', resource: 'car-volt-arrow', name: 'Volt Arrow', role: 'Electric: instant launch, drifts refill extra nitro',
    file: 'volt-arrow.glb',
    handling: {
      mass: 1350, acceleration: 7800, maxSpeed: 38, steering: 0.46, steeringAtSpeed: 0.1, grip: 1.85, sideGrip: 1.15,
      driftGrip: 0.32, braking: 11000, suspension: { stiffness: 34 }, nitro: { strength: 1.45, speedBonus: 7, burnRate: 24 },
      health: 95, driftNitroRate: 1.6
    }
  }),
  define({
    id: 'kei-bolt', resource: 'car-kei-bolt', name: 'Kei Bolt', role: 'Tiny and agile, turns on a coin, fragile',
    file: 'kei-bolt.glb',
    handling: {
      mass: 850, acceleration: 5600, maxSpeed: 33, steering: 0.6, steeringAtSpeed: 0.15, grip: 2.05, sideGrip: 1.3,
      driftGrip: 0.3, braking: 8500, suspension: { stiffness: 26 }, nitro: { strength: 1.5, speedBonus: 7, burnRate: 30 },
      health: 70
    }
  }),
  define({
    id: 'sundown-roadster', resource: 'car-sundown-roadster', name: 'Sundown Roadster', role: 'Best grip and handling, low health',
    file: 'sundown-roadster.glb',
    handling: {
      mass: 1050, acceleration: 6100, maxSpeed: 37, steering: 0.52, steeringAtSpeed: 0.13, grip: 2.2, sideGrip: 1.4,
      driftGrip: 0.36, braking: 10500, suspension: { stiffness: 31 }, nitro: { strength: 1.5, speedBonus: 7, burnRate: 28 },
      health: 75
    }
  }),
  define({
    id: 'hornet-rs', resource: 'car-hornet-rs', name: 'Hornet RS', role: 'Nitro specialist: strongest boost, burns fast',
    file: 'hornet-rs.glb',
    handling: {
      mass: 1200, acceleration: 6600, maxSpeed: 38, steering: 0.47, steeringAtSpeed: 0.1, grip: 1.8, sideGrip: 1.15,
      driftGrip: 0.3, braking: 10200, suspension: { stiffness: 33 }, nitro: { strength: 1.9, speedBonus: 12, burnRate: 42 },
      health: 90
    }
  }),
  define({
    id: 'phantom-e', resource: 'car-phantom-e', name: 'Phantom E', role: 'Electric hypercar: 0–100 in about 1 s, 300 km/h',
    file: 'phantom-e.glb', hidden: true,
    handling: {
      mass: 1350, acceleration: 9000, electricThrust: 28, maxSpeed: 83.4, reverseSpeed: 14, steering: 0.44, steeringAtSpeed: 0.045, grip: 4.5,
      sideGrip: 1.5, driftGrip: 0.34, braking: 14000, suspension: { stiffness: 62, travel: 0.26, compression: 5.2, relaxation: 6 }, nitro: { strength: 1.2, speedBonus: 0, burnRate: 30 },
      health: 110
    }
  })
]);

/** Cars anyone can pick (garage, lobby, bots); hidden ones need an unlock. */
export const PUBLIC_VEHICLES: readonly VehicleDefinition[] = Object.freeze(VEHICLES.filter((v) => !v.hidden));

export const DEFAULT_VEHICLE = VEHICLES[0];

export function findVehicle(id: unknown): VehicleDefinition {
  return VEHICLES.find((vehicle) => vehicle.id === id) ?? DEFAULT_VEHICLE;
}

export const isVehicleId = (id: unknown): id is string => VEHICLES.some((vehicle) => vehicle.id === id);
