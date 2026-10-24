import type { RigidBody } from '@dimforge/rapier3d-compat';
import PhysicsWorld from '../physics/PhysicsWorld.ts';
import { FIXED_DT, TICK_RATE } from '../constants.ts';
import { NEUTRAL_INPUT, type DriveInput } from '../input.ts';
import { createRng, type Rng } from '../rng.ts';
import { findVehicle } from '../vehicles.ts';
import { buildTrackColliders } from '../track/colliders.ts';
import { TrackLocator } from '../track/locator.ts';
import type { TrackDefinition } from '../track/types.ts';
import RaceCar, { type ParticipantConfig } from './RaceCar.ts';
import { RULES } from './rules.ts';
import { gateCrossing, raceProgress } from './progress.ts';
import { WEAPON, rollItem, type ItemKind } from './items.ts';
import { Combat } from './combat.ts';
import { BotDriver } from './bot.ts';
import type { SimEvent } from './events.ts';

export type RaceMode = 'race' | 'timeTrial';
export type RacePhase = 'countdown' | 'racing' | 'finished';
export type HitSource = ItemKind | 'crash';

export interface RaceConfig {
  track: TrackDefinition;
  laps: number;
  mode: RaceMode;
  itemsEnabled: boolean;
  participants: ParticipantConfig[];
  /** Seeds item rolls and bot noise so a replay of the same inputs is reproducible. */
  seed: string;
}

export interface PickupState {
  id: number;
  available: boolean;
  respawnTick: number;
}

export interface RaceResult {
  id: string;
  name: string;
  vehicleId: string;
  kind: RaceCar['kind'];
  rank: number;
  finished: boolean;
  dnf: boolean;
  totalTicks: number;
  bestLapTicks: number;
  left: boolean;
}

/** How far before its arrival a client may claim a throttle press happened (latency compensation cap). */
const MAX_INPUT_LAG_TICKS = 4;
const RESPAWN_LANES = [0, 4.5, -4.5, 2.2, -2.2, 6.5, -6.5];
const RESPAWN_BACKOFF = [2, -2, -6, -10];
const RESPAWN_CLEARANCE = 4.6;
const GHOST_RELEASE_DISTANCE = 4.5;

/** Authoritative race: physics, rules, items and bots. Runs on the server and, for solo play, in the browser. */
export default class RaceSimulation {
  readonly config: RaceConfig;
  readonly track: TrackDefinition;
  readonly locator: TrackLocator;
  readonly physics: PhysicsWorld;
  readonly cars: RaceCar[] = [];
  readonly carsById = new Map<string, RaceCar>();
  readonly pickups: PickupState[];
  readonly goTick = RULES.introTicks + RULES.countdownTicks;
  readonly combat: Combat;
  readonly rng: Rng;
  readonly bots = new Map<string, BotDriver>();

  tick = 0;
  phase: RacePhase = 'countdown';
  finishDeadline = -1;
  events: SimEvent[] = [];
  private readonly staticBodies: RigidBody[];
  private disposed = false;

  static async create(config: RaceConfig): Promise<RaceSimulation> {
    const physics = await PhysicsWorld.create();
    return new RaceSimulation(config, physics);
  }

  constructor(config: RaceConfig, physics: PhysicsWorld) {
    this.config = config;
    this.track = config.track;
    this.physics = physics;
    this.locator = new TrackLocator(this.track);
    this.rng = createRng(`${config.seed}|race`);
    this.staticBodies = buildTrackColliders(physics, this.track);
    this.pickups = config.itemsEnabled
      ? this.track.pickups.map((pickup) => ({ id: pickup.id, available: true, respawnTick: 0 }))
      : [];
    this.combat = new Combat(this);

    config.participants.slice(0, this.track.grid.length).forEach((participant, slot) => {
      const car = new RaceCar(physics, participant, findVehicle(participant.vehicleId), slot, this.track.grid[slot]);
      this.cars.push(car);
      this.carsById.set(car.id, car);
      this.bots.set(car.id, new BotDriver(this, car, `${config.seed}|bot|${car.id}`));
    });
    this.updateStandings();
  }

