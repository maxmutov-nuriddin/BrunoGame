import { html, onAction, $ } from '../dom.js';
import { escapeHtml, formatTime } from '../format.js';
import { TRACK_PRESETS } from '../../../shared/track/presets.ts';
import { normalizeSeedCode, randomSeedCode } from '../../../shared/rng.ts';
import { findVehicle } from '../../../shared/vehicles.ts';
import { Records } from '../../core/Settings.js';
import { trackForSeed } from '../../../shared/track/presets.ts';

const STORE_KEY = 'bruno-race:solo';

function loadSetup() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? 'null');
    if (stored && stored.version === 1) return stored;
  } catch {
    // fall through to defaults
  }
  return { version: 1, mode: 'race', seed: TRACK_PRESETS[0].seed, laps: 3, bots: 5, difficulty: 'normal', items: true };
}

/** Solo race / time trial setup: track, laps, bots, difficulty, items. */
export default class SoloScreen {
  constructor(game, { onBack, onStart, onGarage }) {
    this.game = game;
    this.setup = loadSetup();
    const vehicle = findVehicle(game.settings.get('vehicleId'));
    this.el = html(`
      <section class="screen solo">
        <header class="screen__header">
          <button class="btn btn--ghost" data-act="back">← Back</button>
          <h2>Play Solo</h2>
        </header>
        <div class="segmented" role="tablist">
          <button data-act="mode" data-mode="race" role="tab">Race vs bots</button>
          <button data-act="mode" data-mode="timeTrial" role="tab">Time trial</button>
        </div>
        <div class="solo__grid">
          <div class="panel">
            <h3>Track</h3>
            <div class="track-list">
              ${TRACK_PRESETS.map((t) => `<button class="track-item" data-act="track" data-seed="${t.seed}"><b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.blurb)}</small></button>`).join('')}
            </div>
            <label class="field">Track code
              <span class="field__row"><input data-seed maxlength="12" spellcheck="false" autocomplete="off" /><button class="btn btn--small" data-act="random">Random</button></span>
            </label>
            <p class="muted" data-track-info></p>
          </div>
          <div class="panel">
            <h3>Rules</h3>
            <label class="field">Laps <input type="range" min="1" max="5" data-laps /><output data-laps-out></output></label>
            <div data-race-only>
              <label class="field">Bots <input type="range" min="1" max="7" data-bots /><output data-bots-out></output></label>
              <label class="field">Difficulty
                <select data-difficulty><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select>
              </label>
              <label class="toggle"><input type="checkbox" data-items /> Power-ups</label>
            </div>
            <p class="muted" data-record></p>
            <div class="solo__car">
              <span>Car: <b>${escapeHtml(vehicle.name)}</b></span>
              <button class="btn btn--small" data-act="garage">Change</button>
            </div>
          </div>
        </div>
        <footer class="screen__footer"><button class="btn btn--primary btn--big" data-act="start">Start race</button></footer>
      </section>`);
    this.inputs = {
      seed: $(this.el, 'input[data-seed]'), laps: $(this.el, '[data-laps]'), bots: $(this.el, '[data-bots]'),
      difficulty: $(this.el, '[data-difficulty]'), items: $(this.el, '[data-items]')
    };
    onAction(this.el, {
      back: () => onBack(),
      mode: (target) => this.change({ mode: target.dataset.mode }),
      track: (target) => this.change({ seed: target.dataset.seed }),
      random: () => this.change({ seed: randomSeedCode() }),
      garage: () => onGarage(),
      start: () => {
        this.save();
        onStart({ ...this.setup });
      }
    }, (act) => game.audio.play(act === 'back' ? 'uiBack' : 'ui'));
    this.inputs.seed.addEventListener('change', () => {
      const seed = normalizeSeedCode(this.inputs.seed.value);
      if (seed.length >= 3) this.change({ seed });
      else this.inputs.seed.value = this.setup.seed;
    });
    this.inputs.laps.addEventListener('input', () => this.change({ laps: Number(this.inputs.laps.value) }));
    this.inputs.bots.addEventListener('input', () => this.change({ bots: Number(this.inputs.bots.value) }));
    this.inputs.difficulty.addEventListener('change', () => this.change({ difficulty: this.inputs.difficulty.value }));
    this.inputs.items.addEventListener('change', () => this.change({ items: this.inputs.items.checked }));
    game.screens.appendChild(this.el);
    this.render();
  }

  change(patch) {
    this.setup = { ...this.setup, ...patch };
    this.save();
    this.render();
  }

  save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(this.setup));
    } catch {
      // not persisted; fine
    }
  }

  render() {
    const { setup, el } = this;
    for (const button of el.querySelectorAll('[data-act="mode"]')) button.setAttribute('aria-selected', String(button.dataset.mode === setup.mode));
    for (const button of el.querySelectorAll('[data-act="track"]')) button.classList.toggle('is-selected', button.dataset.seed === setup.seed);
    this.inputs.seed.value = setup.seed;
    this.inputs.laps.value = setup.laps;
    $(el, '[data-laps-out]').textContent = setup.laps;
    this.inputs.bots.value = setup.bots;
    $(el, '[data-bots-out]').textContent = setup.bots;
    this.inputs.difficulty.value = setup.difficulty;
    this.inputs.items.checked = setup.items;
    $(el, '[data-race-only]').hidden = setup.mode === 'timeTrial';
    const track = trackForSeed(setup.seed);
    $(el, '[data-track-info]').textContent = `${track.name} · ${Math.round(track.length)} m · ${track.hairpins.length} hairpin${track.hairpins.length === 1 ? '' : 's'}${track.ramp ? ' · jump' : ''}${track.source === 'fallback' ? ' · (fallback layout)' : ''}`;
    const record = Records.get(track, this.game.settings.get('vehicleId'));
    $(el, '[data-record]').textContent = setup.mode === 'timeTrial' ? (record ? `Your record: best lap ${formatTime(record.bestLapMs)}` : 'No record yet for this track and car.') : '';
    $(el, '[data-act="start"]').textContent = setup.mode === 'timeTrial' ? 'Start time trial' : 'Start race';
  }

  dispose() {
    this.el.remove();
  }
}
