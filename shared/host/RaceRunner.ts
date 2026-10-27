import { SNAPSHOT_EVERY_TICKS, TICK_RATE } from '../constants.ts';
import RaceSimulation from '../race/RaceSimulation.ts';
import { baseSnapshot, privateState } from '../net/snapshot.ts';
import type Player from './Player.ts';

const TICK_MS = 1000 / TICK_RATE;
/** Never simulate more than this many ticks per update; a stalled process skips rather than spirals. */
const MAX_CATCH_UP = 10;
const START_DELAY_MS = 400;

/** Owns one authoritative race: steps the simulation in real time and streams snapshots. */
export default class RaceRunner {
  readonly raceId: number;
  readonly sim: RaceSimulation;
  readonly loaded = new Set<string>();
  tick0At = -1;
  private pendingEvents: { k: number; e: unknown }[] = [];
  private readonly players: () => Player[];

  constructor(raceId: number, sim: RaceSimulation, players: () => Player[]) {
    this.raceId = raceId;
    this.sim = sim;
    this.players = players;
  }

  get started(): boolean {
    return this.tick0At >= 0;
  }

  start(now: number): number {
    this.tick0At = now + START_DELAY_MS;
    return this.tick0At;
  }

  /** Advance to wall-clock `now`. Returns true once the race has finished. */
  update(now: number): boolean {
    if (!this.started || now < this.tick0At) return false;
    const target = Math.floor((now - this.tick0At) / TICK_MS);
    let steps = 0;
    while (this.sim.tick < target && steps < MAX_CATCH_UP && this.sim.phase !== 'finished') {
      this.feedInputs();
      this.sim.step();
      for (const event of this.sim.events) this.pendingEvents.push({ k: this.sim.tick - 1, e: event });
      steps += 1;
      if (this.sim.tick % SNAPSHOT_EVERY_TICKS === 0 || this.isFinished()) this.broadcast();
    }
    // A long stall would leave the sim permanently behind; re-anchor the clock instead of fast-forwarding.
    if (this.sim.tick < target - MAX_CATCH_UP) this.tick0At = now - this.sim.tick * TICK_MS;
    return this.isFinished();
  }

  private isFinished(): boolean {
    return this.sim.phase === 'finished';
  }

  private feedInputs(): void {
    for (const player of this.players()) {
      const entry = player.nextInput();
      if (!entry) continue;
      this.sim.setInput(player.id, entry.input, entry.tick, entry.receivedTick ?? this.sim.tick);
      player.ack = entry.seq;
    }
  }

  broadcast(): void {
    const serverTime = this.tick0At + this.sim.tick * TICK_MS;
    const base = baseSnapshot(this.sim, serverTime, this.pendingEvents);
    this.pendingEvents = [];
    for (const player of this.players()) {
      if (!player.connected) continue;
      const car = this.sim.carsById.get(player.id);
      const snapshot = { ...base, ack: player.ack, me: car ? privateState(car) : null };
      player.sendRaw(JSON.stringify({ type: 'snapshot', s: snapshot }));
    }
  }

  /** Full state for a reconnecting player, sent straight away. */
  snapshotFor(player: Player): string {
    const serverTime = this.tick0At + this.sim.tick * TICK_MS;
    const car = this.sim.carsById.get(player.id);
    const snapshot = { ...baseSnapshot(this.sim, serverTime, []), ack: player.ack, me: car ? privateState(car) : null };
    return JSON.stringify({ type: 'snapshot', s: snapshot });
  }

  dispose(): void {
    this.sim.dispose();
  }
}
