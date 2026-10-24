import { MAX_LAPS, MAX_PLAYERS, PROTOCOL_VERSION } from '../constants.ts';
import { decodeInput, type DriveInput, type WireInput } from '../input.ts';
import { isVehicleId } from '../vehicles.ts';
import { isBotDifficulty, type BotDifficulty } from '../race/botProfiles.ts';
import { normalizeSeedCode } from '../rng.ts';
import type { RaceResult } from '../race/RaceSimulation.ts';
import type { TrackDefinition } from '../track/types.ts';
import type { ParticipantConfig } from '../race/RaceCar.ts';

export { PROTOCOL_VERSION };

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_INPUTS_PER_MESSAGE = 6;
export const MAX_MESSAGE_BYTES = 8 * 1024;
const NAME_PATTERN = /^[\p{L}\p{N} _.\-]{1,16}$/u;

export type RoomState = 'lobby' | 'loading' | 'racing' | 'finished';

export interface RoomSettings {
  trackSeed: string;
  trackName: string;
  laps: number;
  botDifficulty: BotDifficulty;
  fillBots: boolean;
  itemsEnabled: boolean;
  maxPlayers: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = Object.freeze({
  trackSeed: 'SUNSET',
  trackName: 'Sunset Loop',
  laps: 3,
  botDifficulty: 'normal',
  fillBots: true,
  itemsEnabled: true,
  maxPlayers: 8
});

export interface LobbyPlayer {
  id: string;
  name: string;
  vehicleId: string;
  ready: boolean;
  connected: boolean;
  host: boolean;
}

/** Messages a client may send. Everything else is rejected. */
export type ClientMessage =
  | { type: 'hello'; v: number; name: string; vehicleId: string }
  | { type: 'resume'; v: number; token: string }
  | { type: 'createRoom' }
  | { type: 'joinRoom'; code: string }
  | { type: 'leaveRoom' }
  | { type: 'setReady'; ready: boolean }
  | { type: 'setVehicle'; vehicleId: string }
  | { type: 'setName'; name: string }
  | { type: 'updateSettings'; settings: Partial<RoomSettings> }
  | { type: 'startRace' }
  | { type: 'loaded'; raceId: number }
  | { type: 'input'; inputs: { seq: number; tick: number; input: DriveInput }[] }
  | { type: 'ping'; t: number }
  | { type: 'returnToLobby' };

export interface RaceSetup {
  raceId: number;
  track: TrackDefinition;
  laps: number;
  itemsEnabled: boolean;
  participants: ParticipantConfig[];
  seed: string;
  youId: string;
}

/** Messages the server sends. */
export type ServerMessage =
  | { type: 'welcome'; v: number; playerId: string; token: string; serverTime: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'room'; code: string; state: RoomState; settings: RoomSettings; players: LobbyPlayer[]; botSlots: number; youId: string; results: RaceResult[] | null }
  | { type: 'raceSetup'; setup: RaceSetup }
  | { type: 'raceStart'; raceId: number; tick0At: number; goTick: number }
  | { type: 'snapshot'; s: WireSnapshot }
  | { type: 'results'; raceId: number; results: RaceResult[] }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'left' };

export interface WireSnapshot {
  /** Sim tick this snapshot describes. */
  k: number;
  /** Server time (ms) at which this tick was simulated. */
  st: number;
  ph: 'countdown' | 'racing' | 'finished';
  /** Last input sequence the server applied for the recipient. */
  ack: number;
  cars: WireCar[];
  /** Recipient's own car internals for prediction: [engineForce, steerValue, driftTime, driftCharge, jumpCooldown, prevJump(0/1)]. */
  me: number[] | null;
  pr: [number, string, number, number, number, number, number][];
  mn: [number, number, number, number, number][];
  /** Ids of item boxes currently taken. */
  pk: number[];
  ev: { k: number; e: unknown }[];
}

/** [id, px,py,pz, qx,qy,qz,qw, vx,vy,vz, wx,wy,wz, health, nitro, flags, item, lapsCompleted, nextCheckpoint, rank, progress, steer, lastCheckpoint] */
export type WireCar = [
  string, number, number, number, number, number, number, number, number, number, number, number, number, number,
  number, number, number, string, number, number, number, number, number, number
];