  /**
   * Latest input for a car. `claimedTick` is the client's estimate of when it was pressed and `receivedTick`
   * when the server got it; the claim may only move the press a few ticks earlier than its arrival.
   */
  setInput(carId: string, input: DriveInput, claimedTick = this.tick, receivedTick = this.tick): void {
    const car = this.carsById.get(carId);
    if (!car || car.isBotDriven) return;
    if (input.throttle > 0 && car.input.throttle <= 0 && this.phase === 'countdown') {
      const latest = Math.min(receivedTick, this.tick);
      car.throttlePressTick = Math.max(latest - MAX_INPUT_LAG_TICKS, Math.min(claimedTick, latest));
    }
    if (input.throttle <= 0) car.throttlePressTick = -1;
    car.input = input;
  }

  setConnected(carId: string, connected: boolean): void {
    const car = this.carsById.get(carId);
    if (!car || car.kind !== 'human' || car.leftRace) return;
    car.connected = connected;
    car.botControlled = !connected;
    if (!connected) car.input = { ...NEUTRAL_INPUT };
  }

  /** A human gave up for good: a bot finishes the car's race, but the human's result is DNF. */
  markLeft(carId: string): void {
    const car = this.carsById.get(carId);
    if (!car || car.kind !== 'human') return;
    car.leftRace = true;
    car.connected = false;
    car.botControlled = true;
  }

  step(): void {
    if (this.disposed || this.phase === 'finished') return;
    this.events = [];
    if (this.phase === 'countdown' && this.tick >= this.goTick) this.startRace();

    for (const car of this.cars) this.driveCar(car);
    this.physics.world.step();
    for (const car of this.cars) this.afterPhysics(car);

    if (this.phase === 'racing') {
      this.combat.update();
      this.updatePickups();
      this.checkFinish();
    }
    this.updateStandings();
    this.tick += 1;
  }

  private startRace(): void {
    this.phase = 'racing';
    this.events.push({ t: 'go' });
    for (const car of this.cars) {
      car.lapStartTick = this.goTick;
      const pressed = car.throttlePressTick;
      if (pressed < 0 || car.isBotDriven) continue;
      const before = this.goTick - pressed;
      if (before <= RULES.launchWindowStart && before >= RULES.launchWindowEnd) {
        this.launchBoost(car);
      } else if (before > RULES.launchTooEarly) {
        car.bogUntil = this.goTick + RULES.launchBogTicks;
        this.events.push({ t: 'launch', car: car.id, quality: 'bogged' });
      }
    }
  }

  launchBoost(car: RaceCar): void {
    const f = car.physics.forward;
    const dv = RULES.launchBoostSpeed * car.physics.mass;
    car.physics.applyImpulse({ x: f.x * dv, y: 0, z: f.z * dv });
    car.physics.addNitro(RULES.launchBoostNitro);
    this.events.push({ t: 'launch', car: car.id, quality: 'perfect' });
  }

  private inputFor(car: RaceCar): DriveInput {
    if (car.isWrecked(this.tick) || car.frozenUntil > this.tick) return NEUTRAL_INPUT;
    const bot = this.bots.get(car.id)!;
    if (car.finished) return bot.cruise();
    if (car.isBotDriven) return bot.update();
    if (car.bogUntil > this.tick) return { ...car.input, throttle: Math.min(car.input.throttle, 0.15), nitro: false };
    return car.input;
  }

  private driveCar(car: RaceCar): void {
    const input = this.inputFor(car);
    const frozen = this.phase !== 'racing' || car.isWrecked(this.tick) || car.frozenUntil > this.tick;

    if (this.phase === 'racing' && !car.finished && !car.isWrecked(this.tick)) {
      if (input.reset && !car.prevInput.reset) this.tryManualReset(car);
      if (input.useItem && !car.prevInput.useItem) this.combat.useItem(car);
    }
    car.prevInput = input;
    const p = car.physics.body.translation();
    car.prevX = p.x;
    car.prevZ = p.z;
    car.physics.step(input, FIXED_DT, { frozen, allowJump: false });
  }

