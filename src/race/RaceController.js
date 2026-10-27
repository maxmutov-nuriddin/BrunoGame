import * as THREE from 'three';
import { RULES } from '../../shared/race/rules.ts';
import { ITEMS } from '../../shared/race/items.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import RaceView, { accentFor } from './RaceView.js';
import Hud from './Hud.js';
import EngineAudio from './EngineAudio.js';
import { escapeHtml, ordinal } from '../ui/format.js';
import { keyLabel } from '../ui/icons.js';
import { CAMERA_MODES } from '../core/Settings.js';

const CAMERA_NAMES = { chase: 'Chase camera', far: 'Far camera', hood: 'Hood camera', cockpit: 'Cockpit camera' };
/** First-person modes hide the car body and show the rear-view mirror. */
const FIRST_PERSON = new Set(['hood', 'cockpit']);
/** Mirror size: share of the screen width, clamped in CSS px, and its aspect ratio. */
const MIRROR = { share: 0.28, min: 200, max: 460, aspect: 3.6, top: 12 };

const RESULTS_DELAY_MS = 2600;
const STALE_SNAPSHOT_SECONDS = 1.2;

/** One race on screen: session (local or online) + view + HUD + audio, from intro to results. */
export default class RaceController {
  constructor(game, { session, mode, onFinished, onQuit, onRestart }) {
    this.game = game;
    this.session = session;
    this.mode = mode;
    this.onFinished = onFinished;
    this.onQuit = onQuit;
    this.onRestart = onRestart;
    this.introSkipped = false;
    this.paused = false;
    this.lastCount = '';
    this.endedAt = 0;
    this.resultsShown = false;
  }

  enter() {
    const { game, session } = this;
    const participants = session.config.participants;
    this.localId = session.localId;
    this.view = new RaceView(game.resources, game.renderer, {
      track: session.track, participants, localId: this.localId, quality: game.settings.get('quality'), showTags: session.kind === 'online'
    });
    this.view.chase.reducedMotion = game.settings.get('reducedMotion');
    game.renderer.setView(this.view.scene, this.view.camera);
    this.colors = new Map(participants.map((p, i) => [p.id, accentFor(i)]));
    this.hud = new Hud(game.overlay, {
      track: session.track, laps: session.config.laps, participants, localId: this.localId, online: session.kind === 'online',
      bindings: game.settings.get('bindings'), colors: this.colors, mode: this.mode
    });
    this.buildIntro(participants);
    // Enter or Space also skips the intro (the race has not started, so they do nothing else yet).
    this.onIntroKey = (event) => {
      if ((event.code === 'Enter' || event.code === 'Space') && this.inIntro) this.skipIntro();
    };
    window.addEventListener('keydown', this.onIntroKey);
    this.buildTouch();
    game.input.setMode('race');
    game.audio.playMusic('race');
    this.engines = new EngineAudio(game.audio, participants, this.localId);
    this.gridCenter = this.computeGridCenter();
  }

  computeGridCenter() {
    const grid = this.session.track.grid;
    const center = new THREE.Vector3();
    for (const slot of grid) center.add(new THREE.Vector3(slot.x, slot.y, slot.z));
    return center.divideScalar(grid.length);
  }

  buildIntro(participants) {
    const { track, config } = this.session;
    this.intro = document.createElement('div');
    this.intro.className = 'race-intro';
    this.intro.innerHTML = `
      <div class="race-intro__title">
        <small>${this.mode === 'timeTrial' ? 'TIME TRIAL' : this.session.kind === 'online' ? 'ONLINE RACE' : 'SOLO RACE'} · ${config.laps} ${config.laps === 1 ? 'LAP' : 'LAPS'}</small>
        <h1>${escapeHtml(track.name)}</h1>
        <p>${Math.round(track.length)} m · code ${escapeHtml(track.seed)}</p>
      </div>
      <ol class="race-intro__grid">
        ${participants.map((p, i) => `<li style="--accent:${accentFor(i)}"><span>${i + 1}</span>${escapeHtml(p.name)}<em>${p.kind === 'bot' ? 'BOT' : ''}</em></li>`).join('')}
      </ol>
      <button class="race-intro__skip" type="button">Skip intro <kbd>${keyLabel('Enter')}</kbd></button>
    `;
    this.intro.querySelector('button').addEventListener('click', () => this.skipIntro());
    this.game.overlay.appendChild(this.intro);
  }

