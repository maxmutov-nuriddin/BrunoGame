import type HostServer from '../../shared/host/HostServer.ts';
import type { HostConnection } from '../../shared/host/HostServer.ts';
import * as THREE from 'three';
import { PROTOCOL_VERSION, type ServerMessage, type WireCar, type RaceSetup } from '../../shared/net/protocol.ts';
import { encodeInput, NEUTRAL_INPUT, type DriveInput } from '../../shared/input.ts';
import { TrackLocator } from '../../shared/track/locator.ts';
import { linePath } from '../../shared/race/linePath.ts';

type Waiter = { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

/**
 * Minimal headless game client for integration tests, linked to a HostServer in memory (the same path a
 * WebRTC data channel takes in the browser). `latencyMs` delays both directions with jitter.
 */
export class TestClient {
  private readonly link: HostConnection;
  open = true;
  closeCode = -1;
  readonly messages: ServerMessage[] = [];
  private waiters: Waiter[] = [];
  token = '';
  playerId = '';
  setup: RaceSetup | null = null;
  latestCars = new Map<string, WireCar>();
  results: unknown = null;
  private seq = 0;
  private drivingTimer: NodeJS.Timeout | null = null;
  private latencyMs: number;

  constructor(host: HostServer, latencyMs = 0, local = false) {
    this.latencyMs = latencyMs;
    this.link = host.connect({
      local,
      send: (text: string) => {
        if (!this.open) return;
        const deliver = () => this.receive(JSON.parse(text) as ServerMessage);
        if (this.latencyMs > 0) setTimeout(deliver, this.jitter());
        else deliver();
      },
      close: (code = 1000) => {
        this.closeCode = code;
        this.close();
      }
    });
  }

  private jitter(): number {
    return this.latencyMs * (0.6 + Math.random() * 0.8);
  }

  private receive(message: ServerMessage): void {
    this.messages.push(message);
    if (message.type === 'welcome') {
      this.token = message.token;
      this.playerId = message.playerId;
    }
    if (message.type === 'raceSetup') this.setup = message.setup;
    if (message.type === 'snapshot') for (const car of message.s.cars) this.latestCars.set(car[0], car);
    if (message.type === 'results') this.results = message.results;
    for (const waiter of [...this.waiters]) {
      if (waiter.match(message)) {
        clearTimeout(waiter.timer);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  }

  send(message: unknown): void {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    if (!this.open) return;
    if (this.latencyMs > 0) setTimeout(() => this.open && this.link.receive(text), this.jitter());
    else this.link.receive(text);
  }

  waitFor<T extends ServerMessage['type']>(type: T, predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeoutMs = 15000): Promise<Extract<ServerMessage, { type: T }>> {
    const existing = this.messages.find((m) => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>));
    if (existing) return Promise.resolve(existing as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({ match: (m) => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>), resolve: resolve as (m: ServerMessage) => void, reject, timer });
    });
  }

  clear(): void {
    this.messages.length = 0;
  }

  async hello(name: string, vehicleId = 'bruno-gt'): Promise<void> {
    this.send({ type: 'hello', v: PROTOCOL_VERSION, name, vehicleId });
    await this.waitFor('welcome');
  }

  sendInput(input: DriveInput, tick = 0): void {
    this.send({ type: 'input', inputs: [encodeInput(this.seq++, tick, input)] });
  }

  /** Simple line-following autopilot fed by server snapshots, sending real inputs at 30 Hz. */
  startDriving(speedFactor = 0.75): void {
    const setup = this.setup!;
    const locator = new TrackLocator(setup.track);
    const path = linePath(setup.track);
    let hint = -1;
    const q = new THREE.Quaternion();
    const forward = new THREE.Vector3();
    this.drivingTimer = setInterval(() => {
      const car = this.latestCars.get(this.playerId);
      if (!car) return this.sendInput(NEUTRAL_INPUT);
      const [, px, , pz, qx, qy, qz, qw, vx, , vz] = car;
      q.set(qx, qy, qz, qw);
      forward.set(0, 0, -1).applyQuaternion(q);
      const loc = locator.locate(px, pz, hint);
      hint = loc.index;
      const n = setup.track.samples.length;
      const ahead = (loc.index + 6) % n;
      const tx = path.x[ahead] - px;
      const tz = path.z[ahead] - pz;
      const angle = Math.atan2(tx * forward.z - tz * forward.x, tx * forward.x + tz * forward.z);
      const speed = Math.hypot(vx, vz);
      const target = setup.track.racingLine[(loc.index + 12) % n].speed * speedFactor;
      this.sendInput({ ...NEUTRAL_INPUT, throttle: speed < target ? 1 : -0.6, steer: Math.max(-1, Math.min(1, angle * 2.5)) });
    }, 33);
  }

  stopDriving(): void {
    if (this.drivingTimer) clearInterval(this.drivingTimer);
    this.drivingTimer = null;
  }

  close(): void {
    this.stopDriving();
    if (!this.open) return;
    this.open = false;
    this.link.closed();
  }
}
