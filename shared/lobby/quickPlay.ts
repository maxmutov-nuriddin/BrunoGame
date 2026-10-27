import { MATCH_OFFER_MS } from '../constants.ts';
import { freeSeats, type LobbyDirectory, type LobbyEntry } from './directory.ts';

export interface MatchOffer {
  code: string;
  hostId: string;
  trackName: string;
  players: number;
  maxPlayers: number;
  /** Wall-clock ms the held seat lapses. */
  expiresAt: number;
}

export type QuickPlayEvent =
  /** A seat is held; the player must press Ready (accept) before it lapses. */
  | { kind: 'offer'; offer: MatchOffer }
  /** The offer lapsed without Ready; the search has stopped. */
  | { kind: 'expired'; offer: MatchOffer }
  /** Nothing to join: this player should host a public room for others to find. */
  | { kind: 'host' };

/**
 * Quick-play matching against the lobby directory. Rules: an open public room with a free seat is offered
 * with that seat held for MATCH_OFFER_MS; Ready (accept) within that time sends the player to the host,
 * otherwise the seat is released and the search stops. With nothing to join, the player hosts.
 */
export default class QuickPlay {
  private offer: MatchOffer | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly offerMs: number;

  constructor(
    private readonly directory: LobbyDirectory,
    private readonly peerId: string,
    private readonly emit: (event: QuickPlayEvent) => void,
    { offerMs = MATCH_OFFER_MS }: { offerMs?: number } = {}
  ) {
    this.offerMs = offerMs;
  }

  /** Look for a seat; ends in an `offer` or a `host` event. */
  async search(): Promise<void> {
    await this.cancel();
    const now = Date.now();
    const candidates = (await this.directory.listOpen()).filter((entry) => entry.hostId !== this.peerId && freeSeats(entry, now, this.peerId) > 0);
    // Random order spreads searchers over rooms instead of piling onto the first one.
    for (const entry of shuffle(candidates)) {
      const expiresAt = Date.now() + this.offerMs;
      if (!(await this.directory.reserve(entry.code, this.peerId, expiresAt, Date.now()))) continue;
      this.hold(entry, expiresAt);
      return;
    }
    this.emit({ kind: 'host' });
  }

  private hold(entry: LobbyEntry, expiresAt: number): void {
    const offer: MatchOffer = { code: entry.code, hostId: entry.hostId, trackName: entry.trackName, players: entry.players, maxPlayers: entry.maxPlayers, expiresAt };
    this.offer = offer;
    this.timer = setTimeout(() => void this.lapse(offer), Math.max(0, expiresAt - Date.now()));
    this.emit({ kind: 'offer', offer });
  }

  private async lapse(offer: MatchOffer): Promise<void> {
    if (this.offer !== offer) return;
    this.offer = null;
    this.timer = null;
    await this.directory.release(offer.code, this.peerId);
    this.emit({ kind: 'expired', offer });
  }

  /** Ready pressed: returns where to connect, or null when there is no live offer. The seat stays held until `joined`. */
  accept(): MatchOffer | null {
    const offer = this.offer;
    if (!offer || Date.now() >= offer.expiresAt) return null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.offer = null;
    return offer;
  }

  /** The host has seated us (or the attempt failed): drop the hold so the seat is counted only once. */
  async joined(code: string): Promise<void> {
    await this.directory.release(code, this.peerId);
  }

  /** Stop searching and give back any held seat. */
  async cancel(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const offer = this.offer;
    this.offer = null;
    if (offer) await this.directory.release(offer.code, this.peerId);
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
