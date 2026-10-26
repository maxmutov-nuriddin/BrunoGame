import { NEUTRAL_INPUT, type DriveInput } from '../input.ts';
import { createRng, type Rng } from '../rng.ts';
import type RaceCar from './RaceCar.ts';
import type RaceSimulation from './RaceSimulation.ts';
import { BOT_PROFILES, type BotProfile } from './botProfiles.ts';
import { WEAPON } from './items.ts';
import { linePath } from './linePath.ts';

const EDGE_MARGIN = 3;
/** Within this distance of a barrier, drifting further out cuts throttle. */
const WALL_CAUTION = 2.4;
const LANE_SHIFT = 3.6;
const TRAFFIC_RANGE = 26;
const TRAFFIC_WIDTH = 3.2;
const ALONGSIDE_LENGTH = 5.5;
const FOLLOW_RANGE = 45;
const FOLLOW_WIDTH = 2.6;
const FOLLOW_GAP = 6;
const FOLLOW_GAIN = 0.8;
/** Seconds of gap kept to the car ahead, on top of FOLLOW_GAP. */
const FOLLOW_HEADWAY = 0.55;
/** A car this slow ahead is an obstacle to drive around, not a pace car. */
const SLOW_CAR_SPEED = 5;
const ALONGSIDE_WIDTH = 4.2;
const PICKUP_SEEK_RANGE = 75;
const MINE_AVOID_RANGE = 35;
const STUCK_SPEED = 1.5;
const STUCK_TICKS = 50;
const REVERSE_TICKS = 75;
const STUCK_RESETS_BEFORE_RESPAWN = 2;
const WRONG_WAY_RESET_TICKS = 150;
/** Facing backwards and crawling: a three-point turn between barriers costs more than a reset. */
const TURNED_AROUND_RESET_TICKS = 70;
const HAIRPIN_CURVATURE = 1 / 30;
const STRAIGHT_CURVATURE = 1 / 150;
const NITRO_BURST_TICKS = 90;
const BRAKE_DECEL = 9;
const CRUISE_FACTOR = 0.55;
const STEER_WHEELBASE = 2.6;
/** Seconds of preview used for the curvature feed-forward. */
const STEER_PREVIEW = 0.18;
const HEADING_GAIN = 1;
const CROSS_TRACK_GAIN = 1.4;
const CROSS_TRACK_SOFTENING = 3;
const YAW_DAMPING = 0.08;

/** Drives a car with the same inputs, physics and rules a human gets. No teleporting, no hidden speed. */
export class BotDriver {
  private readonly sim: RaceSimulation;
  private readonly car: RaceCar;
  private readonly rng: Rng;
  private laneOffset = 0;
  private laneTarget = 0;
  private nextDecision = 0;
  private brakeBias = 0;
  private stuckTicks = 0;
  private stuckEvents = 0;
  private reverseUntil = 0;
  private reverseSteer = 1;
  private wrongWayTicks = 0;
  private nitroUntil = 0;
  private fireNextTick = false;
  /** Aim of the queued item use: true sends it backward (look-back held). */
  private fireBackward = false;
  private itemHeldSince = -1;
  private wantsReset = false;
  private readonly noisePhase: number;

  constructor(sim: RaceSimulation, car: RaceCar, seed: string) {
    this.sim = sim;
    this.car = car;
    this.rng = createRng(seed);
    this.noisePhase = this.rng.angle();
  }

  private get profile(): BotProfile {
    return BOT_PROFILES[this.car.difficulty];
  }

  /** Gentle lap of honour after the flag: follows the line slowly, never fights. */
  cruise(): DriveInput {
    return { ...this.drive(CRUISE_FACTOR, 0), nitro: false, useItem: false, handbrake: false };
  }

