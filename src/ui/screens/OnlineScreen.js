import { html, onAction, $ } from '../dom.js';
import { escapeHtml } from '../format.js';
import { sanitizeName } from '../../../shared/net/protocol.ts';
import { MATCH_MIN_PLAYERS } from '../../../shared/constants.ts';

const COUNTDOWN_REFRESH_MS = 200;

/**
 * Quick play: press Start to search, a found match must be accepted with "Ready" within its time limit,
 * then the game switches to the public room. Missing the limit stops the search (Start to look again).
 */
export default class OnlineScreen {
  constructor(game, { onBack, autoStart = false }) {
    this.game = game;
    this.offer = null;
    this.el = html(`
      <section class="screen online">
        <header class="screen__header">
          <button class="btn btn--ghost" data-act="back">← Back</button>
          <h2>Play Online</h2>
        </header>
        <div class="panel online__panel">
          <label class="field">Your name <input data-name maxlength="16" autocomplete="nickname" /></label>
          <p class="muted">Random opponents, random map. A race starts once ${MATCH_MIN_PLAYERS} players are in (up to 8).</p>
          <p class="status-line" data-status></p>
          <div class="online__actions">
            <button class="btn btn--primary btn--big" data-act="start">Start</button>
            <button class="btn btn--big" data-act="cancel" hidden>Cancel search</button>
          </div>
        </div>
        <div class="match-offer" data-offer hidden>
          <div class="panel match-offer__panel">
            <h3>Match found!</h3>
            <p data-offer-info></p>
            <div class="match-offer__timer"><i data-offer-bar></i></div>
            <p class="match-offer__seconds" data-offer-seconds></p>
            <button class="btn btn--primary btn--big" data-act="accept">Ready</button>
          </div>
        </div>
      </section>`);
    this.nameInput = $(this.el, '[data-name]');
    this.nameInput.value = game.settings.get('name');
    onAction(this.el, {
      back: () => {
        this.cancel();
        onBack();
      },
      start: () => this.start(),
      cancel: () => this.cancel(),
      accept: () => this.accept()
    }, (act) => game.audio.play(act === 'back' || act === 'cancel' ? 'uiBack' : 'ui'));

    this.listeners = {
      queueStatus: (event) => this.setSearching(event.detail.searching),
      matchFound: (event) => this.showOffer(event.detail),
      matchExpired: (event) => this.offerExpired(event.detail.offerId)
    };
    for (const [type, listener] of Object.entries(this.listeners)) game.net.addEventListener(type, listener);
    game.screens.appendChild(this.el);
    this.setSearching(false);
    this.setStatus(navigator.onLine ? 'Press Start to find a race.' : 'You are offline. Online races need internet.', !navigator.onLine);
    if (autoStart) this.start();
  }

  setStatus(text, bad = false) {
    const status = $(this.el, '[data-status]');
    status.textContent = text;
    status.classList.toggle('is-bad', bad);
  }

  setSearching(searching) {
    this.searching = searching;
    $(this.el, '[data-act="start"]').hidden = searching;
    $(this.el, '[data-act="cancel"]').hidden = !searching;
    if (searching && !this.offer) this.setStatus('Searching for a race…');
  }

  async start() {
    const name = sanitizeName(this.nameInput.value);
    if (!name) return this.setStatus('Names: 1–16 letters, digits, space, _ . -', true);
    this.game.settings.set('name', name);
    this.setStatus('Connecting…');
    try {
      await this.game.net.connect();
      this.game.net.send({ type: 'setName', name });
      this.game.net.send({ type: 'setVehicle', vehicleId: this.game.settings.get('vehicleId') });
      this.game.net.send({ type: 'queueJoin' });
    } catch (error) {
      this.setStatus(`${error.message} Is the multiplayer server running?`, true);
    }
  }

  cancel() {
    if (this.searching || this.offer) this.game.net.send({ type: 'queueLeave' });
    this.hideOffer();
    this.setSearching(false);
  }

  showOffer(offer) {
    this.offer = offer;
    $(this.el, '[data-offer-info]').innerHTML = `<b>${escapeHtml(offer.trackName)}</b> · ${offer.players}/${offer.maxPlayers} players in the room`;
    $(this.el, '[data-offer]').hidden = false;
    $(this.el, '[data-act="accept"]').disabled = false;
    this.game.audio.play('countdown');
    const total = Math.max(1, offer.expiresAt - this.game.net.serverNow());
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const left = Math.max(0, offer.expiresAt - this.game.net.serverNow());
      $(this.el, '[data-offer-bar]').style.width = `${(left / total) * 100}%`;
      $(this.el, '[data-offer-seconds]').textContent = `${Math.ceil(left / 1000)} s`;
    }, COUNTDOWN_REFRESH_MS);
  }

  accept() {
    if (!this.offer) return;
    this.game.net.send({ type: 'matchAccept', offerId: this.offer.offerId });
    $(this.el, '[data-act="accept"]').disabled = true;
    this.setStatus('Joining the room…');
  }

  offerExpired(offerId) {
    if (this.offer?.offerId !== offerId) return;
    const accepted = $(this.el, '[data-act="accept"]').disabled;
    this.hideOffer();
    // Accepted but the room filled or started meanwhile: the server is already offering another one.
    this.setStatus(accepted ? 'That room just filled up; finding another…' : 'Match missed: you did not press Ready in time. Press Start to search again.', !accepted);
  }

  hideOffer() {
    this.offer = null;
    clearInterval(this.timer);
    $(this.el, '[data-offer]').hidden = true;
  }

  dispose() {
    clearInterval(this.timer);
    for (const [type, listener] of Object.entries(this.listeners)) this.game.net.removeEventListener(type, listener);
    this.el.remove();
  }
}
