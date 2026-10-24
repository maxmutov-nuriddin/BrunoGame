import * as THREE from 'three';
import RaceSimulation from '../../shared/race/RaceSimulation.ts';
import { FIXED_DT } from '../../shared/constants.ts';
import { RAPIER, STATIC_QUERY_GROUPS } from '../../shared/physics/rapier.ts';
import { carFlags } from '../../shared/net/snapshot.ts';
import { CarFrame, flagsFromBits } from './frames.js';

const MAX_STEPS_PER_FRAME = 5;

/** Solo race or time trial: the authoritative simulation runs right here in the browser (works offline). */
export default class LocalRaceSession {
  static async create(config, localId) {
    const sim = await RaceSimulation.create(config);
    return new LocalRaceSession(sim, config, localId);
  }

  constructor(sim, config, localId) {
    this.kind = 'local';
    this.sim = sim;
    this.config = config;
    this.localId = localId;
    this.track = config.track;
    this.goTick = sim.goTick;
    this.accumulator = 0;
    this.paused = false;
    this.events = [];
    this.frames = new Map(config.participants.map((p) => [p.id, new CarFrame(p, p.id === localId)]));
    this.previous = new Map();
    this.capturePrevious();
    this.ended = false;
  }

  get tick() {
    return this.sim.tick;
  }

  get phase() {
    return this.sim.phase;
  }

  /** Interpolated tick for smooth countdown display. */
  get displayTick() {
    return this.sim.tick + this.accumulator / FIXED_DT;
  }

  setPaused(paused) {
    this.paused = paused;
  }

  capturePrevious() {
    for (const car of this.sim.cars) {
      const p = car.physics.body.translation();
      const q = car.physics.body.rotation();
      this.previous.set(car.id, { p: new THREE.Vector3(p.x, p.y, p.z), q: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    }
  }

  update(dt, input) {
    if (this.paused || this.ended) return;
    this.accumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.capturePrevious();
      this.sim.setInput(this.localId, input, this.sim.tick);
      this.sim.step();
      for (const event of this.sim.events) this.events.push({ k: this.sim.tick - 1, e: event });
      this.accumulator -= FIXED_DT;
      steps += 1;
      if (this.sim.phase === 'finished') {
        this.ended = true;
        break;
      }
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Car frames interpolated between the last two physics ticks. */
  readFrames() {
    const alpha = Math.min(1, this.accumulator / FIXED_DT);
    for (const car of this.sim.cars) {
      const frame = this.frames.get(car.id);
      const body = car.physics.body;
      const p = body.translation();
      const q = body.rotation();
      const v = body.linvel();
      const prev = this.previous.get(car.id);
      frame.position.set(p.x, p.y, p.z);
      frame.quaternion.set(q.x, q.y, q.z, q.w);
      if (prev && !this.paused) {
        frame.position.lerpVectors(prev.p, frame.position, alpha);
        frame.quaternion.slerpQuaternions(prev.q, frame.quaternion, alpha);
      }
      frame.velocity.set(v.x, v.y, v.z);
      frame.refresh();
      frame.steer = car.physics.steerValue;
      frame.health = car.health;
      frame.nitro = car.physics.nitro;
      frame.item = car.item;
      frame.flags = flagsFromBits(carFlags(this.sim, car));
      frame.lapsCompleted = car.lapsCompleted;
      frame.nextCheckpoint = car.nextCheckpoint;
      frame.lastCheckpoint = car.lastCheckpoint;
      frame.rank = car.rank;
      frame.progress = car.progress;
      frame.bestLapTicks = car.bestLapTicks;
      frame.lastLapTicks = car.lapTicks.at(-1) ?? -1;
      frame.finishTicks = car.finished ? car.finishTick - this.sim.goTick : -1;
      frame.wheels = [0, 1, 2, 3].map((i) => car.physics.wheelPose(i));
    }
    return this.frames;
  }

  readWorld() {
    const combat = this.sim.combat;
    return {
      taken: new Set(this.sim.pickups.filter((p) => !p.available).map((p) => p.id)),
      projectiles: combat.projectiles,
      mines: combat.mines.map((m) => ({ id: m.id, x: m.x, y: m.y, z: m.z, armed: this.sim.tick >= m.armTick }))
    };
  }

  /** Static-world ray for camera wall avoidance. */
  raycast(origin, direction, maxDistance) {
    const ray = new RAPIER.Ray(origin, direction);
    const hit = this.sim.physics.world.castRay(ray, maxDistance, true, undefined, STATIC_QUERY_GROUPS);
    return hit ? hit.timeOfImpact : null;
  }

  results() {
    return this.sim.results();
  }

  dispose() {
    this.sim.dispose();
  }
}