  update(): DriveInput {
    const { sim, car } = this;
    if (sim.phase !== 'racing') return NEUTRAL_INPUT;

    if (this.wantsReset) {
      this.wantsReset = false;
      return { ...NEUTRAL_INPUT, reset: true };
    }
    const recovery = this.recover();
    if (recovery) return recovery;

    if (sim.tick >= this.nextDecision) this.decide();
    this.laneOffset += (this.blockedLane(this.laneTarget) - this.laneOffset) * 0.06;

    const input = this.drive(this.profile.speedFactor * (1 + this.brakeBias), this.laneOffset);
    const useItem = this.fireNextTick && !car.prevInput.useItem;
    if (useItem) this.fireNextTick = false;
    // Bots aim like players: holding look-back while using an item sends it backward.
    return { ...input, useItem, lookBack: useItem && this.fireBackward };
  }

  /**
   * Path-following steering: curvature feed-forward plus Stanley-style heading and cross-track
   * feedback, then a braking-aware speed target.
   */
  private drive(speedFactor: number, laneOffset: number): DriveInput {
    const { sim, car } = this;
    const { track } = sim;
    const physics = car.physics;
    const index = this.trackIndex();
    const speed = physics.speed;
    const n = track.samples.length;
    const path = linePath(track);
    const preview = (index + Math.round((speed * STEER_PREVIEW) / track.spacing)) % n;

    const limit = track.width / 2 - EDGE_MARGIN;
    const wantedOffset = Math.max(-limit, Math.min(limit, track.racingLine[index].offset + laneOffset));
    const crossTrack = car.lateral - wantedOffset;
    const f = physics.forward;
    const flat = Math.hypot(f.x, f.z) || 1;
    const headingError = Math.atan2((f.x * path.tz[index] - f.z * path.tx[index]) / flat, (f.x * path.tx[index] + f.z * path.tz[index]) / flat);
    // Positive heading error means the nose points left of the path; positive cross-track means left of the line.
    const pathCurvature = path.curvature[preview];
    const feedForward = Math.atan(STEER_WHEELBASE * pathCurvature);
    const yawRate = physics.body.angvel().y;
    const yawError = yawRate - speed * pathCurvature;
    const wheelAngle =
      feedForward - HEADING_GAIN * headingError - Math.atan((CROSS_TRACK_GAIN * crossTrack) / (speed + CROSS_TRACK_SOFTENING)) - YAW_DAMPING * yawError;
    const lock = Math.max(0.05, lerp(physics.handling.steering, physics.handling.steeringAtSpeed, Math.min(speed / physics.handling.maxSpeed, 1)));
    const wobble = Math.sin(sim.tick * 0.05 + this.noisePhase) * this.profile.steerNoise;
    const steer = clamp(wheelAngle / lock + wobble, -1, 1);

    const targetSpeed = Math.min(this.cornerSpeed(index, speed) * speedFactor, physics.handling.maxSpeed * 1.05, this.followSpeed());
    const diff = targetSpeed - speed;
    let throttle = diff > 1 ? 1 : diff < -2.5 ? -1 : clamp(0.3 + diff * 0.3, -0.2, 1);
    const sample = track.samples[index % track.samples.length];
    const outward = Math.sign(car.lateral) * (physics.velocity.x * sample.nx + physics.velocity.z * sample.nz);
    if (Math.abs(car.lateral) > track.width / 2 - WALL_CAUTION && outward > 1) throttle = Math.min(throttle, 0);

    const curvatureAhead = Math.abs(track.samples[(index + Math.round(20 / track.spacing)) % n].curvature);
    const handbrake =
      this.profile.driftSkill > 0.4 && curvatureAhead > HAIRPIN_CURVATURE && speed > 17 && speed > targetSpeed + 1.5 && Math.abs(steer) > 0.35;

    const nitro = sim.tick < this.nitroUntil && this.straightAhead(index, 80) && throttle > 0.5;
    return { ...NEUTRAL_INPUT, throttle, steer, handbrake, nitro };
  }

