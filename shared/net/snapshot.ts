import type RaceSimulation from '../race/RaceSimulation.ts';
import type RaceCar from '../race/RaceCar.ts';
import { CAR_FLAG, type WireCar, type WireSnapshot } from './protocol.ts';

const r3 = (value: number) => Math.round(value * 1000) / 1000;
const r2 = (value: number) => Math.round(value * 100) / 100;

export function carFlags(sim: RaceSimulation, car: RaceCar): number {
  const p = car.physics;
  return (
    (p.drifting ? CAR_FLAG.DRIFTING : 0) |
    (p.nitroActive ? CAR_FLAG.NITRO : 0) |
    (car.hasShield(sim.tick) ? CAR_FLAG.SHIELD : 0) |
    (p.ghost ? CAR_FLAG.GHOST : 0) |
    (car.isWrecked(sim.tick) ? CAR_FLAG.WRECKED : 0) |
    (car.finished ? CAR_FLAG.FINISHED : 0) |
    (car.dnf ? CAR_FLAG.DNF : 0) |
    (car.wrongWay ? CAR_FLAG.WRONG_WAY : 0) |
    (car.connected ? CAR_FLAG.CONNECTED : 0) |
    (car.isBotDriven ? CAR_FLAG.BOT_DRIVEN : 0) |
    (p.braking ? CAR_FLAG.BRAKING : 0) |
    (p.grounded ? CAR_FLAG.GROUNDED : 0)
  );
}

export function wireCar(sim: RaceSimulation, car: RaceCar): WireCar {
  const b = car.physics.body;
  const p = b.translation();
  const q = b.rotation();
  const v = b.linvel();
  const w = b.angvel();
  return [
    car.id, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r3(v.x), r3(v.y), r3(v.z), r3(w.x), r3(w.y), r3(w.z),
    r2(car.health), r2(car.physics.nitro), carFlags(sim, car), car.item ?? '', car.lapsCompleted, car.nextCheckpoint, car.rank,
    r2(car.progress), r3(car.physics.steerValue), car.lastCheckpoint
  ];
}

/** Shared part of a snapshot; `ack` and `me` are filled per recipient. */
export function baseSnapshot(sim: RaceSimulation, serverTime: number, events: { k: number; e: unknown }[]): WireSnapshot {
  return {
    k: sim.tick,
    st: Math.round(serverTime),
    ph: sim.phase,
    ack: -1,
    cars: sim.cars.map((car) => wireCar(sim, car)),
    me: null,
    pr: sim.combat.projectiles.map((shot) => [shot.id, shot.kind, r2(shot.x), r2(shot.y), r2(shot.z), r2(shot.vx), r2(shot.vz)]),
    mn: sim.combat.mines.map((mine) => [mine.id, r2(mine.x), r2(mine.y), r2(mine.z), sim.tick >= mine.armTick ? 1 : 0]),
    pk: sim.pickups.filter((pickup) => !pickup.available).map((pickup) => pickup.id),
    ev: events
  };
}

export function privateState(car: RaceCar): number[] {
  const p = car.physics.getState();
  return [r3(p.engineForce), r3(p.steerValue), r3(p.driftTime), r3(p.driftCharge), r3(p.jumpCooldown), p.prevJump ? 1 : 0];
}
