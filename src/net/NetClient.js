import { PROTOCOL_VERSION } from '../../shared/constants.ts';

const SESSION_KEY = 'bruno-race:session';
const PING_INTERVAL_MS = 1000;
const CLOCK_SAMPLES = 10;
const RECONNECT_DELAYS = [500, 1000, 2000, 3000, 5000, 5000, 8000];
const CONNECT_TIMEOUT_MS = 6000;
const DEFAULT_PORT = 8787;

/** Where the multiplayer server lives: settings override, then build-time env, then same host on :8787. */
export function serverUrl(settings) {
  const override = settings.get('serverUrl') || import.meta.env.VITE_SERVER_URL || '';
  if (override) return override.replace(/\/$/, '').replace(/^http/, 'ws') + (override.endsWith('/ws') ? '' : '/ws');
  const secure = window.location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${window.location.hostname || 'localhost'}:${DEFAULT_PORT}/ws`;
}

function healthUrl(wsUrl) {
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '/health');
}

/**
 * WebSocket session with clock sync and automatic resume. The resume token lives in sessionStorage
 * (per tab), never in the URL.
 */
export default class NetClient extends EventTarget {
  constructor(settings) {
    super();
    this.settings = settings;
    this.ws = null;
    this.state = 'offline';
    this.playerId = null;
    this.clockOffset = 0;
    this.rtt = 0;
    this.samples = [];
    this.pingTimer = null;
    this.reconnectAttempt = 0;
    this.wantConnected = false;
  }

  get connected() {
    return this.state === 'connected';
  }

  serverNow() {
    return performance.now() + this.clockOffset;
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.dispatchEvent(new CustomEvent('state', { detail: state }));
  }

  storedSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  storeSession(token) {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, url: serverUrl(this.settings) }));
    } catch {
      // Without storage a reload simply starts a fresh session.
    }
  }

  clearSession() {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }

  /** Reachability check before trying a socket, so offline users get a clear message quickly. */
  async checkHealth() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(healthUrl(serverUrl(this.settings)), { signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      return { ok: response.ok && body.ok === true, protocolMatches: body.protocol === PROTOCOL_VERSION };
    } catch {
      return { ok: false, protocolMatches: false };
    } finally {
      clearTimeout(timer);
    }
  }

  connect() {
    this.wantConnected = true;
    if (this.ws && (this.state === 'connected' || this.state === 'connecting')) return this.ready;
    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    this.ready = new Promise((resolve, reject) => {
      const url = serverUrl(this.settings);
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error('Could not reach the multiplayer server.'));
        }
      }, CONNECT_TIMEOUT_MS);

      ws.addEventListener('open', () => {
        const session = this.storedSession();
        if (session?.token && session.url === url) this.sendNow({ type: 'resume', v: PROTOCOL_VERSION, token: session.token });
        else this.sendHello();
      });
      ws.addEventListener('message', (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === 'welcome') {
          this.playerId = message.playerId;
          this.storeSession(message.token);
          this.reconnectAttempt = 0;
          this.setState('connected');
          this.startPinging();
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(message);
          }
        } else if (message.type === 'error' && message.code === 'resume-failed') {
          this.clearSession();
          this.sendHello();
        } else if (message.type === 'pong') {
          this.onPong(message);
        } else if (message.type === 'raceStart') {
          // Kept so a race view created a moment later (e.g. after a reconnect) still gets its clock.
          this.lastRaceStart = message;
        }
        this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
        this.dispatchEvent(new CustomEvent('message', { detail: message }));
      });
      ws.addEventListener('close', () => {
        clearTimeout(timeout);
        this.stopPinging();
        if (this.ws !== ws) return;
        this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error('Could not reach the multiplayer server.'));
        }
        if (this.wantConnected && this.storedSession()) this.scheduleReconnect();
        else this.setState('offline');
      });
    });
    return this.ready;
  }

  sendHello() {
    this.sendNow({ type: 'hello', v: PROTOCOL_VERSION, name: this.settings.get('name'), vehicleId: this.settings.get('vehicleId') });
  }

  scheduleReconnect() {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt += 1;
    this.setState('reconnecting');
    if (this.reconnectAttempt > RECONNECT_DELAYS.length + 3) {
      this.setState('offline');
      this.dispatchEvent(new CustomEvent('gaveUp'));
      return;
    }
    setTimeout(() => {
      if (this.wantConnected && !this.ws) this.connect().catch(() => {});
    }, delay);
  }

  sendNow(message) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  send(message) {
    if (this.state === 'connected') this.sendNow(message);
  }

  startPinging() {
    this.stopPinging();
    this.ping();
    this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL_MS);
  }

  stopPinging() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  ping() {
    this.sendNow({ type: 'ping', t: performance.now() });
  }

  /** NTP-style offset estimate using the lowest-latency recent samples. */
  onPong({ t, serverTime }) {
    const now = performance.now();
    const rtt = now - t;
    this.samples.push({ rtt, offset: serverTime - (t + rtt / 2) });
    if (this.samples.length > CLOCK_SAMPLES) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    this.clockOffset = best.reduce((sum, s) => sum + s.offset, 0) / best.length;
    // Median, not mean: one sample taken while the page was busy (loading a race) must not inflate the shown ping.
    const sorted = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    this.rtt = sorted[Math.floor(sorted.length / 2)];
    this.dispatchEvent(new CustomEvent('latency', { detail: this.rtt }));
  }

  /** Leave for good: tell the server, drop the resume token. */
  disconnect() {
    this.wantConnected = false;
    this.clearSession();
    this.stopPinging();
    this.ws?.close();
    this.ws = null;
    this.setState('offline');
  }
}
