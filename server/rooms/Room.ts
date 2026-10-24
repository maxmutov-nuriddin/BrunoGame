import { now } from '../clock.ts';
import { trackForSeed } from '../../shared/track/presets.ts';
import RaceSimulation, { type RaceResult } from '../../shared/race/RaceSimulation.ts';
import type { ParticipantConfig } from '../../shared/race/RaceCar.ts';
import { createRng } from '../../shared/rng.ts';
import { VEHICLES } from '../../shared/vehicles.ts';
import { DEFAULT_ROOM_SETTINGS, type LobbyPlayer, type RaceSetup, type RoomSettings, type RoomState } from '../../shared/net/protocol.ts';
import type Player from '../Player.ts';
import RaceRunner from './RaceRunner.ts';

export type RoomError = 'not-host' | 'wrong-state' | 'not-ready' | 'full' | 'in-progress' | 'too-soon' | 'start-failed';

/** Minimum gap between race starts in one room (track generation runs on the shared server thread). */
const START_COOLDOWN_MS = 3000;

const BOT_NAMES = ['Vex', 'Ronan', 'Kira', 'Taro', 'Mila', 'Juno', 'Axel', 'Nadia', 'Orion', 'Suki'];

/**
 * One private room: lobby, loading, racing and results. The host only steers lobby settings;
 * the race itself runs here on the server, independent of any browser.
 */
export default class Room {
  readonly code: string;
  settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  readonly players: Player[] = [];
  hostId: string;
  state: RoomState = 'lobby';
  runner: RaceRunner | null = null;
  results: RaceResult[] | null = null;
  private raceCounter = 0;
  private lastStartAt = -Infinity;
  closed = false;
  private loadingSince = -1;
  private readonly loadTimeoutMs: number;

  constructor(code: string, host: Player, loadTimeoutMs: number) {
    this.code = code;
    this.hostId = host.id;
    this.loadTimeoutMs = loadTimeoutMs;
    this.add(host);
  }

  get isEmpty(): boolean {
    return this.players.length === 0;
  }

  get botSlots(): number {
    return this.settings.fillBots ? Math.max(0, this.settings.maxPlayers - this.players.length) : 0;
  }

  canJoin(): RoomError | null {
    if (this.state === 'loading' || this.state === 'racing') return 'in-progress';
    if (this.players.length >= this.settings.maxPlayers) return 'full';
    return null;
  }

  add(player: Player): void {
    player.room = this;
    player.ready = false;
    player.name = this.uniqueName(player.name, player);
    this.players.push(player);
    this.broadcastRoom();
  }

  /** Permanent departure. In a race a bot finishes the car and the player is recorded as DNF. */
  remove(player: Player): void {
    const index = this.players.indexOf(player);
    if (index < 0) return;
    this.players.splice(index, 1);
    player.room = null;
    player.ready = false;
    this.runner?.sim.markLeft(player.id);
    if (this.hostId === player.id) this.transferHost();
    this.broadcastRoom();
  }

  private transferHost(): void {
    const next = this.players.find((p) => p.connected) ?? this.players[0];
    if (next) this.hostId = next.id;
  }