  private trackIndex(): number {
    const { car, sim } = this;
    if (car.sampleHint >= 0) return car.sampleHint;
    const p = car.physics.body.translation();
    return sim.locator.locate(p.x, p.z, -1, p.y).index;
  }

  /** Adaptive cruise: never drive into the back of a car in the same lane. */
  private followSpeed(): number {
    const { sim, car } = this;
    let allowed = Infinity;
    for (const other of sim.cars) {
      if (other === car || other.physics.ghost || other.finished) continue;
      const gap = other.progress - car.progress;
      if (gap <= 0 || gap > FOLLOW_RANGE) continue;
      if (Math.abs(other.lateral - car.lateral) > FOLLOW_WIDTH) continue;
      if (other.physics.speed < SLOW_CAR_SPEED && gap > FOLLOW_GAP) continue;
      const desiredGap = FOLLOW_GAP + car.physics.speed * FOLLOW_HEADWAY;
      allowed = Math.min(allowed, Math.max(0, other.physics.speed + (gap - desiredGap) * FOLLOW_GAIN));
    }
    return allowed;
  }

  /** Slowest speed the line allows within braking distance, discounted by how far away it is. */
  private cornerSpeed(index: number, speed: number): number {
    const { track } = this.sim;
    const n = track.racingLine.length;
    const brakeDistance = (speed * speed) / (2 * BRAKE_DECEL) + 12;
    const steps = Math.ceil(brakeDistance / track.spacing);
    let allowed = Infinity;
    for (let k = 0; k <= steps; k++) {
      const v = track.racingLine[(index + k) % n].speed;
      allowed = Math.min(allowed, Math.sqrt(v * v + 2 * BRAKE_DECEL * k * track.spacing));
    }
    return allowed;
  }

  private straightAhead(index: number, metres: number): boolean {
    const { track } = this.sim;
    const steps = Math.round(metres / track.spacing);
    for (let k = 0; k < steps; k++) {
      if (Math.abs(track.samples[(index + k) % track.samples.length].curvature) > STRAIGHT_CURVATURE) return false;
    }
    return true;
  }

  /** Tactical choices, re-evaluated only every `reactionTicks` like a human reaction delay. */
  private decide(): void {
    const { sim, car, rng } = this;
    const profile = this.profile;
    this.nextDecision = sim.tick + profile.reactionTicks;
    this.brakeBias = (rng.next() * 2 - 1) * profile.brakeError;
    this.laneTarget = this.chooseLane();

    if (car.physics.nitro > 35 && this.straightAhead(this.trackIndex(), 120) && car.physics.speed > 15 && rng.chance(profile.nitroSkill)) {
      this.nitroUntil = sim.tick + NITRO_BURST_TICKS;
    }
    this.decideItem();
  }

