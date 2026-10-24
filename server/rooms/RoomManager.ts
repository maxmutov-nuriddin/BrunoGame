import { now } from '../clock.ts';
import { randomInt } from 'node:crypto';
import { PROTOCOL_VERSION, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type ClientMessage } from '../../shared/net/protocol.ts';
import type { ServerConfig } from '../config.ts';
import Player, { type Transport } from '../Player.ts';
import Room, { type RoomError } from './Room.ts';

const ERROR_TEXT: Record<RoomError | 'not-found' | 'version' | 'resume-failed' | 'no-room' | 'server-full' | 'hello-first' | 'slow-down', string> = {
  'not-host': 'Only the host can do that.',
  'wrong-state': 'Not possible right now.',
  'not-ready': 'Everyone must be ready first.',
  full: 'That room is full.',
  'in-progress': 'A race is in progress in that room.',
  'not-found': 'No room with that code.',
  version: 'Client and server versions differ. Reload the page.',
  'resume-failed': 'Your previous session has expired.',
  'no-room': 'Join or create a room first.',
  'server-full': 'The server has no free rooms right now.',
  'hello-first': 'Say hello first.',
  'too-soon': 'Wait a moment before starting again.',
  'start-failed': 'The race could not be built. Try another track.',
  'slow-down': 'Too many rooms created; wait a few seconds.'
};

/** One player may create at most this many rooms per window. */
const ROOM_CREATE_LIMIT = 3;
const ROOM_CREATE_WINDOW_MS = 60_000;

