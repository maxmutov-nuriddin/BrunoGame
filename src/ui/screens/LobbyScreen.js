import { html, onAction, $ } from '../dom.js';
import { escapeHtml } from '../format.js';
import { findVehicle } from '../../../shared/vehicles.ts';
import { carCardsHtml, markSelectedCard } from '../carCards.js';
import { qrSvg } from '../qr.js';

/** A QR pointing at localhost only works on this computer; tell the host how to reach it from a phone. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
import { TRACK_PRESETS, randomPreset, trackForSeed } from '../../../shared/track/presets.ts';
import { LAYOUT_LABELS, THEME_LABELS, drawTrackPreview, trackFacts } from '../trackPreview.js';
import { MATCH_MIN_PLAYERS } from '../../../shared/constants.ts';
import { normalizeSeedCode } from '../../../shared/rng.ts';

/** Private room: invite (code, QR, link), players, car choice, the host's race settings and ready state. */
export default class LobbyScreen {
  constructor(game, { onLeave }) {
    this.game = game;
    this.el = html(`
      <section class="screen lobby">
        <header class="screen__header">
          <button class="btn btn--ghost" data-act="leave">← Leave</button>
          <h2 data-title>Private room</h2>
        </header>
        <div class="lobby__grid">
          <div class="panel lobby__invite">
            <h3>Invite friends</h3>
            <p class="muted">Room code</p>
            <div class="lobby__code code" data-code></div>
            <div class="lobby__qr" data-qr aria-label="QR code with the invite link"></div>
            <p class="muted lobby__qr-note" data-qr-note></p>
            <div class="lobby__invite-actions">
              <button class="btn btn--small" data-act="invite">Copy link</button>
              <button class="btn btn--small" data-act="copyCode">Copy code</button>
            </div>
          </div>
          <div class="panel">
            <h3>Drivers <small data-count></small></h3>
            <ol class="lobby__players" data-players></ol>
          </div>
          <div class="panel">
            <h3>Race settings <small data-host-note></small></h3>
            <canvas class="track-preview__map" data-preview></canvas>
            <p class="track-badges" data-preview-info></p>
            <label class="field">Track
              <select data-track>${TRACK_PRESETS.map((t) => `<option value="${t.seed}">${escapeHtml(t.name)}</option>`).join('')}<option value="custom">Custom code…</option></select>
            </label>
            <button class="btn btn--small" data-act="randomMap" data-host-only>🎲 Random map</button>
            <label class="field" data-custom-row hidden>Track code <input data-custom maxlength="12" /></label>
            <label class="field">Laps <select data-laps>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
            <label class="field">Bot difficulty <select data-difficulty><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
            <label class="field">Slots <select data-max>${[2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
            <label class="toggle"><input type="checkbox" data-fill /> Fill empty slots with bots</label>
            <label class="toggle"><input type="checkbox" data-items /> Power-ups</label>
          </div>
          <div class="panel lobby__cars">
            <h3>Your car <small data-car-name></small></h3>
            <div class="lobby__car-cards" role="listbox" aria-label="Cars">${carCardsHtml({ compact: true })}</div>
          </div>
        </div>
        <footer class="screen__footer">
          <p class="status-line" data-status></p>
          <button class="btn btn--big" data-act="ready">Ready</button>
          <button class="btn btn--primary btn--big" data-act="start">Start race</button>
        </footer>
      </section>`);
    const q = (name) => $(this.el, `[data-${name}]`);
    this.fields = { track: q('track'), custom: q('custom'), customRow: q('custom-row'), laps: q('laps'), difficulty: q('difficulty'), max: q('max'), fill: q('fill'), items: q('items') };
    onAction(this.el, {
      leave: () => onLeave(),
      invite: () => this.copy(this.inviteUrl(), 'Invite link copied'),
      copyCode: () => this.copy(this.room.code, 'Room code copied'),
      pick: (target) => this.pickCar(target.dataset.id),
      randomMap: () => {
        const preset = randomPreset(this.room?.settings.trackSeed);
        game.net.send({ type: 'updateSettings', settings: { trackSeed: preset.seed, trackName: preset.name } });
      },
      ready: () => game.net.send({ type: 'setReady', ready: !this.me()?.ready }),
      start: () => game.net.send({ type: 'startRace' })
    }, (act) => game.audio.play(act === 'leave' ? 'uiBack' : 'ui'));
    const sendSettings = (patch) => game.net.send({ type: 'updateSettings', settings: patch });
    this.fields.track.addEventListener('change', () => {
      const custom = this.fields.track.value === 'custom';
      this.fields.customRow.hidden = !custom;
      if (!custom) {
        const preset = TRACK_PRESETS.find((t) => t.seed === this.fields.track.value);
        sendSettings({ trackSeed: preset.seed, trackName: preset.name });
      }
    });
    this.fields.custom.addEventListener('change', () => {
      const seed = normalizeSeedCode(this.fields.custom.value);
      if (seed.length >= 3) sendSettings({ trackSeed: seed, trackName: `Circuit ${seed}` });
    });
    this.fields.laps.addEventListener('change', () => sendSettings({ laps: Number(this.fields.laps.value) }));
    this.fields.difficulty.addEventListener('change', () => sendSettings({ botDifficulty: this.fields.difficulty.value }));
    this.fields.max.addEventListener('change', () => sendSettings({ maxPlayers: Number(this.fields.max.value) }));
    this.fields.fill.addEventListener('change', () => sendSettings({ fillBots: this.fields.fill.checked }));
    this.fields.items.addEventListener('change', () => sendSettings({ itemsEnabled: this.fields.items.checked }));
    game.screens.appendChild(this.el);
    if (game.room) this.update(game.room);
  }

