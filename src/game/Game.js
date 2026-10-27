import { createRng } from '../../shared/rng.ts';
import { PUBLIC_VEHICLES } from '../../shared/vehicles.ts';
import { trackForSeed } from '../../shared/track/presets.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import Settings, { Records } from '../core/Settings.js';
import Input from '../core/Input.js';
import Renderer from '../core/Renderer.js';
import AudioEngine from '../audio/AudioEngine.js';
import NetClient from '../net/NetClient.js';
import OnlineService from '../net/OnlineService.js';
import AccountSync from '../net/AccountSync.js';
import Resources from '../Resources.js';
import Showroom from '../scenes/Showroom.js';
import LocalRaceSession from '../race/LocalRaceSession.js';
import OnlineRaceSession from '../race/OnlineRaceSession.js';
import RaceController from '../race/RaceController.js';
import LoadingScreen from '../ui/screens/LoadingScreen.js';
import MenuScreen from '../ui/screens/MenuScreen.js';
import GarageScreen from '../ui/screens/GarageScreen.js';
import SoloScreen from '../ui/screens/SoloScreen.js';
import OnlineScreen from '../ui/screens/OnlineScreen.js';
import FriendsScreen from '../ui/screens/FriendsScreen.js';
import LobbyScreen from '../ui/screens/LobbyScreen.js';
import ResultsScreen from '../ui/screens/ResultsScreen.js';
import SettingsModal from '../ui/SettingsModal.js';
import { formatTime } from '../ui/format.js';
import { html } from '../ui/dom.js';
import { onUpdateAvailable, applyUpdate, seedOfflineCache } from '../Network.js';

/** Dynamic resolution aims for this frame rate when the frame rate is uncapped. */
const UNCAPPED_TARGET_FPS = 60;

const BOT_NAMES = ['Vex', 'Ronan', 'Kira', 'Taro', 'Mila', 'Juno', 'Axel', 'Nadia', 'Orion', 'Suki'];
const TOAST_MS = 2600;
const MAX_FRAME_DT = 0.1;
/** Menus, garage and lobby do not need more than this; keeps the GPU cool between races. */
const MENU_FPS = 30;
/** rAF timestamps jitter; without slack a 60 fps cap on a 60 Hz screen would drop every other frame. */
const FRAME_SLACK_MS = 2;

/**
 * Top-level flow: Loading → Menu → (Solo | Friends → Lobby | Garage | Settings)
 * → Race (intro, countdown, race) → Results → again.
 */
export default class Game {
  constructor(root) {
    this.root = root;
    this.root.innerHTML = '';
    this.layout = html(`
      <div class="game">
        <div class="game__canvas"></div>
        <div class="game__overlay"></div>
        <div class="game__screens"></div>
        <div class="game__modals"></div>
        <div class="game__toasts" aria-live="polite"></div>
      </div>`);
    root.appendChild(this.layout);
    this.canvasHost = this.layout.querySelector('.game__canvas');
    this.overlay = this.layout.querySelector('.game__overlay');
    this.screens = this.layout.querySelector('.game__screens');
    this.modals = this.layout.querySelector('.game__modals');
    this.toasts = this.layout.querySelector('.game__toasts');

    this.settings = new Settings();
    this.input = new Input(this.settings);
    this.audio = new AudioEngine(this.settings);
    this.net = new NetClient(this.settings);
    this.online = new OnlineService(this.net, this.settings);
    this.accountSync = new AccountSync(this.online, this.settings);
    this.renderer = new Renderer(this.canvasHost, this.settings.get('quality'));
    this.renderer.setReducedMotion(this.settings.get('reducedMotion'));
    this.room = null;
    this.state = null;
    this.screen = null;
    this.updateAvailable = false;
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', () => this.onResize());
    onUpdateAvailable(() => {
      this.updateAvailable = true;
      this.screen?.refresh?.();
    });
    this.bindNet();
  }

