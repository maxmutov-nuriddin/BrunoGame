import { ITEMS } from '../../shared/race/items.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import { ITEM_ICONS, keyLabel } from '../ui/icons.js';
import { escapeHtml, formatTime } from '../ui/format.js';
import Minimap from './Minimap.js';

const FEED_LIMIT = 4;
const FEED_LIFETIME_MS = 3200;
const BANNER_MS = 1600;

/** Race overlay. Text is only written when it changes, to keep layout work out of the frame. */
export default class Hud {
  constructor(container, { track, laps, participants, localId, online, bindings, colors, mode }) {
    this.localId = localId;
    this.laps = laps;
    this.mode = mode;
    this.names = new Map(participants.map((p) => [p.id, p.name]));
    this.root = document.createElement('div');
    this.root.className = 'race-hud';
    this.root.innerHTML = `
      <div class="hud-pos"><span class="hud-pos__rank" data-rank>1</span><span class="hud-pos__of">/${participants.length}</span></div>
      <div class="hud-lap"><small>LAP</small><b data-lap>1/${laps}</b></div>
      <div class="hud-times"><span>TIME <b data-time>0:00.000</b></span><span>BEST <b data-best>—</b></span></div>
      <ol class="hud-board" data-board></ol>
      <div class="hud-map" data-map></div>
      <div class="hud-net" data-net hidden></div>
      <pre class="hud-debug" data-debug hidden></pre>
      <div class="hud-dash">
        <div class="hud-speed"><b data-speed>0</b><small>KM/H</small></div>
        <div class="hud-bars">
          <div class="hud-bar hud-bar--nitro"><i data-nitro></i><span>NITRO · ${keyLabel(bindings.nitro?.[0])}</span></div>
          <div class="hud-bar hud-bar--health"><i data-health></i><span>HEALTH</span></div>
        </div>
      </div>
      <div class="hud-item" data-item-slot ${mode === 'timeTrial' ? 'hidden' : ''}>
        <div class="hud-item__icon" data-item-icon></div>
        <div class="hud-item__text"><b data-item-name>No item</b><small>${keyLabel(bindings.item?.[0])} fire · hold ${keyLabel(bindings.lookBack?.[0])} to aim back</small></div>
      </div>
      <div class="hud-count" data-count></div>
      <div class="hud-banner" data-banner></div>
      <div class="hud-wrong" data-wrong hidden>WRONG WAY</div>
      <ul class="hud-feed" data-feed></ul>
    `;
    container.appendChild(this.root);
    const $ = (name) => this.root.querySelector(`[data-${name}]`);
    this.el = {
      rank: $('rank'), lap: $('lap'), time: $('time'), best: $('best'), board: $('board'), speed: $('speed'), nitro: $('nitro'),
      health: $('health'), itemSlot: $('item-slot'), itemIcon: $('item-icon'), itemName: $('item-name'), count: $('count'),
      banner: $('banner'), wrong: $('wrong'), feed: $('feed'), net: $('net'), debug: $('debug')
    };
    this.minimap = new Minimap(track, colors);
    $('map').appendChild(this.minimap.canvas);
    this.cache = new Map();
    this.feedItems = [];
    this.bannerUntil = 0;
    this.online = online;
    this.lastBoardKey = '';
  }

  set(key, element, value, property = 'textContent') {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    element[property] = value;
  }

  /** F3 panel: plain text, or null to hide it. */
  setDebug(text) {
    this.el.debug.hidden = text === null;
    if (text !== null) this.el.debug.textContent = text;
  }

