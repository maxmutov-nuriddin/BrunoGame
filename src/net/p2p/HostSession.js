import HostServer from '../../../shared/host/HostServer.ts';
import { LOBBY_HEARTBEAT_MS } from '../../../shared/lobby/directory.ts';
import { ICE_SERVERS, RELAY_CHUNK_CHARS, RELIABLE, createReceiver, gatherIce, sendOver, splitMessage } from './channels.js';

/**
 * Timers in a worker keep firing at full rate when the host's tab is in the background, where page
 * timers are throttled to once a second (which would freeze every guest's race).
 */
function workerTicker(intervalMs, fn) {
  try {
    const source = 'let id; onmessage = (e) => { clearInterval(id); id = setInterval(() => postMessage(0), e.data); };';
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = fn;
    worker.postMessage(intervalMs);
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = setInterval(fn, intervalMs);
    return () => clearInterval(id);
  }
}

/**
 * This browser hosts the game: the authoritative HostServer runs here, guests connect over WebRTC (or
 * the mailbox relay), the host player connects through an in-page loopback link, and the room is listed
 * in the lobby directory while it exists.
 */
export default class HostSession {
  static async start(backend) {
    const server = await HostServer.create();
    server.start(workerTicker);
    return new HostSession(backend, server);
  }

  constructor(backend, server) {
    this.backend = backend;
    this.server = server;
    /** sid → { peer, conn, pc } */
    this.guests = new Map();
    this.entry = null;
    this.disposed = false;
    this.stopListening = backend.mailbox.listen((from, mail) => this.onMail(from, mail));
    this.heartbeat = setInterval(() => this.beat(), LOBBY_HEARTBEAT_MS);
  }

  get code() {
    return this.entry?.code ?? null;
  }

  onMail(from, mail) {
    if (!mail || typeof mail.sid !== 'string' || this.disposed) return;
    if (mail.t === 'offer' || mail.t === 'relay') {
      if (mail.code !== this.code) {
        this.backend.mailbox.send(from, { t: 'reject', sid: mail.sid, reason: 'That room has closed.' });
        return;
      }
      if (mail.t === 'offer') void this.acceptDirect(from, mail).catch((error) => console.warn('[host] direct link failed', error));
      else this.acceptRelay(from, mail.sid);
      return;
    }
    const guest = this.guests.get(mail.sid);
    if (!guest || guest.peer !== from) return;
    if (mail.t === 'r' && typeof mail.d === 'string') guest.receiveRelayed?.(mail.d);
    else if (mail.t === 'bye') this.drop(mail.sid);
  }

  async acceptDirect(from, { sid, sdp }) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const guest = { peer: from, pc, conn: null };
    this.guests.set(sid, guest);
    const channels = {};
    pc.addEventListener('datachannel', ({ channel }) => {
      channels[channel.label] = channel;
      const receive = createReceiver((text) => guest.conn?.receive(text));
      channel.addEventListener('message', (event) => receive(event.data));
      if (channel.label !== RELIABLE) return;
      channel.addEventListener('open', () => {
        guest.conn = this.server.connect({
          send: (text) => sendOver(channels, text),
          close: () => this.drop(sid, true)
        });
      });
      channel.addEventListener('close', () => this.drop(sid));
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(sid);
    });
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gatherIce(pc);
    this.backend.mailbox.send(from, { t: 'answer', sid, sdp: pc.localDescription.sdp });
  }

  acceptRelay(from, sid) {
    // A guest whose direct attempt timed out may still have a half-open peer connection here.
    this.guests.get(sid)?.pc?.close();
    const guest = { peer: from, pc: null, conn: null, receiveRelayed: null };
    this.guests.set(sid, guest);
    guest.receiveRelayed = createReceiver((text) => guest.conn?.receive(text));
    guest.conn = this.server.connect({
      send: (text) => {
        for (const piece of splitMessage(text, RELAY_CHUNK_CHARS)) this.backend.mailbox.send(from, { t: 'r', sid, d: piece });
      },
      close: () => this.drop(sid, true)
    });
    this.backend.mailbox.send(from, { t: 'relay-ok', sid });
  }

  drop(sid, notify = false) {
    const guest = this.guests.get(sid);
    if (!guest) return;
    this.guests.delete(sid);
    if (notify) this.backend.mailbox.send(guest.peer, { t: 'bye', sid });
    guest.pc?.close();
    guest.conn?.closed();
  }

  /** The host player's own link: same messages as a guest's, without the network. */
  localLink() {
    const link = { kind: 'local', onmessage: () => {}, onclose: () => {} };
    let open = true;
    const conn = this.server.connect({
      local: true,
      send: (text) => {
        if (!open) return;
        if (text.startsWith('{"type":"room"')) this.publishRoom(JSON.parse(text));
        queueMicrotask(() => open && link.onmessage(text));
      },
      close: () => link.close()
    });
    link.send = (text) => open && conn.receive(text);
    link.close = () => {
      if (!open) return;
      open = false;
      conn.closed();
      link.onclose();
    };
    return Promise.resolve(link);
  }

  /** Keep the directory entry in step with the room the host player sits in. */
  publishRoom(room) {
    const fields = {
      isPublic: room.public,
      // Public rooms take players until their race starts (late joiners during the countdown too).
      open: room.public && room.state === 'lobby',
      players: room.players.length,
      maxPlayers: room.settings.maxPlayers,
      trackName: room.settings.trackName,
      updatedAt: Date.now()
    };
    if (this.entry?.code === room.code) {
      const changed = Object.keys(fields).some((key) => key !== 'updatedAt' && fields[key] !== this.entry[key]);
      this.entry = { ...this.entry, ...fields };
      if (changed) void this.backend.directory.update(room.code, fields).catch((error) => console.warn('[host] directory update failed', error));
      return;
    }
    if (this.entry) void this.backend.directory.remove(this.entry.code).catch(() => {});
    this.entry = { code: room.code, hostId: this.backend.peerId, ...fields, reservations: {} };
    void this.backend.directory.publish(this.entry).catch((error) => console.warn('[host] directory publish failed', error));
  }

  beat() {
    if (!this.entry) return;
    this.entry.updatedAt = Date.now();
    void this.backend.directory.update(this.entry.code, { updatedAt: this.entry.updatedAt }).catch(() => {});
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.heartbeat);
    for (const sid of [...this.guests.keys()]) this.drop(sid, true);
    this.stopListening();
    if (this.entry) void this.backend.directory.remove(this.entry.code).catch(() => {});
    this.entry = null;
    this.server.dispose();
  }
}
