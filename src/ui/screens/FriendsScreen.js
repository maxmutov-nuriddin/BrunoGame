import { html, onAction, $ } from '../dom.js';
import { sanitizeName, isRoomCode } from '../../../shared/net/protocol.ts';

/** Name, create a room (this browser hosts it) or join a friend's by code. */
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
          <p class="status-line" data-status></p>
          <div class="friends__actions">
            <button class="btn btn--primary btn--big" data-act="create">Create room</button>
            <div class="join">
              <input data-code maxlength="6" placeholder="ROOM CODE" spellcheck="false" autocomplete="off" />
              <button class="btn btn--big" data-act="join">Join</button>
            </div>
          </div>
          <p class="muted">The room is hosted in the creator's browser: keep this tab open while friends play. Solo races work offline.</p>
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
      create: () => this.go(() => game.online.hostRoom(false), 'Opening your room…'),
      join: () => {
        const code = this.codeInput.value.trim().toUpperCase();
        if (!isRoomCode(code)) return this.setStatus('Room codes are 6 letters/numbers.', true);
        this.go(() => game.online.joinByCode(code), 'Connecting to the host…');
      }
    }, (act) => game.audio.play(act === 'back' ? 'uiBack' : 'ui'));
    game.screens.appendChild(this.el);
    this.showAvailability();
    if (prefillCode && isRoomCode(prefillCode)) this.go(() => game.online.joinByCode(prefillCode), 'Connecting to the host…');
  }

  setStatus(text, bad = false) {
    this.status.textContent = text;
    this.status.classList.toggle('is-bad', bad);
  }

  showAvailability() {
    const { online } = this.game;
    if (!online.available) this.setStatus('Online play is not set up on this site yet (Firebase settings missing).', true);
    else if (!navigator.onLine) this.setStatus('You are offline. Online races need internet.', true);
    else if (online.kind === 'local') this.setStatus('Dev mode: rooms are shared between tabs of this browser only.');
    else this.setStatus('Ready to play online.');
  }

  async go(action, label) {
    const name = sanitizeName(this.nameInput.value);
    if (!name) return this.setStatus('Names: 1–16 letters, digits, space, _ . -', true);
    if (!this.game.online.available) return this.showAvailability();
    this.game.settings.set('name', name);
    this.setStatus(label);
    try {
      await action();
    } catch (error) {
      this.setStatus(error.message, true);
    }
  }

  dispose() {
    this.el.remove();
  }
}
