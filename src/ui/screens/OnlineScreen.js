import { html, onAction, $ } from '../dom.js';
import { escapeHtml } from '../format.js';
import { sanitizeName } from '../../../shared/net/protocol.ts';
import { MATCH_MIN_PLAYERS } from '../../../shared/constants.ts';

const COUNTDOWN_REFRESH_MS = 200;

/**
 * Quick play: press Start to search, a found match must be accepted with "Ready" within its time limit,
 * then the game switches to the public room. Missing the limit stops the search (Start to look again).
 * With no open race to join, this browser hosts one and waits for players (see OnlineService).
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
    this.online = game.online;
    onAction(this.el, {
      back: () => {
        void this.online.leave();
        onBack();
      },
      start: () => this.start(),
      cancel: () => this.cancel(),
      accept: () => this.accept()
    }, (act) => game.audio.play(act === 'back' || act === 'cancel' ? 'uiBack' : 'ui'));

    game.screens.appendChild(this.el);
    this.setSearching(false);
    if (!this.online.available) this.setStatus('Online play is not set up on this site yet (Firebase settings missing).', true);
    else if (!navigator.onLine) this.setStatus('You are offline. Online races need internet.', true);
    else this.setStatus(this.online.kind === 'local' ? 'Dev mode: other tabs of this browser are your opponents. Press Start.' : 'Press Start to find a race.');
    if (autoStart && this.online.available) this.start();
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
    this.setSearching(true);
    this.setStatus('Searching for a race…');
    try {
      await this.online.startQuickPlay((event) => this.onQuickPlay(event));
    } catch (error) {
      this.setSearching(false);
      this.setStatus(error.message, true);
    }
  }

  onQuickPlay(event) {
    if (!this.el.isConnected) return;
    if (event.kind === 'offer') this.showOffer(event.offer);
    else if (event.kind === 'expired') {
      this.hideOffer();
      this.setSearching(false);
      this.setStatus('Match missed: you did not press Ready in time. Press Start to search again.', true);
    } else if (event.kind === 'host') {
      this.setStatus('No open race right now: you are hosting one. Waiting for players…');
    } else if (event.kind === 'error') {
      this.setSearching(false);
      this.setStatus(event.message, true);
    }
  }

  cancel() {
    void this.online.cancelQuickPlay();
    this.hideOffer();
    this.setSearching(false);
    this.setStatus('Search stopped. Press Start to look again.');
  }

  showOffer(offer) {
    this.offer = offer;
    $(this.el, '[data-offer-info]').innerHTML = `<b>${escapeHtml(offer.trackName)}</b> · ${offer.players}/${offer.maxPlayers} players in the room`;
    $(this.el, '[data-offer]').hidden = false;
    $(this.el, '[data-act="accept"]').disabled = false;
    this.game.audio.play('countdown');
    const total = Math.max(1, offer.expiresAt - Date.now());
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const left = Math.max(0, offer.expiresAt - Date.now());
      $(this.el, '[data-offer-bar]').style.width = `${(left / total) * 100}%`;
      $(this.el, '[data-offer-seconds]').textContent = `${Math.ceil(left / 1000)} s`;
    }, COUNTDOWN_REFRESH_MS);
  }

  async accept() {
    if (!this.offer) return;
    $(this.el, '[data-act="accept"]').disabled = true;
    this.hideOffer();
    this.setStatus('Joining the room…');
    try {
      await this.online.acceptOffer();
    } catch (error) {
      // The host left or filled up meanwhile: look again straight away.
      this.setStatus(`${error.message} Finding another…`, true);
      void this.start();
    }
  }

  hideOffer() {
    this.offer = null;
    clearInterval(this.timer);
    $(this.el, '[data-offer]').hidden = true;
  }

  dispose() {
    clearInterval(this.timer);
    this.el.remove();
  }
}