  private afterPhysics(car: RaceCar): void {
    const physics = car.physics;
    physics.afterStep();
    for (const event of physics.events) {
      if (event.type === 'driftStart') this.events.push({ t: 'drift', car: car.id, phase: 'start' });
      else if (event.type === 'driftEnd') this.events.push({ t: 'drift', car: car.id, phase: 'end' });
      else if (event.type === 'driftBoost') this.events.push({ t: 'drift', car: car.id, phase: 'boost' });
      else if (event.type === 'nitroStart' || event.type === 'nitroEnd') this.events.push({ t: 'nitro', car: car.id, on: event.type === 'nitroStart' });
      else if (event.type === 'land') this.events.push({ t: 'land', car: car.id, airTime: event.value });
    }

    const p = physics.body.translation();
    const location = this.locator.locate(p.x, p.z, car.sampleHint);
    car.sampleHint = location.index;
    car.lateral = location.lateral;
    const sample = this.track.samples[location.index];
    car.trackSpeed = physics.velocity.x * sample.tx + physics.velocity.z * sample.tz;

    if (this.phase === 'racing') {
      this.handleImpact(car, p);
      this.rewardDrift(car);
      if (!car.finished) this.handleCheckpoints(car, p.x, p.z);
      this.handleWrongWay(car);
      this.handleRecovery(car, p.y);
      this.handleGhost(car);
    }
    car.progress = raceProgress(this.track, car.lapsCompleted, car.lastCheckpoint, car.nextCheckpoint, location.s);
  }

  private handleImpact(car: RaceCar, p: { x: number; y: number; z: number }): void {
    const impact = car.physics.impact;
    if (impact < 0.8) return;
    this.events.push({ t: 'crash', car: car.id, impact, x: p.x, y: p.y, z: p.z });
    if (car.isInvulnerable(this.tick) || impact < RULES.collisionDamageMinImpact || this.tick < car.crashDamageReadyTick) return;
    car.crashDamageReadyTick = this.tick + RULES.collisionDamageCooldownTicks;
    this.damage(car, Math.min(RULES.collisionDamageCap, impact * RULES.collisionDamagePerMs), null, 'crash');
  }

  private rewardDrift(car: RaceCar): void {
    const physics = car.physics;
    if (!physics.driftRewardEligible || car.trackSpeed < RULES.driftMinProgressSpeed) return;
    if (physics.driftCharge >= RULES.driftRewardCap) return;
    const amount = Math.min(RULES.driftRewardRate * FIXED_DT, RULES.driftRewardCap - physics.driftCharge);
    physics.driftCharge += amount;
    physics.addNitro(amount);
  }

  private handleCheckpoints(car: RaceCar, x: number, z: number): void {
    const { checkpoints } = this.track;
    const gate = checkpoints[car.nextCheckpoint];
    const crossing = gateCrossing(this.track, gate, car.prevX, car.prevZ, x, z);
    if (crossing !== 1) {
      const behind = checkpoints[car.lastCheckpoint];
      if (crossing === 0 && gateCrossing(this.track, behind, car.prevX, car.prevZ, x, z) === -1) {
        car.wrongWayTicks = Math.max(car.wrongWayTicks, RULES.wrongWayTicks);
      }
      return;
    }
    car.lastCheckpoint = gate.index;
    car.nextCheckpoint = (gate.index + 1) % checkpoints.length;
    if (gate.index !== 0) return;

    car.lapsCompleted += 1;
    const lapTicks = this.tick - car.lapStartTick;
    car.lapStartTick = this.tick;
    car.lapTicks.push(lapTicks);
    const best = car.bestLapTicks < 0 || lapTicks < car.bestLapTicks;
    if (best) car.bestLapTicks = lapTicks;
    this.events.push({ t: 'lap', car: car.id, lap: car.lapsCompleted, ticks: lapTicks, best });
    if (car.lapsCompleted >= this.config.laps) this.finishCar(car);
  }

