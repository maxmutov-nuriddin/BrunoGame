import { PUBLIC_VEHICLES } from '../../shared/vehicles.ts';

/** 0..1 ratings derived from the real handling numbers, for the garage bars. */
export function vehicleRatings(vehicle) {
  const h = vehicle.handling;
  const range = (pick) => {
    const values = PUBLIC_VEHICLES.map((v) => pick(v.handling));
    return [Math.min(...values), Math.max(...values)];
  };
  // Ranges come from the public cars, so a promo car can exceed them: cap its bars at full.
  const scale = (value, [min, max]) => Math.min(1, 0.25 + 0.75 * ((value - min) / (max - min || 1)));
  return {
    speed: scale(h.maxSpeed, range((x) => x.maxSpeed)),
    acceleration: scale(h.acceleration / h.mass, range((x) => x.acceleration / x.mass)),
    handling: scale(h.steering * h.grip, range((x) => x.steering * x.grip)),
    toughness: scale(h.health, range((x) => x.health)),
    nitro: scale(h.nitro.strength * (100 / h.nitro.burnRate), range((x) => x.nitro.strength * (100 / x.nitro.burnRate)))
  };
}

export const STAT_LABELS = { speed: 'Top speed', acceleration: 'Launch', handling: 'Handling', toughness: 'Toughness', nitro: 'Nitro' };
