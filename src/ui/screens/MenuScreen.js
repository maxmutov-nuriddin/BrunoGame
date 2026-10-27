import { html, onAction } from '../dom.js';
import { escapeHtml } from '../format.js';
import { findVehicle } from '../../../shared/vehicles.ts';

export default class MenuScreen {
  constructor(game, { onSolo, onOnline, onFriends, onGarage, onSettings }) {
    const vehicle = findVehicle(game.settings.get('vehicleId'));
    this.el = html(`
      <section class="screen menu">
        <div class="brand brand--small">
          <h1 class="brand__title">NITRO<b>CLASH</b></h1>
        </div>
        <nav class="menu__list" aria-label="Main menu">
          <button class="menu__item is-hero" data-act="solo"><b>Play Solo</b><small>Race bots or chase the clock · works offline</small></button>
          <button class="menu__item" data-act="online"><b>Play Online</b><small>Quick race against random players</small></button>
          <button class="menu__item" data-act="friends"><b>Play with Friends</b><small>Private online room · invite by link</small></button>
          <button class="menu__item" data-act="garage"><b>Garage</b><small>${escapeHtml(vehicle.name)} · ${escapeHtml(vehicle.role)}</small></button>
          <button class="menu__item" data-act="settings"><b>Settings</b><small>Graphics, audio, controls</small></button>
        </nav>
        <footer class="menu__footer">
          <span class="chip" data-internet></span>
          <span class="chip" data-driver>Driver: ${escapeHtml(game.settings.get('name'))}</span>
          <button class="chip chip--update" data-act="update" hidden>Update ready · restart</button>
        </footer>
      </section>`);
    onAction(this.el, {
      solo: onSolo,
      online: onOnline,
      friends: onFriends,
      garage: onGarage,
      settings: onSettings,
      update: () => game.applyUpdate()
    }, () => game.audio.play('ui'));
    this.internet = this.el.querySelector('[data-internet]');
    this.updateButton = this.el.querySelector('[data-act="update"]');
    this.refresh = () => {
      this.internet.textContent = navigator.onLine ? 'Internet: online' : 'Internet: offline · solo races available';
      this.internet.classList.toggle('is-bad', !navigator.onLine);
      this.updateButton.hidden = !game.updateAvailable;
    };
    window.addEventListener('online', this.refresh);
    window.addEventListener('offline', this.refresh);
    this.refresh();
    game.screens.appendChild(this.el);
    this.el.querySelector('.menu__item')?.focus();
  }

  dispose() {
    window.removeEventListener('online', this.refresh);
    window.removeEventListener('offline', this.refresh);
    this.el.remove();
  }
}
