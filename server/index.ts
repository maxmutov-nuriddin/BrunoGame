import { now } from './clock.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, parseClientMessage } from '../shared/net/protocol.ts';
import { GENERATOR_VERSION } from '../shared/constants.ts';
import { loadRapier } from '../shared/physics/rapier.ts';
import { loadConfig, type ServerConfig } from './config.ts';
import RoomManager from './rooms/RoomManager.ts';
import type Player from './Player.ts';

const UPDATE_INTERVAL_MS = 4;
const SWEEP_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const ABUSE_LIMIT = 50;
/** Sockets that never introduce themselves are closed after this long. */
const HELLO_TIMEOUT_MS = 10_000;

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

/** Token bucket per connection: excess messages are dropped; sustained abuse closes the socket. */
class RateLimiter {
  private tokens: number;
  private last = performance.now();
  strikes = 0;
  constructor(private readonly rate: number, private readonly burst: number) {
    this.tokens = burst;
  }
  take(): boolean {
    const now = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) {
      this.strikes += 1;
      return false;
    }
    this.tokens -= 1;
    return true;
  }
}

function originAllowed(config: ServerConfig, origin: string | undefined): boolean {
  if (config.allowedOrigins.length === 0) return true;
  return origin !== undefined && config.allowedOrigins.includes(origin);
}

function handleHttp(manager: RoomManager, config: ServerConfig, req: IncomingMessage, res: ServerResponse, startedAt: number): void {
  const origin = req.headers.origin;
  if (origin && originAllowed(config, origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, generator: GENERATOR_VERSION, uptime: Math.round((performance.now() - startedAt) / 1000), ...manager.stats() }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

export async function startServer(config: ServerConfig = loadConfig()): Promise<RunningServer> {
  await loadRapier();
  const manager = new RoomManager(config);
  const startedAt = performance.now();
  const http = createServer((req, res) => handleHttp(manager, config, req, res, startedAt));
  // Only the one-off race setup (full track) is big enough to be worth compressing; snapshots stay raw.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: { threshold: 16 * 1024 } });
  const alive = new WeakMap<WebSocket, boolean>();

  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/ws' || !originAllowed(config, req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const connectionsPerIp = new Map<string, number>();
  const clientIp = (req: IncomingMessage) => {
    const forwarded = config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    return forwarded || req.socket.remoteAddress || 'unknown';
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = clientIp(req);
    const open = connectionsPerIp.get(ip) ?? 0;
    if (open >= config.maxConnectionsPerIp) {
      ws.close(1008, 'too many connections');
      return;
    }
    connectionsPerIp.set(ip, open + 1);
    let player: Player | null = null;
    const helloTimer = setTimeout(() => {
      if (!player) ws.close(1008, 'hello timeout');
    }, HELLO_TIMEOUT_MS);
    const limiter = new RateLimiter(config.messagesPerSecond, config.messageBurst);
    alive.set(ws, true);
    const transport = {
      send: (text: string) => {
        if (ws.readyState === ws.OPEN) ws.send(text);
      },
      close: (code?: number, reason?: string) => ws.close(code, reason)
    };
    // Serialize async handling so one client's messages stay in order.
    let chain = Promise.resolve();
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      if (isBinary || !limiter.take()) {
        if (limiter.strikes > ABUSE_LIMIT) ws.close(1008, 'rate limit');
        return;
      }
      const message = parseClientMessage(data.toString());
      if (!message) {
        transport.send(JSON.stringify({ type: 'error', code: 'bad-message', message: 'Malformed message.' }));
        return;
      }
      chain = chain
        .then(async () => {
          player = await manager.handle(transport, player, message);
        })
        .catch((error) => console.error('[server] message failed', error));
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      const remaining = (connectionsPerIp.get(ip) ?? 1) - 1;
      if (remaining <= 0) connectionsPerIp.delete(ip);
      else connectionsPerIp.set(ip, remaining);
      if (player) manager.disconnected(player, transport);
    });
    ws.on('error', (error) => console.warn('[server] socket error', error.message));
  });

  const updateTimer = setInterval(() => manager.update(now()), UPDATE_INTERVAL_MS);
  const sweepTimer = setInterval(() => manager.sweep(now()), SWEEP_INTERVAL_MS);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  await new Promise<void>((resolve) => http.listen(config.port, config.host, resolve));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : config.port;

  return {
    port,
    manager,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(updateTimer);
        clearInterval(sweepTimer);
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        for (const room of manager.rooms.values()) room.dispose();
        wss.close();
        http.close(() => resolve());
      })
  };
}