  update(frames, { displayTick, goTick, introTicks, phase, net }) {
    const me = frames.get(this.localId);
    if (!me) return;
    this.set('rank', this.el.rank, String(me.rank));
    this.set('lap', this.el.lap, `${Math.min(me.lapsCompleted + 1, this.laps)}/${this.laps}`);
    const raceTicks = me.finishTicks >= 0 ? me.finishTicks : Math.max(0, displayTick - goTick);
    this.set('time', this.el.time, formatTime((raceTicks / TICK_RATE) * 1000));
    this.set('best', this.el.best, me.bestLapTicks > 0 ? formatTime((me.bestLapTicks / TICK_RATE) * 1000) : '—');
    this.set('speed', this.el.speed, String(Math.round(me.speed * 3.6)));
    this.set('nitro', this.el.nitro.style, `${Math.round(me.nitro)}%`, 'width');
    this.set('health', this.el.health.style, `${Math.round((me.health / me.maxHealth) * 100)}%`, 'width');
    this.el.health.parentElement.classList.toggle('is-low', me.health / me.maxHealth < 0.3);
    if (this.mode !== 'timeTrial') {
      const item = me.item;
      this.set('itemName', this.el.itemName, item ? ITEMS[item].name : 'No item');
      this.set('itemIcon', this.el.itemIcon, item ? ITEM_ICONS[item] : '', 'innerHTML');
      this.el.itemSlot.classList.toggle('has-item', Boolean(item));
    }
    this.el.wrong.hidden = !me.flags.wrongWay;

    const toGo = goTick - displayTick;
    let count = '';
    if (phase === 'countdown' && displayTick >= introTicks && toGo > 0) count = String(Math.ceil(toGo / TICK_RATE));
    else if (toGo <= 0 && toGo > -TICK_RATE * 0.8) count = 'GO!';
    this.set('count', this.el.count, count);
    this.el.count.classList.toggle('is-go', count === 'GO!');

    this.updateBoard(frames);
    this.minimap.draw(frames, this.localId);
    if (performance.now() > this.bannerUntil) this.set('banner', this.el.banner, '');
    this.expireFeed();

    if (this.online && net) {
      this.el.net.hidden = false;
      const text = net.state !== 'connected' ? 'RECONNECTING…' : net.stale ? 'CONNECTION SLOW' : `${Math.round(net.rtt)} ms`;
      this.set('net', this.el.net, text);
      this.el.net.classList.toggle('is-bad', net.state !== 'connected' || net.stale);
    }
  }

  updateBoard(frames) {
    const ordered = [...frames.values()].sort((a, b) => a.rank - b.rank);
    const key = ordered.map((f) => `${f.id}${f.flags.finished ? 'F' : ''}${f.flags.wrecked ? 'W' : ''}${f.flags.botDriven ? 'B' : ''}`).join('|');
    if (key === this.lastBoardKey) return;
    this.lastBoardKey = key;
    this.el.board.innerHTML = ordered
      .map((f) => {
        const status = f.flags.finished ? '🏁' : f.flags.wrecked ? '✖' : f.kind === 'human' && f.flags.botDriven && this.online ? '⚡' : '';
        return `<li class="${f.id === this.localId ? 'is-me' : ''}"><span>${f.rank}</span>${escapeHtml(f.name)}<em>${status}</em></li>`;
      })
      .join('');
  }

  banner(text, tone = '') {
    this.el.banner.className = `hud-banner ${tone ? `hud-banner--${tone}` : ''}`;
    this.cache.set('banner', text);
    this.el.banner.textContent = text;
    this.bannerUntil = performance.now() + BANNER_MS;
  }

  feed(text, tone = '') {
    const li = document.createElement('li');
    li.className = tone ? `is-${tone}` : '';
    li.textContent = text;
    this.el.feed.prepend(li);
    this.feedItems.push({ li, until: performance.now() + FEED_LIFETIME_MS });
    while (this.feedItems.length > FEED_LIMIT) this.feedItems.shift().li.remove();
  }

  expireFeed() {
    const now = performance.now();
    while (this.feedItems.length > 0 && this.feedItems[0].until < now) this.feedItems.shift().li.remove();
  }

  nameOf(id) {
    return this.names.get(id) ?? 'Someone';
  }

  dispose() {
    this.root.remove();
  }
}
