export interface HostConfig {
  /** Grace before a disconnected lobby player is removed. */
  lobbyGraceMs: number;
  /** Grace before a disconnected racer is ruled DNF (a bot keeps driving meanwhile). */
  raceGraceMs: number;
  /** Max time to wait for every client to report its track is built. */
  loadTimeoutMs: number;
  maxRooms: number;
  messagesPerSecond: number;
  messageBurst: number;
}

/** Defaults for a host running in a player's browser. */
export const DEFAULT_HOST_CONFIG: Readonly<HostConfig> = Object.freeze({
  lobbyGraceMs: 20_000,
  raceGraceMs: 60_000,
  loadTimeoutMs: 20_000,
  maxRooms: 2,
  messagesPerSecond: 90,
  messageBurst: 180
});
