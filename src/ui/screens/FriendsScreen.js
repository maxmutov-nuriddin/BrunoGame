import { html, onAction, $ } from '../dom.js';
import { sanitizeName, isRoomCode } from '../../../shared/net/protocol.ts';

/** Name, server status, create room or join by code. */
export default class FriendsScreen {
  constructor(game, { onBack, prefillCode = '' }) {
    this.game = game;
    this.el = html(`
      <section class="screen friends">
        <header class="screen__header">
          <button class="btn btn--ghost" data-act="back">← Back</button>
          <h2>Play with Friends</h2>
        </header>
        <div class="panel friends__panel">
          <label class="field">Your name <input data-name maxlength="16" autocomplete="nickname" /></label>
          <p class="status-line" data-status>Checking the multiplayer server…</p>
          <div class="friends__actions">
            <button class="btn btn--primary btn--big" data-act="create">Create room</button>
            <div class="join">
              <input data-code maxlength="6" placeholder="ROOM CODE" spellcheck="false" autocomplete="off" />
              <button class="btn btn--big" data-act="join">Join</button>
            </div>
          </div>
          <p class="muted">Online races need an internet connection and a running multiplayer server. Solo races work offline.</p>
        </div>
      </section>`);
    this.nameInput = $(this.el, '[data-name]');
    this.codeInput = $(this.el, '[data-code]');
    this.status = $(this.el, '[data-status]');
    this.nameInput.value = game.settings.get('name');
    this.codeInput.value = prefillCode;
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    onAction(this.el, {
      back: () => onBack(),
      create: () => this.go({ type: 'createRoom' }),
      join: () => {
        const code = this.codeInput.value.trim().toUpperCase();
        if (!isRoomCode(code)) return this.setStatus('Room codes are 6 letters/numbers.', true);
        this.go({ type: 'joinRoom', code });
      }
    }, (act) => game.audio.play(act === 'back' ? 'uiBack' : 'ui'));
    game.screens.appendChild(this.el);
    this.checkServer();
    if (prefillCode && isRoomCode(prefillCode)) this.go({ type: 'joinRoom', code: prefillCode });
  }

  setStatus(text, bad = false) {
    this.status.textContent = text;
    this.status.classList.toggle('is-bad', bad);
  }

  async checkServer() {
    if (!navigator.onLine) return this.setStatus('You are offline. Online races need internet.', true);
    const health = await this.game.net.checkHealth();
    if (!this.el.isConnected) return;
    if (!health.ok) this.setStatus('Multiplayer server unreachable. Start it with npm run dev:server, or set its URL in Settings.', true);
    else if (!health.protocolMatches) this.setStatus('Server version differs from this client. Reload or update.', true);
    else this.setStatus('Server online.');
  }

  async go(message) {
    const name = sanitizeName(this.nameInput.value);
    if (!name) return this.setStatus('Names: 1–16 letters, digits, space, _ . -', true);
    this.game.settings.set('name', name);
    this.setStatus('Connecting…');
    try {
      await this.game.net.connect();
      this.game.net.send({ type: 'setName', name });
      this.game.net.send({ type: 'setVehicle', vehicleId: this.game.settings.get('vehicleId') });
      this.game.net.send(message);
    } catch (error) {
      this.setStatus(error.message, true);
    }
  }

  dispose() {
    this.el.remove();
  }
}
