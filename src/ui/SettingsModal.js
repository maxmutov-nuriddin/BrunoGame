import { html, onAction, $ } from './dom.js';
import { escapeHtml } from './format.js';
import { keyLabel } from './icons.js';
import { QUALITY_LEVELS, CAMERA_MODES } from '../core/Settings.js';
import { sanitizeName } from '../../shared/net/protocol.ts';
import { findVehicle } from '../../shared/vehicles.ts';
import { promoHash, redeemPromoCode } from '../core/promo.js';

const ACTION_LABELS = {
  throttle: 'Accelerate', brake: 'Brake / reverse', left: 'Steer left', right: 'Steer right', handbrake: 'Handbrake / drift',
  nitro: 'Nitro', item: 'Use item', lookBack: 'Look back', reset: 'Reset car', pause: 'Menu / pause', camera: 'Change camera'
};

const FPS_OPTIONS = [[30, '30 fps (cool)'], [60, '60 fps'], [0, 'Unlimited']];
const CAMERA_LABELS = { chase: 'Chase', far: 'Far', hood: 'Hood', cockpit: 'Cockpit' };

/** Graphics, audio, controls (with remapping), account and promo codes. */
export default class SettingsModal {
  constructor(game, onClose) {
    this.game = game;
    const s = game.settings;
    this.el = html(`
      <div class="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="panel modal__panel">
          <header class="screen__header"><h2>Settings</h2><button class="btn btn--ghost" data-act="close">Close ✕</button></header>
          <div class="settings__grid">
            <section>
              <h3>Graphics</h3>
              <div class="segmented" data-quality>${QUALITY_LEVELS.map((q) => `<button data-act="quality" data-q="${q}">${q[0].toUpperCase()}${q.slice(1)}</button>`).join('')}</div>
              <h3>Frame rate</h3>
              <div class="segmented">${FPS_OPTIONS.map(([fps, label]) => `<button data-act="fps" data-fps="${fps}">${label}</button>`).join('')}</div>
              <h3>Camera <span class="muted">(C in race)</span></h3>
              <div class="segmented">${CAMERA_MODES.map((mode) => `<button data-act="camera" data-mode="${mode}">${CAMERA_LABELS[mode]}</button>`).join('')}</div>
              <label class="toggle"><input type="checkbox" data-mirror /> Rear-view mirror in hood and cockpit views</label>
              <label class="toggle"><input type="checkbox" data-reduced /> Reduced motion (no shake, speed blur or FOV kick)</label>
              <h3>Audio</h3>
              ${['master', 'music', 'sfx'].map((k) => `<label class="field">${k === 'sfx' ? 'Effects' : k[0].toUpperCase() + k.slice(1)} <input type="range" min="0" max="1" step="0.05" data-volume="${k}" /></label>`).join('')}
              <h3>Profile</h3>
              <label class="field">Driver name <input data-name maxlength="16" /></label>
              <h3>Account</h3>
              <p class="status-line" data-account></p>
              <div class="account__actions">
                <button class="btn btn--small" data-act="google" hidden>Sign in with Google</button>
                <button class="btn btn--small" data-act="signout" hidden>Sign out</button>
              </div>
              <h3>Promo code</h3>
              <form class="promo" data-promo>
                <input data-promo-code maxlength="40" autocomplete="off" spellcheck="false" placeholder="Enter code" aria-label="Promo code" />
                <button class="btn btn--small" type="submit">Redeem</button>
              </form>
              <p class="status-line" data-promo-status></p>
            </section>
            <section>
              <h3>Controls <button class="btn btn--small" data-act="resetKeys">Reset</button></h3>
              <ul class="bindings" data-bindings></ul>
              <p class="muted">Click a key to change it, then press the new key. Esc cancels. Gamepads work too (RT/LT, stick, A drift, B nitro, X item, Y reset).</p>
            </section>
          </div>
        </div>
      </div>`);
    const mirror = $(this.el, '[data-mirror]');
    mirror.checked = s.get('rearMirror');
    mirror.addEventListener('change', () => s.set('rearMirror', mirror.checked));
    const reduced = $(this.el, '[data-reduced]');
    reduced.checked = s.get('reducedMotion');
    reduced.addEventListener('change', () => {
      s.set('reducedMotion', reduced.checked);
      game.applySettings();
    });
    for (const input of this.el.querySelectorAll('[data-volume]')) {
      input.value = s.get('volume')[input.dataset.volume];
      input.addEventListener('input', () => s.set('volume', { ...s.get('volume'), [input.dataset.volume]: Number(input.value) }));
    }
    const name = $(this.el, '[data-name]');
    name.value = s.get('name');
    name.addEventListener('change', () => {
      const clean = sanitizeName(name.value);
      if (clean) s.set('name', clean);
      name.value = s.get('name');
    });
    $(this.el, '[data-promo]').addEventListener('submit', (event) => {
      event.preventDefault();
      this.redeem();
    });
    onAction(this.el, {
      close: () => this.close(onClose),
      quality: (target) => {
        s.set('quality', target.dataset.q);
        game.applySettings();
        this.render();
      },
      fps: (target) => {
        s.set('fpsCap', Number(target.dataset.fps));
        this.render();
      },
      camera: (target) => {
        s.set('cameraMode', target.dataset.mode);
        this.render();
      },
      bind: (target) => this.rebind(target.dataset.action, Number(target.dataset.slot)),
      google: () => this.accountAction((account) => account.signInWithGoogle()),
      signout: () => this.accountAction((account) => account.signOut()),
      resetKeys: () => {
        s.resetBindings();
        this.render();
      }
    }, () => game.audio.play('ui'));
    this.el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !game.input.capture) this.close(onClose);
    });
    game.modals.appendChild(this.el);
    this.render();
    void this.renderAccount();
  }

  /** Accounts exist only with Firebase; anonymous players can link Google to keep their profile on any device. */
  async renderAccount() {
    const status = $(this.el, '[data-account]');
    const google = $(this.el, '[data-act="google"]');
    const signout = $(this.el, '[data-act="signout"]');
    const { online } = this.game;
    if (online.kind !== 'firebase') {
      status.textContent = online.kind === 'local' ? 'Dev mode: accounts need the Firebase settings.' : 'Accounts are not set up on this site.';
      return;
    }
    status.textContent = 'Checking your account…';
    try {
      const { account } = await online.backend();
      const user = account.user();
      if (!this.el.isConnected) return;
      status.textContent = user.anonymous ? 'Playing as a guest. Sign in to keep your cars and name on every device.' : `Signed in as ${user.name || user.email}.`;
      google.hidden = !user.anonymous;
      signout.hidden = user.anonymous;
    } catch (error) {
      status.textContent = `Account unavailable: ${error.message}`;
    }
  }

  async accountAction(run) {
    const status = $(this.el, '[data-account]');
    try {
      const { account } = await this.game.online.backend();
      await run(account);
      await this.game.accountSync?.pull();
    } catch (error) {
      status.textContent = error?.code === 'auth/popup-closed-by-user' ? 'Sign-in cancelled.' : `Sign-in failed: ${error.message}`;
      return;
    }
    await this.renderAccount();
  }

  render() {
    const s = this.game.settings;
    for (const button of this.el.querySelectorAll('[data-act="quality"]')) button.setAttribute('aria-selected', String(button.dataset.q === s.get('quality')));
    for (const button of this.el.querySelectorAll('[data-act="fps"]')) button.setAttribute('aria-selected', String(Number(button.dataset.fps) === s.get('fpsCap')));
    for (const button of this.el.querySelectorAll('[data-act="camera"]')) button.setAttribute('aria-selected', String(button.dataset.mode === s.get('cameraMode')));
    const bindings = s.get('bindings');
    $(this.el, '[data-bindings]').innerHTML = Object.entries(ACTION_LABELS)
      .map(([action, label]) => `<li><span>${escapeHtml(label)}</span>${[0, 1].map((slot) => `<button class="key" data-act="bind" data-action="${action}" data-slot="${slot}">${escapeHtml(bindings[action]?.[slot] ? keyLabel(bindings[action][slot]) : '—')}</button>`).join('')}</li>`)
      .join('');
  }

  /**
   * A valid code adds its car to this device's garage and selects it. Codes built into the game work
   * offline; with Firebase the unlock is also stored on the player's account (and codes added later in
   * Firestore work without a new release).
   */
  async redeem() {
    const input = $(this.el, '[data-promo-code]');
    const status = $(this.el, '[data-promo-status]');
    const code = input.value;
    status.classList.remove('is-bad');
    status.textContent = 'Checking…';
    let vehicleId = redeemPromoCode(code);
    if (this.game.online.kind === 'firebase' && navigator.onLine) {
      try {
        const { account } = await this.game.online.backend();
        vehicleId = (await account.redeemPromo(promoHash(code))) ?? vehicleId;
      } catch (error) {
        console.warn('[promo] account unlock failed', error);
      }
    }
    status.classList.toggle('is-bad', !vehicleId);
    if (!vehicleId) {
      this.game.audio.play('uiBack');
      status.textContent = 'Unknown code.';
      return;
    }
    const isNew = this.game.settings.unlockVehicle(vehicleId);
    this.game.settings.set('vehicleId', vehicleId);
    this.game.audio.play('ui');
    input.value = '';
    const name = findVehicle(vehicleId).name;
    status.textContent = isNew ? `Unlocked ${name}! It is now in your Garage and selected.` : `${name} is already in your Garage.`;
  }

  rebind(action, slot) {
    const button = this.el.querySelector(`[data-action="${action}"][data-slot="${slot}"]`);
    button.textContent = 'Press a key…';
    button.classList.add('is-listening');
    this.game.input.captureNextKey((code) => {
      if (code) {
        const bindings = structuredClone(this.game.settings.get('bindings'));
        const keys = [...(bindings[action] ?? [])];
        keys[slot] = code;
        bindings[action] = keys.filter(Boolean);
        this.game.settings.set('bindings', bindings);
      }
      this.render();
    });
  }

  close(onClose) {
    this.el.remove();
    onClose?.();
  }
}
