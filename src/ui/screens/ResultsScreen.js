import { html, onAction } from '../dom.js';
import { escapeHtml, formatTime, ordinal } from '../format.js';
import { findVehicle } from '../../../shared/vehicles.ts';
import { TICK_RATE } from '../../../shared/constants.ts';

const ms = (ticks) => (ticks >= 0 ? (ticks / TICK_RATE) * 1000 : -1);

/** Final standings. Buttons depend on solo/online and host status. */
export default class ResultsScreen {
  constructor(game, { results, localId, mode, online, recordNote, onRestart, onSetup, onMenu, onRematch, onLobby }) {
    this.game = game;
    this.online = online;
    this.localId = localId;
    const mine = results.find((r) => r.id === localId);
    const headline = !mine ? 'Race over' : mine.dnf ? 'Did not finish' : mode === 'timeTrial' ? `Time ${formatTime(ms(mine.totalTicks))}` : `You finished ${ordinal(mine.rank)}`;
    this.el = html(`
      <section class="screen results">
        <header class="results__header">
          <small>${mode === 'timeTrial' ? 'TIME TRIAL' : online ? 'ONLINE RACE' : 'SOLO RACE'} · RESULTS</small>
          <h2>${escapeHtml(headline)}</h2>
          ${recordNote ? `<p class="record">${escapeHtml(recordNote)}</p>` : ''}
        </header>
        <table class="results__table">
          <thead><tr><th>Pos</th><th>Driver</th><th>Car</th><th>Total</th><th>Best lap</th></tr></thead>
          <tbody>${results.map((r) => `
            <tr class="${r.id === localId ? 'is-me' : ''}">
              <td>${r.dnf ? 'DNF' : r.rank}</td>
              <td>${escapeHtml(r.name)}${r.kind === 'bot' ? ' <em class="badge">BOT</em>' : ''}${r.left ? ' <em class="badge badge--bad">LEFT</em>' : ''}</td>
              <td>${escapeHtml(findVehicle(r.vehicleId).name)}</td>
              <td>${r.finished ? formatTime(ms(r.totalTicks)) : '—'}</td>
              <td>${r.bestLapTicks > 0 ? formatTime(ms(r.bestLapTicks)) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <footer class="screen__footer" data-actions>
          ${online
            ? `<button class="btn btn--primary btn--big" data-act="rematch">Rematch</button>
               <button class="btn btn--big" data-act="lobby">Back to lobby</button>
               <button class="btn btn--ghost" data-act="menu">Leave room</button>`
            : `<button class="btn btn--primary btn--big" data-act="restart">Race again</button>
               <button class="btn btn--big" data-act="setup">Change setup</button>
               <button class="btn btn--ghost" data-act="menu">Main menu</button>`}
        </footer>
        <p class="status-line" data-status></p>
      </section>`);
    onAction(this.el, { restart: onRestart, setup: onSetup, menu: onMenu, rematch: onRematch, lobby: onLobby }, (act) => game.audio.play(act === 'menu' ? 'uiBack' : 'ui'));
    game.screens.appendChild(this.el);
    if (online && game.room) this.update(game.room);
  }

  /** Online: reflect who is ready for the rematch. */
  update(room) {
    if (!this.online) return;
    const me = room.players.find((p) => p.id === room.youId);
    const others = room.players.filter((p) => !p.host && p.connected);
    const waiting = others.filter((p) => !p.ready).length;
    const button = this.el.querySelector('[data-act="rematch"]');
    if (me?.host) {
      button.textContent = waiting ? `Rematch (${waiting} not ready)` : 'Start rematch';
      button.disabled = waiting > 0;
    } else {
      button.textContent = me?.ready ? 'Waiting for host…' : 'Ready for rematch';
      button.disabled = Boolean(me?.ready);
    }
    this.el.querySelector('[data-status]').textContent = room.state === 'loading' ? 'Loading the next race…' : '';
  }

  dispose() {
    this.el.remove();
  }
}
