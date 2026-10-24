import type { Rng } from '../rng.ts';
import { TICK_RATE } from '../constants.ts';

export type ItemKind = 'pulse' | 'missile' | 'shock' | 'mine' | 'shield' | 'repair' | 'nitro';

export interface ItemConfig {
  kind: ItemKind;
  name: string;
  description: string;
  damage: number;
  /** Impulse as a velocity change on the victim (m/s). */
  push: number;
  lift: number;
}

export const ITEMS: Readonly<Record<ItemKind, ItemConfig>> = Object.freeze({
  pulse: { kind: 'pulse', name: 'Pulse Shot', description: 'Fast bolt straight ahead; hits the first car or wall.', damage: 22, push: 5, lift: 2 },
  missile: { kind: 'missile', name: 'Arc Missile', description: 'Homes on the nearest rival ahead; cannot pass walls.', damage: 34, push: 4, lift: 6 },
  shock: { kind: 'shock', name: 'Shock Ring', description: 'Blasts nearby cars away from you.', damage: 12, push: 9, lift: 3 },
  mine: { kind: 'mine', name: 'Road Mine', description: 'Dropped behind you; arms after a moment.', damage: 30, push: 2, lift: 7 },
  shield: { kind: 'shield', name: 'Shield', description: 'Absorbs weapon hits for a few seconds.', damage: 0, push: 0, lift: 0 },
  repair: { kind: 'repair', name: 'Repair', description: 'Restores some health.', damage: 0, push: 0, lift: 0 },
  nitro: { kind: 'nitro', name: 'Nitro Cell', description: 'Refills nitro.', damage: 0, push: 0, lift: 0 }
});

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

export const WEAPON = Object.freeze({
  pulseSpeed: 95,
  pulseLifetime: Math.round(1.6 * TICK_RATE),
  missileSpeed: 72,
  missileLifetime: Math.round(5 * TICK_RATE),
  missileTurnRate: 1.6,
  missileRange: 140,
  missileCone: Math.cos((75 * Math.PI) / 180),
  hitRadius: 1.9,
  shockRadius: 10,
  mineArmTicks: Math.round(0.7 * TICK_RATE),
  mineLifetime: Math.round(40 * TICK_RATE),
  mineTriggerRadius: 2.4,
  minesPerOwner: 2,
  shieldTicks: Math.round(6 * TICK_RATE),
  shieldAbsorb: 60,
  repairAmount: 35,
  nitroCell: 60,
  pickupRadius: 2.6,
  pickupRespawnTicks: Math.round(6 * TICK_RATE),
  useCooldownTicks: Math.round(0.4 * TICK_RATE)
});

/** Rank-aware item roll: leaders get defensive tools, the back of the pack gets catch-up weapons. */
export function rollItem(rng: Rng, rank: number, total: number): ItemKind {
  const behind = total <= 1 ? 0.5 : (rank - 1) / (total - 1);
  const weights: [ItemKind, number][] = [
    ['pulse', 1.2],
    ['missile', 0.4 + behind * 1.4],
    ['shock', 0.9],
    ['mine', 1.3 - behind * 0.8],
    ['shield', 1.2 - behind * 0.6],
    ['repair', 0.5 + behind * 0.6],
    ['nitro', 0.6 + behind * 0.9]
  ];
  return rng.weighted(weights);
}