  async boot() {
    requestAnimationFrame(this.loop);
    const loading = new LoadingScreen(this.screens);
    this.resources = new Resources();
    this.resources.addEventListener('progress', (event) => loading.progress(event.detail.progress, event.detail.label));
    const load = async () => {
      try {
        await this.resources.load();
        return true;
      } catch (error) {
        console.error(error);
        loading.failed('Some game files could not be loaded. Check your connection and retry.', () => load().then((ok) => ok && this.afterLoad(loading)));
        return false;
      }
    };
    if (await load()) await this.afterLoad(loading);
  }

  async afterLoad(loading) {
    this.showroom = new Showroom(this.resources);
    this.showroom.showVehicle(this.settings.get('vehicleId'));
    this.setScene(this.showroom.scene, this.showroom.camera, true);
    seedOfflineCache();
    this.accountSync.start();
    await loading.waitForStart();
    this.audio.unlock();
    loading.dispose();

    const params = new URLSearchParams(window.location.search);
    const invite = params.get('room');
    if (invite) {
      params.delete('room');
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState(null, '', url);
      this.showFriends(invite.toUpperCase());
    } else if (this.net.storedSession()) {
      // A guest reloading mid-session re-links to the same host and resumes the seat; a reloaded host's room is gone.
      this.showMenu();
      this.online.resume(this.net.storedSession().key).catch(() => this.net.disconnect());
    } else {
      this.showMenu();
    }
  }

  bindNet() {
    this.net.addEventListener('room', (event) => {
      this.room = event.detail;
      this.screen?.update?.(this.room);
      if (this.room && (this.screenName === 'friends' || this.screenName === 'online' || this.screenName === 'menu')) this.showLobby();
    });
    this.net.addEventListener('raceSetup', (event) => this.startOnlineRace(event.detail.setup));
    this.net.addEventListener('left', () => {
      const wasPublic = this.room?.public;
      this.room = null;
      if (this.screenName === 'lobby' || this.screenName === 'results') (wasPublic ? this.showOnline() : this.showFriends());
    });
    this.net.addEventListener('error', (event) => this.toast(event.detail.message, true));
    this.net.addEventListener('state', (event) => {
      if (event.detail === 'reconnecting') this.toast('Connection lost · reconnecting…', true);
    });
    this.net.addEventListener('gaveUp', (event) => {
      this.toast(event.detail || 'Lost the connection to the host.', true);
      const wasPublic = this.room?.public;
      this.room = null;
      void this.online.leave();
      // The host is gone (rooms live in the host's browser): back to where a new game can be found.
      const back = () => (wasPublic ? this.showOnline() : this.showFriends());
      if (this.state instanceof RaceController && this.state.session.kind === 'online') this.endState(back);
      else if (this.screenName === 'lobby' || this.screenName === 'results') back();
    });
  }

  /** Minimum milliseconds between rendered frames, or 0 for uncapped. */
  frameInterval() {
    const racing = this.state && !this.screen;
    const cap = racing ? this.settings.get('fpsCap') : MENU_FPS;
    return cap ? 1000 / cap : 0;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (now - this.lastTime < this.frameInterval() - FRAME_SLACK_MS) return;
    const dt = Math.min(MAX_FRAME_DT, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.state?.update && !this.screen) this.state.update(dt);
    else if (this.showroom && this.sceneIsShowroom) {
      this.showroom.update(dt, this.settings.get('reducedMotion'));
      this.renderer.setDepthOfField({ enabled: true, focus: this.showroom.focusDistance(), aperture: 0.0005, maxblur: 0.008 });
    } else if (this.state?.update) {
      // Results over a finished race: keep the scene alive behind the screen.
      this.state.update(dt);
    }
    this.renderer.adaptResolution(dt, this.settings.get('fpsCap') || UNCAPPED_TARGET_FPS);
    this.renderer.render(dt);
  }

  setScene(scene, camera, isShowroom = false) {
    this.sceneIsShowroom = isShowroom;
    this.renderer.setView(scene, camera);
    if (!isShowroom) this.renderer.setDepthOfField(null);
  }

