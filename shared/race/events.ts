import type { ItemKind } from './items.ts';

export type SimEvent =
  | { t: 'go' }
  | { t: 'launch'; car: string; quality: 'perfect' | 'bogged' }
  | { t: 'lap'; car: string; lap: number; ticks: number; best: boolean }
  | { t: 'finish'; car: string; ticks: number; rank: number }
  | { t: 'dnf'; car: string }
  | { t: 'raceEnd' }
  | { t: 'fire'; car: string; item: ItemKind; id: number }
  | { t: 'hit'; car: string; by: string | null; item: ItemKind | 'crash'; damage: number; blocked: boolean }
  | { t: 'explode'; id: number; item: ItemKind; x: number; y: number; z: number }
  | { t: 'pickup'; car: string; pickup: number; item: ItemKind }
  | { t: 'wreck'; car: string; x: number; y: number; z: number }
  | { t: 'respawn'; car: string; manual: boolean }
  | { t: 'crash'; car: string; impact: number; x: number; y: number; z: number }
  | { t: 'drift'; car: string; phase: 'start' | 'end' | 'boost' }
  | { t: 'nitro'; car: string; on: boolean }
  | { t: 'shield'; car: string; on: boolean }
  | { t: 'repair'; car: string; amount: number }
  | { t: 'wrongWay'; car: string; on: boolean }
  | { t: 'land'; car: string; airTime: number };