  private chooseLane(): number {
    const { sim, car } = this;
    const lineOffset = sim.track.racingLine[this.trackIndex()].offset;
    const myLateral = car.lateral;

    // Mines: steer to the other half of the road.
    for (const mine of sim.combat.mines) {
      const location = sim.locator.locate(mine.x, mine.z, car.sampleHint);
      const ahead = this.distanceAhead(location.index);
      if (ahead > 0 && ahead < MINE_AVOID_RANGE && Math.abs(location.lateral - myLateral) < 3) {
        return clamp((location.lateral > 0 ? -LANE_SHIFT : LANE_SHIFT) * 1.4 - lineOffset, -8, 8);
      }
    }

    // Traffic: overtake on the side we are already on (never cut across a rival), more readily when aggressive.
    const limit = sim.track.width / 2 - EDGE_MARGIN;
    for (const other of sim.cars) {
      if (other === car || other.finished || other.physics.ghost) continue;
      const gap = other.progress - car.progress;
      if (gap <= 0 || gap > TRAFFIC_RANGE) continue;
      if (Math.abs(other.lateral - myLateral) > TRAFFIC_WIDTH) continue;
      const crawling = other.physics.speed < SLOW_CAR_SPEED;
      if (!crawling && !this.rng.chance(0.35 + this.profile.aggression * 0.6)) continue;
      let side = myLateral >= other.lateral ? 1 : -1;
      if (Math.abs(other.lateral + side * LANE_SHIFT) > limit) side = -side;
      return clamp(other.lateral + side * LANE_SHIFT - lineOffset, -8, 8);
    }

    // Item boxes: line up with an available one when empty-handed.
    if (!car.item && sim.pickups.length > 0) {
      let bestLateral: number | null = null;
      let bestAhead = Infinity;
      for (const pickup of sim.pickups) {
        if (!pickup.available) continue;
        const spot = sim.track.pickups[pickup.id];
        const ahead = this.distanceAhead(spot.sample);
        if (ahead <= 4 || ahead > PICKUP_SEEK_RANGE) continue;
        const location = sim.locator.locate(spot.x, spot.z, spot.sample);
        const cost = ahead + Math.abs(location.lateral - myLateral) * 4;
        if (cost < bestAhead) {
          bestAhead = cost;
          bestLateral = location.lateral;
        }
      }
      if (bestLateral !== null) return clamp(bestLateral - lineOffset, -8, 8);
    }
    return 0;
  }

  /** Keep the lane target from pushing into a car running alongside. */
  private blockedLane(target: number): number {
    const { sim, car } = this;
    const lineOffset = sim.track.racingLine[this.trackIndex()].offset;
    const desired = lineOffset + target;
    for (const other of sim.cars) {
      if (other === car || other.physics.ghost) continue;
      if (Math.abs(other.progress - car.progress) > ALONGSIDE_LENGTH) continue;
      const between = (desired - car.lateral) * (other.lateral - car.lateral) > 0;
      if (between && Math.abs(other.lateral - car.lateral) < ALONGSIDE_WIDTH) {
        const keep = car.lateral + Math.sign(car.lateral - other.lateral || 1) * 0.5;
        return keep - lineOffset;
      }
    }
    return target;
  }

  private decideItem(): void {
    const { sim, car, rng } = this;
    const kind = car.item;
    if (!kind || this.fireNextTick || sim.tick < car.itemReadyTick) {
      if (!kind) this.itemHeldSince = -1;
      return;
    }
    if (this.itemHeldSince < 0) this.itemHeldSince = sim.tick;
    const skilled = rng.chance(this.profile.itemSkill);
    const heldTooLong = sim.tick - this.itemHeldSince > 60 * (skilled ? 14 : 5);
    let use = false;
    this.fireBackward = false;
    switch (kind) {
      case 'pulse':
        use = this.rivalInFront(70, 0.12);
        if (!use && this.rivalBehind(40)) use = this.fireBackward = true;
        break;
      case 'missile':
        use = this.rivalAhead(WEAPON.missileRange * 0.9);
        if (!use && this.rivalBehind(WEAPON.missileRange * 0.6)) use = this.fireBackward = true;
        break;
      case 'shock':
        use = this.rivalWithin(WEAPON.shockRadius * 0.8);
        break;
      case 'mine':
        // Dropped behind for a chaser (look-back), otherwise thrown onto the road ahead of a leader.
        use = this.fireBackward = this.rivalBehind(35);
        if (!use) use = this.rivalInFront(45, 0.12);
        break;
      case 'shield':
        use = this.threatened() || (!skilled && car.rank === 1);
        break;
      case 'repair':
        use = car.health < car.maxHealth * 0.55;
        break;
      case 'nitro':
        use = car.physics.nitro < 40;
        break;
    }
    // Skilled bots wait for the right moment; clumsy ones fire early or late.
    if ((use && (skilled || rng.chance(0.5))) || heldTooLong) this.fireNextTick = true;
  }