  private finishCar(car: RaceCar): void {
    car.finished = true;
    car.finishTick = this.tick;
    car.item = null;
    car.wrongWay = false;
    car.physics.setGhost(true);
    car.physics.nitroActive = false;
    const rank = this.cars.filter((other) => other.finished).length;
    this.events.push({ t: 'finish', car: car.id, ticks: this.tick - this.goTick, rank });
    if (this.finishDeadline < 0) this.finishDeadline = this.tick + RULES.finishGraceTicks;
  }

  private handleWrongWay(car: RaceCar): void {
    if (car.finished) return;
    if (car.trackSpeed < -RULES.wrongWaySpeed) car.wrongWayTicks += 1;
    else if (car.trackSpeed > 2) car.wrongWayTicks = 0;
    const wrong = car.wrongWayTicks >= RULES.wrongWayTicks;
    if (wrong !== car.wrongWay) {
      car.wrongWay = wrong;
      this.events.push({ t: 'wrongWay', car: car.id, on: wrong });
    }
  }

  private handleRecovery(car: RaceCar, y: number): void {
    if (car.wreckedUntil === this.tick) {
      this.respawn(car, car.wreckSpeed * RULES.respawnSpeedFraction, false);
      return;
    }
    if (car.isWrecked(this.tick)) return;
    car.flippedTicks = car.physics.up.y < 0.2 ? car.flippedTicks + 1 : 0;
    if (y < RULES.fallResetHeight || car.flippedTicks > RULES.flippedTicksBeforeReset) this.respawn(car, 0, false);
  }

  private handleGhost(car: RaceCar): void {
    if (!car.physics.ghost || car.finished || car.isWrecked(this.tick) || car.ghostUntil > this.tick) return;
    // Stay ghosted until no other car overlaps, so respawns never pop inside someone.
    const p = car.physics.body.translation();
    const overlapping = this.cars.some((other) => {
      if (other === car || other.physics.ghost) return false;
      const q = other.physics.body.translation();
      return Math.hypot(q.x - p.x, q.z - p.z) < GHOST_RELEASE_DISTANCE;
    });
    if (!overlapping) car.physics.setGhost(false);
  }

  private tryManualReset(car: RaceCar): void {
    if (this.tick < car.resetReadyTick) return;
    car.resetReadyTick = this.tick + RULES.manualResetCooldownTicks;
    car.frozenUntil = this.tick + RULES.manualResetFreezeTicks;
    this.respawn(car, 0, true);
  }

  /** Back at the last checkpoint passed, never ahead of where the car really was, in a free lane. */
  respawn(car: RaceCar, speed: number, manual: boolean): void {
    const checkpoint = this.track.checkpoints[car.lastCheckpoint];
    const spot = this.findRespawnSpot(car, checkpoint.sample);
    car.physics.teleport(spot, spot.yaw, speed);
    car.physics.setGhost(true);
    car.ghostUntil = this.tick + RULES.respawnGhostTicks;
    car.flippedTicks = 0;
    car.stuckTicks = 0;
    car.wrongWayTicks = 0;
    car.wrongWay = false;
    car.sampleHint = -1;
    car.prevX = spot.x;
    car.prevZ = spot.z;
    this.events.push({ t: 'respawn', car: car.id, manual });
  }

  private findRespawnSpot(car: RaceCar, sampleIndex: number) {
    for (const back of RESPAWN_BACKOFF) {
      const sample = this.locator.sampleAt(sampleIndex + back);
      for (const lane of RESPAWN_LANES) {
        const x = sample.x + sample.nx * lane;
        const z = sample.z + sample.nz * lane;
        const clear = this.cars.every((other) => {
          if (other === car) return true;
          const q = other.physics.body.translation();
          return Math.hypot(q.x - x, q.z - z) > RESPAWN_CLEARANCE;
        });
        if (clear) return { x, y: sample.y + 0.9, z, yaw: Math.atan2(-sample.tx, -sample.tz) };
      }
    }
    const sample = this.locator.sampleAt(sampleIndex);
    return { x: sample.x, y: sample.y + 0.9, z: sample.z, yaw: Math.atan2(-sample.tx, -sample.tz) };
  }