  onResize() {
    this.renderer.resize();
    this.showroom?.resize();
    this.state?.view?.chase?.resize();
    this.state?.camera?.resize?.();
  }

  /** Swap the menu screen. With no race running, menu screens sit on the showroom backdrop. */
  setScreen(name, factory) {
    this.screen?.dispose();
    this.screenName = name;
    this.screen = factory ? factory() : null;
    if (factory && !this.state) {
      this.input.setMode('menu');
      this.setScene(this.showroom.scene, this.showroom.camera, true);
      this.audio.playMusic('menu');
    }
  }

  endState(next) {
    this.state?.exit?.();
    this.state = null;
    this.modals.innerHTML = '';
    next?.();
  }

  showMenu() {
    this.showroom.showVehicle(this.settings.get('vehicleId'));
    this.setScreen('menu', () => new MenuScreen(this, {
      onSolo: () => this.showSolo(),
      onOnline: () => this.showOnline(),
      onFriends: () => this.showFriends(),
      onGarage: () => this.showGarage(() => this.showMenu()),
      onSettings: () => this.openSettings()
    }));
  }

  showGarage(back) {
    this.setScreen('garage', () => new GarageScreen(this, {
      showroom: this.showroom,
      onSelect: (id) => {
        this.settings.set('vehicleId', id);
        if (this.room) this.net.send({ type: 'setVehicle', vehicleId: id });
      },
      onBack: () => {
        this.showroom.showVehicle(this.settings.get('vehicleId'));
        back();
      }
    }));
  }

  showSolo() {
    this.showroom.showVehicle(this.settings.get('vehicleId'));
    this.setScreen('solo', () => new SoloScreen(this, {
      onBack: () => this.showMenu(),
      onGarage: () => this.showGarage(() => this.showSolo()),
      onStart: (setup) => this.startSoloRace(setup)
    }));
  }

  showFriends(prefillCode = '') {
    this.setScreen('friends', () => new FriendsScreen(this, { onBack: () => this.leaveOnline(), prefillCode }));
  }

  /** Quick play search; `autoStart` searches straight away (after "Find next race"). */
  showOnline(autoStart = false) {
    this.setScreen('online', () => new OnlineScreen(this, { onBack: () => this.leaveOnline(), autoStart }));
  }

  showLobby() {
    this.setScreen('lobby', () => new LobbyScreen(this, { onLeave: () => this.leaveRoom() }));
  }

  leaveRoom() {
    const wasPublic = this.room?.public;
    // Peer-to-peer: a guest drops its link; a host closes the room for everyone.
    void this.online.leave();
    this.room = null;
    if (wasPublic) this.showOnline();
    else this.showFriends();
  }

  leaveOnline() {
    if (!this.room) void this.online.leave();
    this.showMenu();
  }

  soloParticipants(setup) {
    const you = { id: 'you', name: this.settings.get('name'), vehicleId: this.settings.get('vehicleId'), kind: 'human' };
    if (setup.mode === 'timeTrial') return [you];
    const rng = createRng(`${setup.seed}|${Date.now()}`);
    const names = [...BOT_NAMES];
    const bots = Array.from({ length: setup.bots }, (_, i) => ({
      id: `bot${i + 1}`,
      name: names.splice(Math.floor(rng.next() * names.length), 1)[0],
      vehicleId: rng.pick(PUBLIC_VEHICLES).id,
      kind: 'bot',
      difficulty: setup.difficulty
    }));
    // A different grid slot every race: sometimes on pole, sometimes chasing from the back.
    const all = [...bots];
    all.splice(rng.int(0, all.length), 0, you);
    return all;
  }

  async startSoloRace(setup) {
    this.toast('Building the track…');
    const track = trackForSeed(setup.seed);
    const config = {
      track, laps: setup.laps, mode: setup.mode === 'timeTrial' ? 'timeTrial' : 'race',
      itemsEnabled: setup.mode !== 'timeTrial' && setup.items, participants: this.soloParticipants(setup), seed: `${setup.seed}-${Date.now()}`
    };
    const session = await LocalRaceSession.create(config, 'you');
    this.setScreen(null);
    this.endState();
    this.state = new RaceController(this, {
      session,
      mode: config.mode,
      onFinished: (results) => this.showSoloResults(results, setup, track),
      onQuit: () => this.endState(() => this.showMenu()),
      onRestart: () => this.endState(() => this.startSoloRace(setup))
    });
    this.state.enter();
  }