/** Session handling, room codes and message routing. Holds no game logic itself. */
export default class RoomManager {
  readonly rooms = new Map<string, Room>();
  readonly players = new Map<string, Player>();
  private readonly byToken = new Map<string, Player>();
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  private error(player: Player | Transport, code: keyof typeof ERROR_TEXT): void {
    const message = JSON.stringify({ type: 'error', code, message: ERROR_TEXT[code] });
    if (player instanceof Player) player.sendRaw(message);
    else player.send(message);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Returns the player bound to this transport after the message (new on hello/resume). */
  async handle(transport: Transport, current: Player | null, message: ClientMessage): Promise<Player | null> {
    if (!current) {
      if (message.type === 'hello') return this.hello(transport, message.v, message.name, message.vehicleId);
      if (message.type === 'resume') return this.resume(transport, message.v, message.token);
      this.error(transport, 'hello-first');
      return null;
    }
    const player = current;
    const room = player.room;

    switch (message.type) {
      case 'hello':
      case 'resume':
        return player;
      case 'ping':
        player.send({ type: 'pong', t: message.t, serverTime: now() });
        return player;
      case 'createRoom':
        if (!this.allowCreate(player)) {
          this.error(player, 'slow-down');
          return player;
        }
        if (room) this.leave(player);
        if (this.rooms.size >= this.config.maxRooms) {
          this.error(player, 'server-full');
          return player;
        }
        {
          const code = this.newCode();
          this.rooms.set(code, new Room(code, player, this.config.loadTimeoutMs));
        }
        return player;
      case 'joinRoom': {
        const target = this.rooms.get(message.code);
        if (!target) {
          this.error(player, 'not-found');
          return player;
        }
        if (target === room) return player;
        const problem = target.canJoin();
        if (problem) {
          this.error(player, problem);
          return player;
        }
        if (room) this.leave(player);
        target.add(player);
        return player;
      }
      case 'leaveRoom':
        if (room) this.leave(player);
        player.send({ type: 'left' });
        return player;
      default:
        break;
    }

    if (!room) {
      this.error(player, 'no-room');
      return player;
    }
    let problem: RoomError | null = null;
    switch (message.type) {
      case 'setReady':
        room.setReady(player, message.ready);
        break;
      case 'setVehicle':
        room.setVehicle(player, message.vehicleId);
        player.vehicleId = message.vehicleId;
        break;
      case 'setName':
        room.setName(player, message.name);
        break;
      case 'updateSettings':
        problem = room.updateSettings(player, message.settings);
        break;
      case 'startRace':
        problem = await room.startRace(player);
        break;
      case 'returnToLobby':
        problem = room.returnToLobby(player);
        break;
      case 'loaded':
        room.markLoaded(player, message.raceId);
        break;
      case 'input':
        if (room.state === 'racing') player.queueInputs(message.inputs, room.runner?.sim.tick ?? 0);
        break;
    }
    if (problem) this.error(player, problem);
    return player;
  }

  private readonly roomCreations = new Map<string, number[]>();

  private allowCreate(player: Player): boolean {
    const t = now();
    const recent = (this.roomCreations.get(player.id) ?? []).filter((at) => t - at < ROOM_CREATE_WINDOW_MS);
    if (recent.length >= ROOM_CREATE_LIMIT) return false;
    recent.push(t);
    this.roomCreations.set(player.id, recent);
    return true;
  }

  private hello(transport: Transport, version: number, name: string, vehicleId: string): Player | null {
    if (version !== PROTOCOL_VERSION) {
      this.error(transport, 'version');
      return null;
    }
    const player = new Player(transport, name, vehicleId);
    this.players.set(player.id, player);
    this.byToken.set(player.token, player);
    player.send({ type: 'welcome', v: PROTOCOL_VERSION, playerId: player.id, token: player.token, serverTime: now() });
    return player;
  }

  private resume(transport: Transport, version: number, token: string): Player | null {
    const player = this.byToken.get(token);
    if (version !== PROTOCOL_VERSION || !player) {
      this.error(transport, version !== PROTOCOL_VERSION ? 'version' : 'resume-failed');
      return null;
    }
    player.transport?.close(4000, 'replaced');
    player.transport = transport;
    player.disconnectedAt = -1;
    player.send({ type: 'welcome', v: PROTOCOL_VERSION, playerId: player.id, token: player.token, serverTime: now() });
    if (player.room) player.room.reconnected(player);
    return player;
  }

  private leave(player: Player): void {
    const room = player.room;
    if (!room) return;
    room.remove(player);
    if (room.isEmpty) this.closeRoom(room);
  }

  disconnected(player: Player, transport: Transport): void {
    if (player.transport !== transport) return;
    player.transport = null;
    player.disconnectedAt = now();
    player.room?.disconnected(player);
  }

  private closeRoom(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
  }

  /** Called every few ms: steps races. */
  update(now: number): void {
    for (const room of this.rooms.values()) room.update(now);
  }

  /** Called about once a second: expires disconnected players and empty rooms. */
  sweep(now: number): void {
    for (const player of [...this.players.values()]) {
      if (player.connected || player.disconnectedAt < 0) continue;
      const room = player.room;
      const racing = room && (room.state === 'racing' || room.state === 'loading');
      const grace = racing ? this.config.raceGraceMs : this.config.lobbyGraceMs;
      if (now - player.disconnectedAt < grace) continue;
      if (room && racing) {
        // Past the deadline mid-race: the bot keeps the car going but the human is out (DNF).
        room.runner?.sim.markLeft(player.id);
        continue;
      }
      if (room) this.leave(player);
      this.players.delete(player.id);
      this.byToken.delete(player.token);
      this.roomCreations.delete(player.id);
    }
    for (const room of [...this.rooms.values()]) {
      if (room.isEmpty || room.players.every((p) => !p.connected && now - p.disconnectedAt > this.config.raceGraceMs)) {
        for (const p of room.players) {
          this.players.delete(p.id);
          this.byToken.delete(p.token);
        }
        this.closeRoom(room);
      }
    }
  }

  stats() {
    return { rooms: this.rooms.size, players: this.players.size, racing: [...this.rooms.values()].filter((r) => r.state === 'racing').length };
  }
}
