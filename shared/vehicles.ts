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
}

export interface VehicleDefinition {
  id: string;
  resource: string;
  name: string;
  role: string;
  file: string;
  handling: HandlingConfig;
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
  airControl: 1
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
 * Six deliberately different cars. Top speed is traded against health, grip or acceleration so the
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
  })
]);

export const DEFAULT_VEHICLE = VEHICLES[0];

export function findVehicle(id: unknown): VehicleDefinition {
  return VEHICLES.find((vehicle) => vehicle.id === id) ?? DEFAULT_VEHICLE;
}

export const isVehicleId = (id: unknown): id is string => VEHICLES.some((vehicle) => vehicle.id === id);
