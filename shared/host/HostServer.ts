import { now } from './clock.ts';
import { parseClientMessage } from '../net/protocol.ts';
import { loadRapier } from '../physics/rapier.ts';
import { DEFAULT_HOST_CONFIG, type HostConfig } from './config.ts';
import RoomManager from './RoomManager.ts';
import type Player from './Player.ts';
import type { Transport } from './Player.ts';

const UPDATE_INTERVAL_MS = 4;
const SWEEP_INTERVAL_MS = 1000;
const ABUSE_LIMIT = 50;

/** Calls `fn` every `intervalMs` until the returned function is called. Browsers pass a worker-driven one. */
export type Ticker = (intervalMs: number, fn: () => void) => () => void;

const intervalTicker: Ticker = (intervalMs, fn) => {
  const id = setInterval(fn, intervalMs);
  return () => clearInterval(id);
};

/** One remote (or local) player's link into the host. */
export interface HostConnection {
  /** A text message arrived from this player. */
  receive(text: string): void;
  /** The link is gone (closed or failed). */
  closed(): void;
}

/** Token bucket per connection: excess messages are dropped; sustained abuse closes the link. */
class RateLimiter {
  private tokens: number;
  private last = performance.now();
  strikes = 0;
  constructor(private readonly rate: number, private readonly burst: number) {
    this.tokens = burst;
  }
  take(): boolean {
    const time = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + ((time - this.last) / 1000) * this.rate);
    this.last = time;
    if (this.tokens < 1) {
      this.strikes += 1;
      return false;
    }
    this.tokens -= 1;
    return true;
  }
}

/**
 * The authoritative game host, independent of how players connect: a player's browser runs it for
 * peer-to-peer play (WebRTC or relay links), tests run it with in-memory links. Every message is
 * validated with the same strict parser a public server would use, since guests are untrusted.
 */
export default class HostServer {
  readonly manager: RoomManager;
  private readonly config: HostConfig;
  private stopTimers: (() => void)[] = [];

  private constructor(config: HostConfig) {
    this.config = config;
    this.manager = new RoomManager(config);
  }

  static async create(config: Partial<HostConfig> = {}): Promise<HostServer> {
    await loadRapier();
    return new HostServer({ ...DEFAULT_HOST_CONFIG, ...config });
  }

  /** Begin stepping rooms and races. */
  start(ticker: Ticker = intervalTicker): void {
    this.stop();
    this.stopTimers = [
      ticker(UPDATE_INTERVAL_MS, () => this.manager.update(now())),
      ticker(SWEEP_INTERVAL_MS, () => this.manager.sweep(now()))
    ];
  }

  stop(): void {
    for (const stop of this.stopTimers) stop();
    this.stopTimers = [];
  }

  /** Attach a player link. Messages are handled strictly in arrival order. */
  connect(transport: Transport): HostConnection {
    const limiter = new RateLimiter(this.config.messagesPerSecond, this.config.messageBurst);
    let player: Player | null = null;
    let chain = Promise.resolve();
    return {
      receive: (text: string) => {
        if (!limiter.take()) {
          if (limiter.strikes > ABUSE_LIMIT) transport.close(1008, 'rate limit');
          return;
        }
        const message = parseClientMessage(text);
        if (!message) {
          transport.send(JSON.stringify({ type: 'error', code: 'bad-message', message: 'Malformed message.' }));
          return;
        }
        chain = chain
          .then(async () => {
            player = await this.manager.handle(transport, player, message);
          })
          .catch((error) => console.error('[host] message failed', error));
      },
      closed: () => {
        chain = chain.then(() => {
          if (player) this.manager.disconnected(player, transport);
        });
      }
    };
  }

  dispose(): void {
    this.stop();
    for (const room of this.manager.rooms.values()) room.dispose();
    this.manager.rooms.clear();
  }
}
