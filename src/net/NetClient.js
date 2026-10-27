import { PROTOCOL_VERSION } from '../../shared/constants.ts';

/** Clock corrections are eased in at this rate (ms per ms, i.e. 5 %); larger jumps than CLOCK_SNAP_MS apply at once. */
const CLOCK_SLEW = 0.05;
const CLOCK_SNAP_MS = 250;

const SESSION_KEY = 'bruno-race:session';
const PING_INTERVAL_MS = 1000;
const CLOCK_SAMPLES = 10;
/** A host that is gone for good (tab closed) should be given up quickly. */
const RECONNECT_DELAYS = [500, 1000, 2000, 3000, 5000];
const CONNECT_TIMEOUT_MS = 20_000;

/**
 * A session with the game host over any link: the in-page loopback when this browser hosts, otherwise
 * a WebRTC data channel or the mailbox relay (see src/net/p2p). Clock sync and automatic resume work the
 * same for all of them. The resume token lives in sessionStorage (per tab), never in a URL.
 */
export default class NetClient extends EventTarget {
  constructor(settings) {
    super();
    this.settings = settings;
    this.link = null;
    /** () => Promise<link>; set with useLink before connecting. */
    this.dial = null;
    this.linkKey = '';
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

  /**
   * Server clock, slewed: a new offset estimate is eased in instead of applied at once, so the local
   * simulation never jumps a tick forward or back when a ping sample lands. Big errors snap.
   */
  serverNow() {
    const now = performance.now();
    const elapsed = now - (this.lastClockRead ?? now);
    this.lastClockRead = now;
    const diff = this.clockOffset - (this.appliedOffset ?? this.clockOffset);
    if (this.appliedOffset === undefined || Math.abs(diff) > CLOCK_SNAP_MS) this.appliedOffset = this.clockOffset;
    else this.appliedOffset += Math.max(-elapsed * CLOCK_SLEW, Math.min(elapsed * CLOCK_SLEW, diff));
    return now + this.appliedOffset;
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

  /** Where the next connect goes. `key` names the host (resume tokens only work with the same one). */
  useLink(dial, key) {
    this.dial = dial;
    this.linkKey = key;
  }

  /** How the current link travels: 'local', 'direct' or 'relay' (null when not linked). */
  get linkKind() {
    return this.link?.kind ?? null;
  }

  storeSession(token) {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, key: this.linkKey }));
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

  connect() {
    this.wantConnected = true;
    if (this.link && (this.state === 'connected' || this.state === 'connecting')) return this.ready;
    if (!this.dial) return Promise.reject(new Error('Not linked to a game host.'));
    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const key = this.linkKey;
    this.ready = new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.link?.close();
        reject(new Error('Could not reach the game host.'));
      }, CONNECT_TIMEOUT_MS);
      const failed = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('Could not reach the game host.'));
      };

      this.dial().then((link) => {
        if (settled || this.linkKey !== key) {
          link.close();
          return;
        }
        this.link = link;
        link.onmessage = (text) => {
          let message;
          try {
            message = JSON.parse(text);
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
        };
        link.onclose = () => {
          this.stopPinging();
          if (this.link !== link) return;
          this.link = null;
          failed(new Error('The connection to the host closed.'));
          if (this.wantConnected && this.storedSession()?.key === key) this.scheduleReconnect();
          else this.setState('offline');
        };
        const session = this.storedSession();
        if (session?.token && session.key === key) this.sendNow({ type: 'resume', v: PROTOCOL_VERSION, token: session.token });
        else this.sendHello();
      }, (error) => {
        failed(error);
        if (error?.fatal) {
          this.wantConnected = false;
          this.clearSession();
          this.setState('offline');
          this.dispatchEvent(new CustomEvent('gaveUp', { detail: error.message }));
        } else if (this.wantConnected && this.reconnectAttempt > 0) this.scheduleReconnect();
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
      if (this.wantConnected && !this.link) this.connect().catch(() => {});
    }, delay);
  }

  sendNow(message) {
    this.link?.send(JSON.stringify(message));
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

  /** Leave for good: close the link, drop the resume token. */
  disconnect() {
    this.wantConnected = false;
    this.clearSession();
    this.stopPinging();
    const link = this.link;
    this.link = null;
    link?.close();
    this.dial = null;
    this.linkKey = '';
    this.setState('offline');
  }
}