export const CAR_FLAG = Object.freeze({
  DRIFTING: 1,
  NITRO: 2,
  SHIELD: 4,
  GHOST: 8,
  WRECKED: 16,
  FINISHED: 32,
  DNF: 64,
  WRONG_WAY: 128,
  CONNECTED: 256,
  BOT_DRIVEN: 512,
  BRAKING: 1024,
  GROUNDED: 2048
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  return NAME_PATTERN.test(name) ? name : null;
}

export function isRoomCode(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length === ROOM_CODE_LENGTH && [...raw].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

export function sanitizeSettings(raw: unknown): Partial<RoomSettings> | null {
  if (!isObject(raw)) return null;
  const out: Partial<RoomSettings> = {};
  if ('trackSeed' in raw) {
    const seed = normalizeSeedCode(raw.trackSeed);
    if (seed.length < 3) return null;
    out.trackSeed = seed;
  }
  if ('trackName' in raw) {
    if (typeof raw.trackName !== 'string' || raw.trackName.length > 32) return null;
    out.trackName = raw.trackName.replace(/[^\p{L}\p{N} '\-]/gu, '').trim() || 'Custom Circuit';
  }
  if ('laps' in raw) {
    if (!isInt(raw.laps, 1, MAX_LAPS)) return null;
    out.laps = raw.laps;
  }
  if ('botDifficulty' in raw) {
    if (!isBotDifficulty(raw.botDifficulty)) return null;
    out.botDifficulty = raw.botDifficulty;
  }
  if ('fillBots' in raw) {
    if (typeof raw.fillBots !== 'boolean') return null;
    out.fillBots = raw.fillBots;
  }
  if ('itemsEnabled' in raw) {
    if (typeof raw.itemsEnabled !== 'boolean') return null;
    out.itemsEnabled = raw.itemsEnabled;
  }
  if ('maxPlayers' in raw) {
    if (!isInt(raw.maxPlayers, 2, MAX_PLAYERS)) return null;
    out.maxPlayers = raw.maxPlayers;
  }
  return out;
}

/** Strict parser for untrusted client messages. Returns null for anything malformed. */
export function parseClientMessage(text: string): ClientMessage | null {
  if (text.length > MAX_MESSAGE_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || typeof raw.type !== 'string') return null;

  switch (raw.type) {
    case 'hello': {
      const name = sanitizeName(raw.name);
      if (!isInt(raw.v, 0, 1000) || !name || !isVehicleId(raw.vehicleId)) return null;
      return { type: 'hello', v: raw.v, name, vehicleId: raw.vehicleId };
    }
    case 'resume':
      if (!isInt(raw.v, 0, 1000) || typeof raw.token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(raw.token)) return null;
      return { type: 'resume', v: raw.v, token: raw.token };
    case 'createRoom':
    case 'leaveRoom':
    case 'startRace':
    case 'returnToLobby':
      return { type: raw.type };
    case 'joinRoom': {
      const code = typeof raw.code === 'string' ? raw.code.toUpperCase().trim() : '';
      return isRoomCode(code) ? { type: 'joinRoom', code } : null;
    }
    case 'setReady':
      return typeof raw.ready === 'boolean' ? { type: 'setReady', ready: raw.ready } : null;
    case 'setVehicle':
      return isVehicleId(raw.vehicleId) ? { type: 'setVehicle', vehicleId: raw.vehicleId } : null;
    case 'setName': {
      const name = sanitizeName(raw.name);
      return name ? { type: 'setName', name } : null;
    }
    case 'updateSettings': {
      const settings = sanitizeSettings(raw.settings);
      return settings ? { type: 'updateSettings', settings } : null;
    }
    case 'loaded':
      return isInt(raw.raceId, 0, 2 ** 31) ? { type: 'loaded', raceId: raw.raceId } : null;
    case 'ping':
      return typeof raw.t === 'number' && Number.isFinite(raw.t) ? { type: 'ping', t: raw.t } : null;
    case 'input': {
      if (!Array.isArray(raw.inputs) || raw.inputs.length === 0 || raw.inputs.length > MAX_INPUTS_PER_MESSAGE) return null;
      const inputs = [];
      for (const wire of raw.inputs) {
        const decoded = decodeInput(wire as WireInput);
        if (!decoded) return null;
        inputs.push(decoded);
      }
      return { type: 'input', inputs };
    }
    default:
      return null;
  }
}
