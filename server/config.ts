export interface ServerConfig {
  port: number;
  host: string;
  /** Origins allowed to open a WebSocket. Empty means "any" (development only). */
  allowedOrigins: string[];
  /** Grace before a disconnected lobby player is removed. */
  lobbyGraceMs: number;
  /** Grace before a disconnected racer is ruled DNF (a bot keeps driving meanwhile). */
  raceGraceMs: number;
  /** Max time to wait for every client to report its track is built. */
  loadTimeoutMs: number;
  maxRooms: number;
  messagesPerSecond: number;
  messageBurst: number;
  /** Simultaneous sockets allowed from one IP address. */
  maxConnectionsPerIp: number;
  /** Trust X-Forwarded-For (only behind your own reverse proxy). */
  trustProxy: boolean;
}

const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: number(env.PORT, 8787),
    host: env.HOST ?? '0.0.0.0',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    lobbyGraceMs: number(env.LOBBY_GRACE_MS, 20_000),
    raceGraceMs: number(env.RACE_GRACE_MS, 60_000),
    loadTimeoutMs: number(env.LOAD_TIMEOUT_MS, 20_000),
    maxRooms: number(env.MAX_ROOMS, 200),
    messagesPerSecond: number(env.MESSAGES_PER_SECOND, 90),
    messageBurst: number(env.MESSAGE_BURST, 180),
    maxConnectionsPerIp: number(env.MAX_CONNECTIONS_PER_IP, 12),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true'
  };
}