  /** Choose a car: saved locally, shown in the 3D showroom right away, and sent to the room. */
  pickCar(id) {
    if (this.room && this.room.state !== 'lobby' && this.room.state !== 'finished') return;
    this.game.settings.set('vehicleId', id);
    this.game.showroom?.showVehicle(id);
    this.showCar(id);
    this.game.net.send({ type: 'setVehicle', vehicleId: id });
  }

  showCar(id) {
    markSelectedCard(this.el, id);
    $(this.el, '[data-car-name]').textContent = findVehicle(id).name;
  }

  inviteUrl() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', this.room.code);
    return url.toString();
  }

  renderInvite() {
    if (this.renderedCode === this.room.code) return;
    this.renderedCode = this.room.code;
    $(this.el, '[data-code]').textContent = this.room.code;
    $(this.el, '[data-qr]').innerHTML = qrSvg(this.inviteUrl());
    $(this.el, '[data-qr-note]').textContent = LOCAL_HOSTS.has(window.location.hostname)
      ? 'Scan works only on this computer: open the game via your network address (e.g. http://192.168.x.x:5173) for phones.'
      : 'Scan with a phone to join.';
  }

  me() {
    return this.room?.players.find((p) => p.id === this.room.youId);
  }

  update(room) {
    this.room = room;
    const me = this.me();
    const host = Boolean(me?.host);
    this.renderInvite();
    $(this.el, '[data-count]').textContent = `${room.players.length}/${room.settings.maxPlayers}${room.botSlots ? ` · +${room.botSlots} bots` : ''}`;
    $(this.el, '[data-players]').innerHTML = room.players
      .map((p) => `<li class="${p.id === room.youId ? 'is-me' : ''}">
        <b>${escapeHtml(p.name)}${p.connected ? '' : ' <em class="badge badge--bad">RECONNECTING</em>'}</b>
        <small>${escapeHtml(findVehicle(p.vehicleId).name)}</small>
        <span class="ready ${p.ready || p.host ? 'is-ready' : ''}">${p.host ? 'Host' : p.ready ? 'Ready' : 'Not ready'}</span>
      </li>`)
      .join('') + (room.botSlots ? `<li class="is-bot"><b>+${room.botSlots} bot${room.botSlots === 1 ? '' : 's'}</b><small>fill the empty slots</small></li>` : '');

    // Quick play: no invite, no host settings, no ready/start; the server starts the race by itself.
    this.el.classList.toggle('is-public', Boolean(room.public));
    $(this.el, '[data-title]').textContent = room.public ? 'Quick race' : 'Private room';
    if (room.public) this.startCountdownTicker();
    const s = room.settings;
    const preset = TRACK_PRESETS.find((t) => t.seed === s.trackSeed);
    if (this.previewSeed !== s.trackSeed) {
      // Everyone sees what the host picked, including custom codes.
      this.previewSeed = s.trackSeed;
      const track = trackForSeed(s.trackSeed);
      drawTrackPreview($(this.el, '[data-preview]'), track);
      $(this.el, '[data-preview-info]').innerHTML = `<em>${escapeHtml(LAYOUT_LABELS[track.layout])}</em><em>${escapeHtml(THEME_LABELS[track.theme])}</em><em>${escapeHtml(trackFacts(track))}</em>`;
    }
    this.fields.track.value = preset ? preset.seed : 'custom';
    this.fields.customRow.hidden = Boolean(preset);
    if (!preset) this.fields.custom.value = s.trackSeed;
    this.fields.laps.value = String(s.laps);
    this.fields.difficulty.value = s.botDifficulty;
    this.fields.max.value = String(s.maxPlayers);
    this.fields.fill.checked = s.fillBots;
    this.fields.items.checked = s.itemsEnabled;
    for (const key of ['track', 'custom', 'laps', 'difficulty', 'max', 'fill', 'items']) this.fields[key].disabled = !host;
    $(this.el, '[data-host-only]').hidden = !host;
    if (me && me.vehicleId !== this.shownVehicle) {
      this.shownVehicle = me.vehicleId;
      this.showCar(me.vehicleId);
      this.game.showroom?.showVehicle(me.vehicleId);
    }
    $(this.el, '[data-host-note]').textContent = host ? '(you are host)' : '(host decides)';

    const others = room.players.filter((p) => !p.host && p.connected);
    const allReady = others.every((p) => p.ready);
    const ready = $(this.el, '[data-act="ready"]');
    const start = $(this.el, '[data-act="start"]');
    ready.hidden = host;
    ready.textContent = me?.ready ? 'Not ready' : 'Ready';
    ready.classList.toggle('btn--primary', !me?.ready);
    start.hidden = !host;
    start.disabled = !allReady || room.state === 'loading' || room.state === 'racing';
    const status = room.state === 'loading' ? 'Loading race…' : room.state === 'racing' ? 'Race in progress' : host ? (allReady ? 'Everyone is ready.' : 'Waiting for everyone to be ready…') : me?.ready ? 'Waiting for the host to start…' : 'Press Ready when you are set.';
    $(this.el, '[data-status]').textContent = room.public ? this.publicStatus() : status;
    if (room.public) {
      ready.hidden = true;
      start.hidden = true;
    }
  }

  publicStatus() {
    const room = this.room;
    if (room.state !== 'lobby') return 'Race starting…';
    if (room.countdownEndsAt > 0) return `Race starts in ${Math.max(0, Math.ceil((room.countdownEndsAt - this.game.net.serverNow()) / 1000))} s · more players can still join`;
    const present = room.players.filter((p) => p.connected).length;
    return `Waiting for players: ${present}/${MATCH_MIN_PLAYERS} needed to start`;
  }

  startCountdownTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      if (this.room?.public) $(this.el, '[data-status]').textContent = this.publicStatus();
    }, 250);
  }

  async copy(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      this.game.toast(done);
    } catch {
      window.prompt('Copy:', text);
    }
  }

  dispose() {
    clearInterval(this.ticker);
    this.el.remove();
  }
}