  showSoloResults(results, setup, track) {
    let recordNote = '';
    const mine = results.find((r) => r.id === 'you');
    if (setup.mode === 'timeTrial' && mine?.finished && mine.bestLapTicks > 0) {
      const lapMs = (mine.bestLapTicks / TICK_RATE) * 1000;
      const totalMs = (mine.totalTicks / TICK_RATE) * 1000;
      const improved = Records.submit(track, this.settings.get('vehicleId'), lapMs, totalMs);
      const best = Records.get(track, this.settings.get('vehicleId'));
      recordNote = improved ? `New record! Best lap ${formatTime(lapMs)}` : `Record to beat: ${formatTime(best.bestLapMs)}`;
    }
    this.state.hud?.dispose();
    this.input.setMode('menu');
    this.setScreen('results', () => new ResultsScreen(this, {
      results, localId: 'you', mode: setup.mode, online: false, recordNote,
      onRestart: () => {
        this.setScreen(null);
        this.endState(() => this.startSoloRace(setup));
      },
      onSetup: () => this.endState(() => this.showSolo()),
      onMenu: () => this.endState(() => this.showMenu())
    }));
  }

  async startOnlineRace(setup) {
    if (this.state instanceof RaceController && this.state.session.kind === 'online' && this.state.session.setup.raceId === setup.raceId) return;
    this.setScreen(null);
    this.endState();
    const session = await OnlineRaceSession.create(this.net, setup);
    this.state = new RaceController(this, {
      session,
      mode: 'race',
      onFinished: (results) => this.showOnlineResults(results, setup),
      onQuit: () => {
        this.endState();
        this.leaveRoom();
      }
    });
    this.state.enter();
    this.net.send({ type: 'loaded', raceId: setup.raceId });
  }

  showOnlineResults(results, setup) {
    this.state.hud?.dispose();
    this.input.setMode('menu');
    const quickPlay = Boolean(this.room?.public);
    this.setScreen('results', () => new ResultsScreen(this, {
      results: results ?? [], localId: setup.youId, mode: 'race', online: true, quickPlay,
      onNextRace: () => {
        // A quick-play room is locked after its race: leave it and search for the next one.
        void this.online.leave();
        this.room = null;
        this.endState(() => this.showOnline(true));
      },
      onRematch: () => {
        const me = this.room?.players.find((p) => p.id === this.room.youId);
        if (me?.host) this.net.send({ type: 'startRace' });
        else this.net.send({ type: 'setReady', ready: true });
      },
      onLobby: () => {
        if (this.room?.players.find((p) => p.id === this.room.youId)?.host) this.net.send({ type: 'returnToLobby' });
        this.endState(() => this.showLobby());
      },
      onMenu: () => {
        this.endState();
        this.leaveRoom();
      }
    }));
  }

  openSettings() {
    if (this.modals.querySelector('.modal')) return;
    const previousMode = this.input.mode;
    this.input.setMode('menu');
    new SettingsModal(this, () => this.input.setMode(previousMode));
  }

  applySettings() {
    this.renderer.setQuality(this.settings.get('quality'));
    this.renderer.setReducedMotion(this.settings.get('reducedMotion'));
    if (this.state?.view?.chase) this.state.view.chase.reducedMotion = this.settings.get('reducedMotion');
  }

  applyUpdate() {
    // Only offered from menus, never mid-race.
    if (this.state) return;
    applyUpdate();
  }

  toast(text, bad = false) {
    const toast = html(`<div class="toast ${bad ? 'is-bad' : ''}"></div>`);
    toast.textContent = text;
    this.toasts.appendChild(toast);
    setTimeout(() => toast.remove(), TOAST_MS);
  }
}