  damage(car: RaceCar, amount: number, by: string | null, source: HitSource): void {
    car.health = Math.max(0, car.health - amount);
    this.events.push({ t: 'hit', car: car.id, by, item: source, damage: amount, blocked: false });
    if (car.health > 0) return;
    const p = car.physics.body.translation();
    car.wreckedUntil = this.tick + RULES.wreckTicks;
    car.wreckSpeed = car.physics.speed;
    car.health = car.maxHealth;
    car.item = null;
    car.shieldUntil = 0;
    car.physics.setGhost(true);
    car.physics.nitroActive = false;
    this.events.push({ t: 'wreck', car: car.id, x: p.x, y: p.y, z: p.z });
  }

  private updatePickups(): void {
    for (const pickup of this.pickups) {
      if (!pickup.available) {
        if (this.tick >= pickup.respawnTick) pickup.available = true;
        continue;
      }
      const spot = this.track.pickups[pickup.id];
      // Deterministic winner if two cars arrive on the same tick: nearest first, then slot order.
      let winner: RaceCar | null = null;
      let winnerDistance = Infinity;
      for (const car of this.cars) {
        if (car.item || car.finished || car.isWrecked(this.tick)) continue;
        const p = car.physics.body.translation();
        const distance = Math.hypot(p.x - spot.x, p.y + 0.5 - spot.y, p.z - spot.z);
        if (distance < WEAPON.pickupRadius && distance < winnerDistance) {
          winner = car;
          winnerDistance = distance;
        }
      }
      if (!winner) continue;
      winner.item = rollItem(this.rng, winner.rank, this.cars.length);
      winner.itemReadyTick = this.tick + WEAPON.useCooldownTicks;
      pickup.available = false;
      pickup.respawnTick = this.tick + WEAPON.pickupRespawnTicks;
      this.events.push({ t: 'pickup', car: winner.id, pickup: pickup.id, item: winner.item });
    }
  }

  private checkFinish(): void {
    const racing = this.cars.filter((car) => !car.finished && !car.dnf);
    const timedOut = this.finishDeadline >= 0 && this.tick >= this.finishDeadline;
    const hardLimit = this.tick - this.goTick >= RULES.maxRaceTicks;
    if (racing.length > 0 && !timedOut && !hardLimit) return;

    for (const car of racing) {
      car.dnf = true;
      this.events.push({ t: 'dnf', car: car.id });
    }
    this.phase = 'finished';
    this.events.push({ t: 'raceEnd' });
  }

  private updateStandings(): void {
    const ordered = [...this.cars].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTick - b.finishTick || a.slot - b.slot;
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      return b.progress - a.progress || a.slot - b.slot;
    });
    ordered.forEach((car, index) => {
      car.rank = index + 1;
    });
  }

  results(): RaceResult[] {
    return [...this.cars]
      .sort((a, b) => a.rank - b.rank)
      .map((car) => ({
        id: car.id,
        name: car.name,
        vehicleId: car.vehicle.id,
        kind: car.kind,
        rank: car.rank,
        finished: car.finished && !car.leftRace,
        dnf: car.dnf || car.leftRace,
        totalTicks: car.finished ? car.finishTick - this.goTick : -1,
        bestLapTicks: car.bestLapTicks,
        left: car.leftRace
      }));
  }

  /** Seconds since GO; negative during the intro and countdown. */
  raceTimeSeconds(): number {
    return (this.tick - this.goTick) / TICK_RATE;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const car of this.cars) car.physics.dispose();
    for (const body of this.staticBodies) this.physics.world.removeRigidBody(body);
    this.physics.dispose();
  }
}