  buildTouch() {
    this.touch = document.createElement('div');
    this.touch.className = 'touch-race';
    this.touch.innerHTML = `
      <div class="touch-race__left">
        <button data-a="left" aria-label="Steer left">◀</button>
        <button data-a="right" aria-label="Steer right">▶</button>
      </div>
      <div class="touch-race__right">
        <button data-a="item" class="is-accent" ${this.mode === 'timeTrial' ? 'hidden' : ''}>ITEM</button>
        <button data-a="nitro">NITRO</button>
        <button data-a="handbrake">DRIFT</button>
        <button data-a="brake">BRAKE</button>
        <button data-a="throttle" class="is-gas">GAS</button>
        <button data-a="reset" class="is-small">RESET</button>
        <button data-a="camera" class="is-small">CAM</button>
        <button data-a="pause" class="is-small">II</button>
      </div>`;
    for (const button of this.touch.querySelectorAll('button')) this.game.input.bindTouch(button, button.dataset.a);
    this.game.overlay.appendChild(this.touch);
  }

  cycleCamera() {
    const current = this.game.settings.get('cameraMode');
    const next = CAMERA_MODES[(CAMERA_MODES.indexOf(current) + 1) % CAMERA_MODES.length];
    this.game.settings.set('cameraMode', next);
    this.view.chase.snap();
    this.hud.feed(CAMERA_NAMES[next]);
  }

  skipIntro() {
    if (this.introSkipped) return;
    this.introSkipped = true;
    this.view.chase.snap();
  }

  get inIntro() {
    return !this.introSkipped && this.session.displayTick < RULES.introTicks;
  }

  update(dt) {
    const { game, session } = this;
    const input = game.input;
    if (input.consume('pause')) this.togglePause();
    if (input.consume('camera')) this.cycleCamera();
    if (input.consume('item') && this.inIntro) this.skipIntro();
    input.clearPressed();

    const drive = input.readDrive();
    // Online, the menu does not pause the race; the car just coasts while it is open.
    session.update(dt, this.paused ? { ...drive, throttle: 0, nitro: false, useItem: false } : drive);
    const frames = session.readFrames(dt);
    const world = session.readWorld();
    for (const entry of session.drainEvents()) this.handleEvent(entry.e, frames);
    this.view.update(dt, frames, world);

    const me = frames.get(this.localId);
    this.updateCamera(dt, me);
    if (this.intro && !this.inIntro) {
      this.intro.classList.add('is-hidden');
      const intro = this.intro;
      this.intro = null;
      setTimeout(() => intro.remove(), 500);
    }

    const net = session.kind === 'online' ? { state: game.net.state, rtt: game.net.rtt, stale: session.snapshotAge > STALE_SNAPSHOT_SECONDS } : null;
    this.hud.update(frames, { displayTick: session.displayTick, goTick: session.goTick, introTicks: RULES.introTicks, phase: session.phase, net });
    this.countdownSounds();

    if (me) {
      const speedRatio = Math.min(1, me.speed / me.maxSpeed);
      game.renderer.setSpeedEffect(this.inIntro ? 0 : Math.max(0, speedRatio - 0.55) * 1.6 + (me.flags.nitro ? 0.45 : 0));
      if (!this.paused) this.engines.update(frames, this.view.camera, session.displayTick >= session.goTick);
      else game.audio.silenceDriving();
    }

    if (session.ended && !this.endedAt) this.endedAt = performance.now();
    if (this.endedAt && !this.resultsShown && performance.now() - this.endedAt > RESULTS_DELAY_MS) {
      this.resultsShown = true;
      this.onFinished(session.kind === 'local' ? session.results() : session.results);
    }
  }