  private uniqueName(name: string, self: Player): string {
    const taken = new Set(this.players.filter((p) => p !== self).map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, 13)}#${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  setReady(player: Player, ready: boolean): void {
    if (this.state !== 'lobby' && this.state !== 'finished') return;
    player.ready = ready;
    this.broadcastRoom();
  }

  setVehicle(player: Player, vehicleId: string): void {
    if (this.state !== 'lobby' && this.state !== 'finished') return;
    player.vehicleId = vehicleId;
    this.broadcastRoom();
  }

  setName(player: Player, name: string): void {
    if (this.state !== 'lobby' && this.state !== 'finished') return;
    player.name = this.uniqueName(name, player);
    this.broadcastRoom();
  }

  updateSettings(player: Player, settings: Partial<RoomSettings>): RoomError | null {
    if (player.id !== this.hostId) return 'not-host';
    if (this.state !== 'lobby' && this.state !== 'finished') return 'wrong-state';
    this.settings = { ...this.settings, ...settings };
    if (this.settings.maxPlayers < this.players.length) this.settings.maxPlayers = this.players.length;
    this.broadcastRoom();
    return null;
  }

  returnToLobby(player: Player): RoomError | null {
    if (player.id !== this.hostId) return 'not-host';
    if (this.state !== 'finished') return 'wrong-state';
    this.state = 'lobby';
    this.broadcastRoom();
    return null;
  }

  /** Host starts (or rematches) once every other connected player is ready. */
  async startRace(player: Player): Promise<RoomError | null> {
    if (player.id !== this.hostId) return 'not-host';
    if (this.state !== 'lobby' && this.state !== 'finished') return 'wrong-state';
    const racers = this.players.filter((p) => p.connected);
    if (racers.some((p) => p.id !== this.hostId && !p.ready)) return 'not-ready';
    if (now() - this.lastStartAt < START_COOLDOWN_MS) return 'too-soon';
    this.lastStartAt = now();

    const previousState = this.state;
    this.state = 'loading';
    this.loadingSince = now();
    this.results = null;
    const raceId = ++this.raceCounter;
    const seed = `${this.code}-${raceId}-${this.settings.trackSeed}`;
    let sim: RaceSimulation;
    let participants: ParticipantConfig[];
    let track;
    try {
      track = { ...trackForSeed(this.settings.trackSeed), name: this.settings.trackName };
      participants = this.buildParticipants(racers, seed);
      racers.forEach((p) => p.resetRaceState());
      sim = await RaceSimulation.create({ track, laps: this.settings.laps, mode: 'race', itemsEnabled: this.settings.itemsEnabled, participants, seed });
    } catch (error) {
      console.error(`[room ${this.code}] could not build race`, error);
      this.state = previousState;
      this.broadcastRoom();
      return 'start-failed';
    }
    // The room may have emptied or been closed while the race was being built.
    if (this.closed || this.state !== 'loading') {
      sim.dispose();
      return null;
    }
    this.runner?.dispose();
    this.runner = new RaceRunner(raceId, sim, () => this.players);
    // Anyone who disconnected while we built the race starts bot-driven.
    for (const p of racers) if (!p.connected) sim.setConnected(p.id, false);

    for (const p of racers) {
      const setup: RaceSetup = { raceId, track, laps: this.settings.laps, itemsEnabled: this.settings.itemsEnabled, participants, seed, youId: p.id };
      p.send({ type: 'raceSetup', setup });
    }
    this.broadcastRoom();
    return null;
  }

  private buildParticipants(racers: Player[], seed: string): ParticipantConfig[] {
    const rng = createRng(`${seed}|grid`);
    const humans: ParticipantConfig[] = racers.map((p) => ({ id: p.id, name: p.name, vehicleId: p.vehicleId, kind: 'human' }));
    const botCount = this.settings.fillBots ? Math.max(0, this.settings.maxPlayers - humans.length) : 0;
    const names = [...BOT_NAMES];
    const bots: ParticipantConfig[] = Array.from({ length: botCount }, (_, i) => {
      const name = names.splice(Math.floor(rng.next() * names.length), 1)[0] ?? `Bot ${i + 1}`;
      return { id: `bot${i + 1}`, name, vehicleId: rng.pick(VEHICLES).id, kind: 'bot', difficulty: this.settings.botDifficulty };
    });
    // Seeded shuffle of the grid so pole position is not always the host.
    const all = [...humans, ...bots];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }

  markLoaded(player: Player, raceId: number): void {
    if (this.state !== 'loading' || !this.runner || this.runner.raceId !== raceId) return;
    this.runner.loaded.add(player.id);
    this.maybeStart(now());
  }

  private maybeStart(now: number): void {
    if (!this.runner || this.state !== 'loading') return;
    const waiting = this.players.filter((p) => p.connected && this.runner!.sim.carsById.has(p.id) && !this.runner!.loaded.has(p.id));
    if (waiting.length > 0 && now - this.loadingSince < this.loadTimeoutMs) return;
    const tick0At = this.runner.start(now);
    this.state = 'racing';
    for (const p of this.players) p.send({ type: 'raceStart', raceId: this.runner.raceId, tick0At, goTick: this.runner.sim.goTick });
    this.broadcastRoom();
  }

  update(now: number): void {
    if (this.state === 'loading') this.maybeStart(now);
    if (this.state !== 'racing' || !this.runner) return;
    const finished = this.runner.update(now);
    if (!finished) return;
    this.results = this.runner.sim.results();
    for (const p of this.players) p.send({ type: 'results', raceId: this.runner.raceId, results: this.results });
    this.runner.dispose();
    this.runner = null;
    this.state = 'finished';
    for (const p of this.players) p.ready = false;
    this.broadcastRoom();
  }

  disconnected(player: Player): void {
    this.runner?.sim.setConnected(player.id, false);
    if (player.id === this.hostId && this.state !== 'racing' && this.state !== 'loading') this.transferHostIfOthersConnected();
    this.broadcastRoom();
  }

  private transferHostIfOthersConnected(): void {
    const next = this.players.find((p) => p.connected);
    if (next) this.hostId = next.id;
  }

  /** A returning player gets the room, the race setup and a full snapshot straight away. */
  reconnected(player: Player): void {
    // The client restarts its input sequence when it rebuilds the race.
    player.resetRaceState();
    this.runner?.sim.setConnected(player.id, true);
    this.broadcastRoom();
    if (!this.runner) return;
    const car = this.runner.sim.carsById.get(player.id);
    if (!car) return;
    const { sim } = this.runner;
    const setup: RaceSetup = {
      raceId: this.runner.raceId, track: sim.track, laps: sim.config.laps, itemsEnabled: sim.config.itemsEnabled,
      participants: sim.config.participants, seed: sim.config.seed, youId: player.id
    };
    player.send({ type: 'raceSetup', setup });
    if (this.runner.started) {
      player.send({ type: 'raceStart', raceId: this.runner.raceId, tick0At: this.runner.tick0At, goTick: sim.goTick });
      player.sendRaw(this.runner.snapshotFor(player));
    }
  }

  lobbyPlayers(): LobbyPlayer[] {
    return this.players.map((p) => ({ id: p.id, name: p.name, vehicleId: p.vehicleId, ready: p.ready, connected: p.connected, host: p.id === this.hostId }));
  }

  broadcastRoom(): void {
    const players = this.lobbyPlayers();
    for (const p of this.players) {
      p.send({ type: 'room', code: this.code, state: this.state, settings: this.settings, players, botSlots: this.botSlots, youId: p.id, results: this.results });
    }
  }

  dispose(): void {
    this.closed = true;
    this.runner?.dispose();
    this.runner = null;
  }
}