  private rivalInFront(range: number, tolerance: number): boolean {
    const { car, sim } = this;
    const p = car.physics.body.translation();
    const f = car.physics.forward;
    return sim.cars.some((other) => {
      if (other === car || other.finished) return false;
      const q = other.physics.body.translation();
      const dx = q.x - p.x, dz = q.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range || distance < 3) return false;
      const sideways = Math.abs(dx * f.z - dz * f.x) / distance;
      return dx * f.x + dz * f.z > 0 && sideways < tolerance;
    });
  }

  private rivalAhead(range: number): boolean {
    const { car, sim } = this;
    return sim.cars.some((other) => other !== car && !other.finished && other.progress > car.progress && other.progress - car.progress < range);
  }

  private rivalBehind(range: number): boolean {
    const { car, sim } = this;
    return sim.cars.some((other) => other !== car && !other.finished && car.progress - other.progress > 3 && car.progress - other.progress < range);
  }

  private rivalWithin(range: number): boolean {
    const { car, sim } = this;
    const p = car.physics.body.translation();
    return sim.cars.some((other) => {
      if (other === car || other.finished) return false;
      const q = other.physics.body.translation();
      return Math.hypot(q.x - p.x, q.z - p.z) < range;
    });
  }

  private threatened(): boolean {
    const { car, sim } = this;
    const p = car.physics.body.translation();
    return sim.combat.projectiles.some(
      (shot) => shot.owner !== car.id && (shot.target === car.id || Math.hypot(shot.x - p.x, shot.z - p.z) < 30)
    );
  }

  private distanceAhead(sample: number): number {
    const { track } = this.sim;
    const n = track.samples.length;
    const steps = (sample - this.trackIndex() + n) % n;
    return steps <= n / 2 ? steps * track.spacing : (steps - n) * track.spacing;
  }

  /** Reverse out of a wall, turn around when facing backwards, and ask for a reset as a last resort. */
  private recover(): DriveInput | null {
    const { sim, car } = this;
    const physics = car.physics;
    if (sim.tick < this.reverseUntil) return { ...NEUTRAL_INPUT, throttle: -1, steer: this.reverseSteer };

    // Count any standstill, braking included: a queue behind a stopped car must also unjam itself.
    if (physics.speed < STUCK_SPEED && !car.isWrecked(sim.tick) && car.frozenUntil <= sim.tick) this.stuckTicks++;
    else this.stuckTicks = Math.max(0, this.stuckTicks - 2);

    if (this.stuckTicks > STUCK_TICKS) {
      this.stuckTicks = 0;
      this.stuckEvents++;
      if (this.stuckEvents > STUCK_RESETS_BEFORE_RESPAWN) {
        this.stuckEvents = 0;
        this.wantsReset = true;
        return null;
      }
      this.reverseUntil = sim.tick + REVERSE_TICKS;
      this.reverseSteer = car.lateral > 0 ? 1 : -1;
      return { ...NEUTRAL_INPUT, throttle: -1, steer: this.reverseSteer };
    }
    if (physics.speed > 8) this.stuckEvents = 0;

    const sample = sim.track.samples[this.trackIndex()];
    const facing = physics.forward.x * sample.tx + physics.forward.z * sample.tz;
    this.wrongWayTicks = facing < -0.3 ? this.wrongWayTicks + 1 : 0;
    const crawlingBackwards = facing < -0.6 && physics.speed < 4;
    if (this.wrongWayTicks > WRONG_WAY_RESET_TICKS || (crawlingBackwards && this.wrongWayTicks > TURNED_AROUND_RESET_TICKS)) {
      this.wrongWayTicks = 0;
      this.wantsReset = true;
    }
    if (facing < -0.3) {
      const turn = physics.forward.x * sample.tz - physics.forward.z * sample.tx > 0 ? -1 : 1;
      return { ...NEUTRAL_INPUT, throttle: 0.6, steer: turn };
    }
    return null;
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
