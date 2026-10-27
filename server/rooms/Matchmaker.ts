import { now } from '../clock.ts';
import { MATCH_OFFER_MS } from '../../shared/constants.ts';
import { randomPreset } from '../../shared/track/presets.ts';
import type Player from '../Player.ts';
import type Room from './Room.ts';

interface Offer {
  id: number;
  player: Player;
  room: Room;
  expiresAt: number;
}

export interface MatchmakerHost {
  /** Every public room the server currently has. */
  publicRooms(): Room[];
  /** Create and register an empty public room; null when the server has no room left. */
  createPublicRoom(trackSeed: string, trackName: string): Room | null;
  /** Take the player out of whatever room they are in. */
  leaveRoom(player: Player): void;
}

/**
 * Quick play. A searching player is offered a seat in a random open public room (a new one when none
 * has space). The seat is held for MATCH_OFFER_MS: accepting joins the room, letting it lapse gives
 * the seat back and ends that player's search. Rooms lock when their race starts (see Room).
 */
export default class Matchmaker {
  private readonly searching = new Set<Player>();
  private readonly offers = new Map<number, Offer>();
  private nextOfferId = 1;
  private readonly host: MatchmakerHost;

  constructor(host: MatchmakerHost) {
    this.host = host;
  }

  join(player: Player): void {
    if (player.room) this.host.leaveRoom(player);
    this.searching.add(player);
    player.send({ type: 'queueStatus', searching: true });
    if (!this.offerFor(player)) this.offer(player);
  }

  leave(player: Player): void {
    this.dropOffer(player);
    if (this.searching.delete(player)) player.send({ type: 'queueStatus', searching: false });
  }

  /** Accept a held seat. A seat that vanished meanwhile (room started or closed) becomes a fresh offer. */
  accept(player: Player, offerId: number): void {
    const offer = this.offers.get(offerId);
    if (!offer || offer.player !== player) return;
    this.offers.delete(offerId);
    offer.room.reserved -= 1;
    const { room } = offer;
    if (room.closed || room.canJoin() !== null || room.players.length >= room.settings.maxPlayers) {
      player.send({ type: 'matchExpired', offerId });
      this.offer(player);
      return;
    }
    this.searching.delete(player);
    player.send({ type: 'queueStatus', searching: false });
    room.add(player, true);
  }

  /** Lapsed offers free their seat; the player who let it lapse stops searching. */
  update(time: number): void {
    for (const offer of [...this.offers.values()]) {
      if (time < offer.expiresAt) continue;
      this.offers.delete(offer.id);
      offer.room.reserved -= 1;
      this.searching.delete(offer.player);
      offer.player.send({ type: 'matchExpired', offerId: offer.id });
      offer.player.send({ type: 'queueStatus', searching: false });
    }
  }

  /** A player who disconnects or leaves the server is out of the queue. */
  forget(player: Player): void {
    this.dropOffer(player);
    this.searching.delete(player);
  }

  stats() {
    return { searching: this.searching.size, offers: this.offers.size };
  }

  private offerFor(player: Player): Offer | undefined {
    return [...this.offers.values()].find((offer) => offer.player === player);
  }

  private dropOffer(player: Player): void {
    const offer = this.offerFor(player);
    if (!offer) return;
    this.offers.delete(offer.id);
    offer.room.reserved -= 1;
  }

  private offer(player: Player): void {
    const open = this.host.publicRooms().filter((room) => room.freeSeats > 0);
    let room: Room | null = open.length > 0 ? open[Math.floor(Math.random() * open.length)] : null;
    if (!room) {
      const preset = randomPreset();
      room = this.host.createPublicRoom(preset.seed, preset.name);
    }
    if (!room) {
      this.searching.delete(player);
      player.send({ type: 'queueStatus', searching: false });
      player.send({ type: 'error', code: 'server-full', message: 'The server has no free rooms right now.' });
      return;
    }
    room.reserved += 1;
    const offer: Offer = { id: this.nextOfferId++, player, room, expiresAt: now() + MATCH_OFFER_MS };
    this.offers.set(offer.id, offer);
    player.send({
      type: 'matchFound', offerId: offer.id, expiresAt: offer.expiresAt,
      players: room.players.length, maxPlayers: room.settings.maxPlayers, trackName: room.settings.trackName
    });
  }
}
