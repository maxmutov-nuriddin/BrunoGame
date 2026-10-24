import VehiclePhysics from '../physics/VehiclePhysics.ts';
import type PhysicsWorld from '../physics/PhysicsWorld.ts';
import { NEUTRAL_INPUT, type DriveInput } from '../input.ts';
import type { VehicleDefinition } from '../vehicles.ts';
import type { GridSlot } from '../track/types.ts';
import type { ItemKind } from './items.ts';
import type { BotDifficulty } from './botProfiles.ts';

export type ParticipantKind = 'human' | 'bot';

export interface ParticipantConfig {
  id: string;
  name: string;
  vehicleId: string;
  kind: ParticipantKind;
  difficulty?: BotDifficulty;
}

export default class RaceCar {
  readonly id: string;
  readonly name: string;
  readonly vehicle: VehicleDefinition;
  readonly kind: ParticipantKind;
  readonly slot: number;
  readonly physics: VehiclePhysics;
  readonly maxHealth: number;
  difficulty: BotDifficulty;

  input: DriveInput = { ...NEUTRAL_INPUT };
  prevInput: DriveInput = { ...NEUTRAL_INPUT };
  /** Human whose connection dropped: a bot drives until they return. */
  botControlled = false;
  connected = true;
  leftRace = false;

  health: number;
  item: ItemKind | null = null;
  itemReadyTick = 0;
  shieldUntil = 0;
  shieldAbsorb = 0;
  wreckedUntil = -1;
  wreckSpeed = 0;
  ghostUntil = 0;
  frozenUntil = 0;
  resetReadyTick = 0;
  /** No collision damage before this tick (see RULES.collisionDamageCooldownTicks). */
  crashDamageReadyTick = 0;

  lapsCompleted = 0;
  nextCheckpoint = 1;
  lastCheckpoint = 0;
  lapStartTick = 0;
  lapTicks: number[] = [];
  bestLapTicks = -1;
  finished = false;
  finishTick = -1;
  dnf = false;

  sampleHint = -1;
  progress = 0;
  rank = 1;
  lateral = 0;
  trackSpeed = 0;
  wrongWayTicks = 0;
  wrongWay = false;
  flippedTicks = 0;
  stuckTicks = 0;

  throttlePressTick = -1;
  bogUntil = 0;
  prevX: number;
  prevZ: number;

  constructor(physicsWorld: PhysicsWorld, config: ParticipantConfig, vehicle: VehicleDefinition, slot: number, spawn: GridSlot) {
    this.id = config.id;
    this.name = config.name;
    this.kind = config.kind;
    this.vehicle = vehicle;
    this.slot = slot;
    this.difficulty = config.difficulty ?? 'normal';
    this.physics = new VehiclePhysics(physicsWorld, vehicle, { position: spawn, yaw: spawn.yaw });
    this.maxHealth = vehicle.handling.health;
    this.health = this.maxHealth;
    this.prevX = spawn.x;
    this.prevZ = spawn.z;
  }

  get isBotDriven(): boolean {
    return this.kind === 'bot' || this.botControlled;
  }

  isWrecked(tick: number): boolean {
    return this.wreckedUntil > tick;
  }

  isInvulnerable(tick: number): boolean {
    return this.ghostUntil > tick || this.isWrecked(tick) || this.finished;
  }

  hasShield(tick: number): boolean {
    return this.shieldUntil > tick && this.shieldAbsorb > 0;
  }

  /** Lap shown to the driver: 1-based, never beyond the race distance. */
  displayLap(laps: number): number {
    return Math.min(this.lapsCompleted + 1, laps);
  }
}
