import { escapeHtml } from './format.js';
import { VEHICLES } from '../../shared/vehicles.ts';
import { STAT_LABELS, vehicleRatings } from './stats.js';

const KMH_PER_MS = 3.6;

/**
 * One selectable card per car: name, role, key numbers and 0..1 stat bars. Used by the garage and the lobby.
 * Hidden cars only show once `unlocked` (promo codes) lists them.
 */
export function carCardsHtml({ compact = false, unlocked = [] } = {}) {
  return VEHICLES.filter((v) => !v.hidden || unlocked.includes(v.id)).map((v) => {
    const h = v.handling;
    const bars = Object.entries(vehicleRatings(v))
      .map(([key, value]) => `<div><dt>${STAT_LABELS[key]}</dt><dd><i style="width:${Math.round(value * 100)}%"></i></dd></div>`)
      .join('');
    return `
      <button class="car-card ${compact ? 'car-card--compact' : ''} ${v.hidden ? 'car-card--promo' : ''}" role="option" data-act="pick" data-id="${v.id}">
        <b>${escapeHtml(v.name)}</b>
        <small>${escapeHtml(v.role)}</small>
        <span class="car-card__numbers">${Math.round(h.maxSpeed * KMH_PER_MS)} km/h · ${h.mass} kg · ${h.health} HP</span>
        <dl>${bars}</dl>
      </button>`;
  }).join('');
}

/** Mark the chosen card (aria-selected drives the highlight style). */
export function markSelectedCard(root, id) {
  for (const card of root.querySelectorAll('.car-card')) card.setAttribute('aria-selected', String(card.dataset.id === id));
}
