/**
 * The lobby directory lists rooms that players host in their own browsers, so others can find them:
 * by code (friends) or by browsing open public rooms (quick play). Firestore backs it in production;
 * tests and same-browser development use in-memory or BroadcastChannel versions with the same contract.
 */
export interface LobbyEntry {
  /** Room code (also the directory key). */
  code: string;
  /** Peer id of the hosting browser: where guests send their connection offer. */
  hostId: string;
  isPublic: boolean;
  /** Public and still in the lobby: quick play may offer seats. */
  open: boolean;
  players: number;
  maxPlayers: number;
  trackName: string;
  /** Wall-clock ms of the host's last heartbeat; stale entries are ignored. */
  updatedAt: number;
  /** Seats held by match offers: peer id → expiry (wall-clock ms). */
  reservations: Record<string, number>;
}

export interface LobbyDirectory {
  get(code: string): Promise<LobbyEntry | null>;
  /** Open public rooms, freshest first (may include stale ones; callers filter). */
  listOpen(): Promise<LobbyEntry[]>;
  /** Host: create or replace its own entry. */
  publish(entry: LobbyEntry): Promise<void>;
  /** Host: change some fields of its own entry. */
  update(code: string, patch: Partial<Omit<LobbyEntry, 'code' | 'hostId' | 'reservations'>>): Promise<void>;
  remove(code: string): Promise<void>;
  /**
   * Atomically hold one seat for `peerId` until `expiresAt`, if the room is still open and has a free seat
   * at `now`. Returns false when it does not.
   */
  reserve(code: string, peerId: string, expiresAt: number, now: number): Promise<boolean>;
  release(code: string, peerId: string): Promise<void>;
}

/** A host that has not refreshed its entry for this long is treated as gone. */
export const LOBBY_STALE_MS = 30_000;
/** Hosts refresh `updatedAt` this often. */
export const LOBBY_HEARTBEAT_MS = 10_000;

export const activeReservations = (entry: LobbyEntry, now: number, except = ''): number =>
  Object.entries(entry.reservations).filter(([peer, until]) => peer !== except && until > now).length;

/** Seats quick play may still offer in this room at `now`. */
export function freeSeats(entry: LobbyEntry, now: number, except = ''): number {
  if (!entry.isPublic || !entry.open || now - entry.updatedAt > LOBBY_STALE_MS) return 0;
  return entry.maxPlayers - entry.players - activeReservations(entry, now, except);
}

/** Reference implementation: used by tests and as the model for the other backends. */
export class MemoryDirectory implements LobbyDirectory {
  private readonly entries = new Map<string, LobbyEntry>();

  async get(code: string): Promise<LobbyEntry | null> {
    const entry = this.entries.get(code);
    return entry ? structuredClone(entry) : null;
  }

  async listOpen(): Promise<LobbyEntry[]> {
    return [...this.entries.values()].filter((e) => e.isPublic && e.open).sort((a, b) => b.updatedAt - a.updatedAt).map((e) => structuredClone(e));
  }

  async publish(entry: LobbyEntry): Promise<void> {
    this.entries.set(entry.code, structuredClone(entry));
  }

  async update(code: string, patch: Partial<LobbyEntry>): Promise<void> {
    const entry = this.entries.get(code);
    if (entry) this.entries.set(code, { ...entry, ...structuredClone(patch) });
  }

  async remove(code: string): Promise<void> {
    this.entries.delete(code);
  }

  async reserve(code: string, peerId: string, expiresAt: number, now: number): Promise<boolean> {
    const entry = this.entries.get(code);
    if (!entry || freeSeats(entry, now, peerId) <= 0) return false;
    entry.reservations = { ...entry.reservations, [peerId]: expiresAt };
    return true;
  }

  async release(code: string, peerId: string): Promise<void> {
    const entry = this.entries.get(code);
    if (!entry) return;
    const { [peerId]: _dropped, ...rest } = entry.reservations;
    entry.reservations = rest;
  }
}
