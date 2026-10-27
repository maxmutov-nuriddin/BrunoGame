import { html, onAction, $$ } from '../dom.js';
import { escapeHtml } from '../format.js';
import { findVehicle } from '../../../shared/vehicles.ts';
import { carCardsHtml, markSelectedCard } from '../carCards.js';

/** Pick a car; the showroom behind shows whichever card is focused. */
export default class GarageScreen {
  constructor(game, { onBack, showroom, selected, onSelect }) {
    this.game = game;
    this.showroom = showroom;
    this.current = selected ?? game.settings.get('vehicleId');
    this.el = html(`
      <section class="screen garage">
        <header class="screen__header">
          <button class="btn btn--ghost" data-act="back">← Back</button>
          <h2>Garage</h2>
        </header>
        <div class="garage__cards" role="listbox" aria-label="Cars">
          ${carCardsHtml({ unlocked: game.settings.get('unlockedVehicles') })}
        </div>
        <footer class="garage__footer">
          <div class="garage__detail" data-detail></div>
          <button class="btn btn--primary" data-act="confirm">Choose car</button>
        </footer>
      </section>`);
    onAction(this.el, {
      back: () => onBack(),
      pick: (target) => this.preview(target.dataset.id),
      confirm: () => {
        onSelect?.(this.current);
        onBack(this.current);
      }
    }, (act) => game.audio.play(act === 'back' ? 'uiBack' : 'ui'));
    for (const card of $$(this.el, '.car-card')) card.addEventListener('focus', () => this.preview(card.dataset.id));
    game.screens.appendChild(this.el);
    this.preview(this.current);
  }

  preview(id) {
    this.current = id;
    const vehicle = findVehicle(id);
    this.showroom.showVehicle(id);
    markSelectedCard(this.el, id);
    const h = vehicle.handling;
    this.el.querySelector('[data-detail]').innerHTML = `<b>${escapeHtml(vehicle.name)}</b> · ${Math.round(h.maxSpeed * 3.6)} km/h · ${h.mass} kg · ${h.health} HP`;
  }

  dispose() {
    this.el.remove();
  }
}
