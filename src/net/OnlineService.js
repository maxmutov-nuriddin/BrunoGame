import QuickPlay from '../../shared/lobby/quickPlay.ts';
import { backendKind, getBackend } from './backend/index.js';
import HostSession from './p2p/HostSession.js';
import { dialHost } from './p2p/PeerLink.js';

/**
 * Serverless online play. Whoever creates a room hosts it in their own browser (HostSession); others
 * find it in the lobby directory and link to it peer-to-peer. The game talks to `game.net` (NetClient)
 * exactly as it did with a dedicated server; this class only decides where that link goes.
 */
export default class OnlineService extends EventTarget {
  constructor(net, settings) {
    super();
    this.net = net;
    this.settings = settings;
    this.host = null;
    this.quick = null;
  }

  /** 'firebase', 'local' (dev, same browser only) or 'none'. */
  get kind() {
    return backendKind();
  }

  get available() {
    return this.kind !== 'none';
  }

  get hosting() {
    return this.host !== null;
  }

  backend() {
    return getBackend();
  }

  async greet() {
    await this.net.connect();
    this.net.send({ type: 'setName', name: this.settings.get('name') });
    this.net.send({ type: 'setVehicle', vehicleId: this.settings.get('vehicleId') });
  }

  /** Host a room here: a private one (friends, by code) or a public quick-play one. */
  async hostRoom(isPublic) {
    await this.leave();
    const backend = await this.backend();
    this.host = await HostSession.start(backend);
    const host = this.host;
    this.net.useLink(() => host.localLink(), `host:${backend.peerId}:${Date.now()}`);
    await this.greet();
    this.net.send({ type: isPublic ? 'createPublicRoom' : 'createRoom' });
  }

  /** Join a friend's room by its code. */
  async joinByCode(code) {
    await this.leave();
    const backend = await this.backend();
    const entry = await backend.directory.get(code);
    if (!entry) throw new Error('No room with that code (it may have closed).');
    this.linkTo(backend, entry.hostId, code);
    await this.greet();
    this.net.send({ type: 'joinRoom', code });
  }

  /** Link to a host; a room that has left the directory is reported as gone instead of retried. */
  linkTo(backend, hostId, code) {
    this.net.useLink(async () => {
      if (!(await backend.directory.get(code))) throw Object.assign(new Error('The host has left the game.'), { fatal: true });
      return dialHost(backend, hostId, code);
    }, `peer:${hostId}:${code}`);
  }

  /** After a reload: a guest goes back to the same host with its resume token. */
  async resume(key) {
    const [kind, hostId, code] = String(key).split(':');
    if (kind !== 'peer' || !hostId || !code) throw new Error('Nothing to resume.');
    this.linkTo(await this.backend(), hostId, code);
    await this.net.connect();
  }

  /**
   * Quick play. `emit` receives QuickPlay events: 'offer' (press Ready before it lapses), 'expired', and
   * 'host' (nobody to join, so this browser opens a public room and waits for players).
   */
  async startQuickPlay(emit) {
    await this.leave();
    const backend = await this.backend();
    this.quick = new QuickPlay(backend.directory, backend.peerId, (event) => {
      if (event.kind === 'host') void this.hostRoom(true).catch((error) => emit({ kind: 'error', message: error.message }));
      emit(event);
    });
    await this.quick.search();
  }

  /** Ready pressed on a quick-play offer. */
  async acceptOffer() {
    const offer = this.quick?.accept();
    if (!offer) throw new Error('That match is no longer available.');
    const backend = await this.backend();
    try {
      this.linkTo(backend, offer.hostId, offer.code);
      await this.greet();
      this.net.send({ type: 'joinPublic', code: offer.code });
    } finally {
      void this.quick?.joined(offer.code);
    }
  }

  async cancelQuickPlay() {
    await this.quick?.cancel();
    this.quick = null;
  }

  /** Leave whatever we are in: guests drop their link, a host closes the room for everyone. */
  async leave() {
    await this.cancelQuickPlay();
    // Say goodbye first, so the host frees the seat now instead of after the reconnect grace period.
    if (this.net.connected && !this.host) this.net.send({ type: 'leaveRoom' });
    if (this.net.link || this.net.dial) this.net.disconnect();
    this.host?.dispose();
    this.host = null;
  }
}