  updateCamera(dt, me) {
    const { renderer } = this.game;
    if (this.inIntro) {
      const t = Math.min(1, this.session.displayTick / RULES.introTicks);
      this.view.chase.orbit(this.gridCenter, t);
      renderer.setDepthOfField({ enabled: true, focus: this.view.camera.position.distanceTo(this.gridCenter), aperture: 0.00035, maxblur: 0.008 });
      this.wasIntro = true;
      return;
    }
    if (this.wasIntro) {
      this.wasIntro = false;
      this.view.chase.snap();
      renderer.setDepthOfField(null);
    }
    if (!me) return;
    const mode = this.game.settings.get('cameraMode');
    this.view.setLocalCarVisible(mode !== 'hood', mode === 'cockpit');
    this.view.cockpit?.update(me, mode === 'cockpit', dt);
    this.updateMirror(me, FIRST_PERSON.has(mode) && this.game.settings.get('rearMirror'));
    this.view.chase.update(dt, me, {
      mode,
      mount: mode === 'cockpit' ? this.view.cockpit?.mount : undefined,
      maxSpeed: me.maxSpeed,
      lookBack: this.game.input.isDown('lookBack'),
      raycast: (origin, direction, distance) => this.session.raycast(origin, direction, distance)
    });
  }

  /** Rear-view mirror at the top centre; the frame is a DOM element over the rendered image. */
  updateMirror(me, visible) {
    const { renderer } = this.game;
    if (!visible) {
      renderer.setMirror(null);
      if (this.mirrorFrame) this.mirrorFrame.hidden = true;
      return;
    }
    const width = Math.round(Math.min(MIRROR.max, Math.max(MIRROR.min, window.innerWidth * MIRROR.share)));
    const rect = { x: Math.round((window.innerWidth - width) / 2), y: MIRROR.top, width, height: Math.round(width / MIRROR.aspect) };
    this.view.chase.updateMirror(me);
    renderer.setMirror({ scene: this.view.scene, camera: this.view.chase.mirror, rect, hidden: [this.view.localCarGroup].filter(Boolean) });
    if (!this.mirrorFrame) {
      this.mirrorFrame = document.createElement('div');
      this.mirrorFrame.className = 'rear-mirror';
      this.game.layout.appendChild(this.mirrorFrame);
    }
    this.mirrorFrame.hidden = false;
    Object.assign(this.mirrorFrame.style, { left: `${rect.x - 4}px`, top: `${rect.y - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
  }

  countdownSounds() {
    const { displayTick, goTick } = this.session;
    if (displayTick < RULES.introTicks) return;
    const toGo = goTick - displayTick;
    const count = toGo > 0 ? String(Math.ceil(toGo / TICK_RATE)) : 'GO';
    if (count === this.lastCount) return;
    this.lastCount = count;
    this.game.audio.play(count === 'GO' ? 'go' : 'countdown');
  }

  handleEvent(e, frames) {
    const { hud, game, view } = this;
    const me = this.localId;
    const audio = game.audio;
    const isMe = e.car === me;
    const name = (id) => hud.nameOf(id);
    const near = (x, z) => {
      const local = frames.get(me);
      if (!local) return { volume: 0.5, pan: 0 };
      const distance = Math.hypot(local.position.x - x, local.position.z - z);
      return { intensity: Math.max(0.15, 1 - distance / 120), pan: 0 };
    };
    switch (e.t) {
      case 'launch':
        if (isMe) {
          hud.banner(e.quality === 'perfect' ? 'PERFECT START!' : 'ENGINE BOGGED', e.quality === 'perfect' ? 'good' : 'bad');
          if (e.quality === 'perfect') audio.play('launch');
        }
        break;
      case 'lap':
        if (!isMe) break;
        audio.play('lap');
        if (e.lap === this.session.config.laps - 1) hud.banner('FINAL LAP', 'good');
        else if (e.lap < this.session.config.laps) hud.banner(`LAP ${e.lap + 1}`);
        if (e.best && e.lap > 1) hud.feed('New best lap!', 'good');
        break;
      case 'finish':
        if (isMe) {
          hud.banner(`FINISHED ${ordinal(e.rank)}`, 'good');
          audio.play('finish');
        } else hud.feed(`${name(e.car)} finished ${ordinal(e.rank)}`);
        break;
      case 'dnf':
        hud.feed(`${name(e.car)} did not finish`, 'bad');
        break;
      case 'fire':
        if (isMe || this.mode !== 'timeTrial') audio.play(e.item === 'missile' ? 'missile' : e.item === 'pulse' ? 'pulse' : e.item === 'mine' ? 'mine' : e.item === 'shield' ? 'shield' : e.item === 'repair' ? 'repair' : e.item === 'nitro' ? 'nitroCell' : 'shock', isMe ? {} : { intensity: 0.5 });
        break;
      case 'hit':
        if (e.item === 'crash') break;
        if (isMe) {
          view.chase.addShake(e.blocked ? 0.2 : 0.6);
          audio.play(e.blocked ? 'shieldBlock' : 'hit');
          hud.feed(e.blocked ? `Shield blocked ${ITEMS[e.item].name}` : `${e.by ? name(e.by) : 'Something'} hit you · ${ITEMS[e.item].name}`, e.blocked ? '' : 'bad');
        } else if (e.by === me) {
          hud.feed(e.blocked ? `${name(e.car)} blocked it` : `You hit ${name(e.car)}!`, 'good');
        }
        break;
      case 'explode': {
        view.explosion(e.x, e.y, e.z, e.item);
        audio.play(e.item === 'shock' ? 'shock' : 'explosion', near(e.x, e.z));
        break;
      }
      case 'pickup':
        if (isMe) {
          audio.play('pickup');
          hud.feed(`Got ${ITEMS[e.item].name}`);
        }
        break;
      case 'wreck':
        view.explosion(e.x, e.y, e.z, 'missile');
        audio.play('wreck', near(e.x, e.z));
        if (isMe) {
          hud.banner('WRECKED', 'bad');
          view.chase.addShake(1);
        } else hud.feed(`${name(e.car)} wrecked`, '');
        break;
      case 'crash':
        if (e.impact > 1.5) view.sparks(e.x, e.y, e.z, e.impact);
        if (isMe) {
          audio.play('crash', { intensity: Math.min(1, e.impact / 8) });
          view.chase.addShake(Math.min(0.6, e.impact / 12));
        }
        break;
      case 'drift':
        if (isMe && e.phase === 'boost') {
          audio.play('driftBoost');
          hud.feed('Drift boost', 'good');
        }
        break;
      case 'wrongWay':
        if (isMe && e.on) audio.play('wrongWay');
        break;
      case 'land':
        if (isMe && e.airTime > 0.6) {
          view.chase.addShake(Math.min(0.5, e.airTime / 3));
          audio.play('land', { intensity: Math.min(1, e.airTime) });
        }
        break;
      case 'respawn':
        if (isMe) view.chase.snap();
        break;
      default:
        break;
    }
  }

  togglePause() {
    if (this.resultsShown) return;
    if (this.paused) return this.closePause();
    this.paused = true;
    this.session.setPaused(true);
    this.game.audio.silenceDriving();
    const online = this.session.kind === 'online';
    this.pauseMenu = document.createElement('div');
    this.pauseMenu.className = 'pause-menu';
    this.pauseMenu.innerHTML = `
      <div class="panel pause-menu__panel">
        <h2>${online ? 'Race menu' : 'Paused'}</h2>
        ${online ? '<p class="muted">The race keeps running for everyone else.</p>' : ''}
        <button class="btn btn--primary" data-act="resume">Resume</button>
        ${online ? '' : '<button class="btn" data-act="restart">Restart</button>'}
        <button class="btn" data-act="settings">Settings</button>
        <button class="btn btn--ghost" data-act="quit">${online ? 'Leave race' : 'Quit to menu'}</button>
      </div>`;
    this.pauseMenu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (!action) return;
      this.game.audio.play('ui');
      if (action === 'resume') this.closePause();
      if (action === 'restart') this.onRestart?.();
      if (action === 'quit') this.onQuit();
      if (action === 'settings') this.game.openSettings();
    });
    this.game.overlay.appendChild(this.pauseMenu);
    this.game.input.setMode('menu');
  }

  closePause() {
    this.paused = false;
    this.session.setPaused(false);
    this.pauseMenu?.remove();
    this.pauseMenu = null;
    this.game.input.setMode('race');
  }

  exit() {
    window.removeEventListener('keydown', this.onIntroKey);
    this.game.renderer.setMirror(null);
    this.mirrorFrame?.remove();
    this.game.renderer.setSpeedEffect(0);
    this.game.renderer.setDepthOfField(null);
    this.game.audio.silenceDriving();
    this.engines?.dispose();
    this.view?.dispose();
    this.hud?.dispose();
    this.intro?.remove();
    this.touch?.remove();
    this.pauseMenu?.remove();
    this.session.dispose();
  }
}
