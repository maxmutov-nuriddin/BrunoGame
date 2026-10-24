import * as THREE from 'three';
import { gsap } from 'gsap';
import { Howl, Howler } from 'howler';
import Renderer from './Renderer.js';
import Camera from './Camera.js';
import Controls from './Controls.js';
import Physics from './Physics.js';
import Resources from './Resources.js';
import Car from './World/Car.js';
import Floor from './World/Floor.js';
import Objects from './World/Objects.js';
import WorldPack from './World/WorldPack.js';
import { normalizeSeedCode, randomSeedCode } from './World/pack/seed.js';
import { seedOfflineCache, watchConnection } from './Network.js';
import { VEHICLES, findVehicle } from './vehicles.js';

const VEHICLE_STORAGE_KEY = 'bruno-game:vehicle';
const SEED_QUERY_PARAM = 'seed';

function initialSeedCode() {
  const fromUrl = normalizeSeedCode(new URLSearchParams(window.location.search).get(SEED_QUERY_PARAM));
  return fromUrl.length >= 4 ? fromUrl : randomSeedCode();
}

function writeSeedToUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set(SEED_QUERY_PARAM, code);
  window.history.replaceState(null, '', url);
}

function loadSavedVehicle() {
  try {
    return findVehicle(window.localStorage.getItem(VEHICLE_STORAGE_KEY));
  } catch {
    return findVehicle(null);
  }
}

function saveVehicle(id) {
  try {
    window.localStorage.setItem(VEHICLE_STORAGE_KEY, id);
  } catch {
    // Storage can be blocked; the choice just won't persist.
  }
}

export default class Application {
  constructor(root) {
    this.root = root;
    this.started = false;
    this.ready = false;
    this.activeSection = null;
    this.openSectionId = null;
    this.currentPromptId = null;
    this.vehicle = loadSavedVehicle();
    this.seedCode = initialSeedCode();
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#89d2ff');
    this.scene.fog = new THREE.Fog('#89d2ff', 180, 1200);

    this.tick = this.tick.bind(this);
    this.handleResize = this.handleResize.bind(this);

    this.buildLayout();
    this.init().catch((error) => {
      console.error(error);
      this.loadingStatus.textContent = 'Something went sideways while booting the world.';
    });
  }

  buildLayout() {
    this.root.innerHTML = `
      <div class="experience">
        <div class="experience__canvas"></div>

        <div class="loading-screen">
          <div class="loading-card">
            <p class="loading-card__eyebrow">Playable Portfolio</p>
            <h1>Drive the work.</h1>
            <p class="loading-card__body">
              Cruise through a bright low-poly city, slam into ramps, and inspect sections by parking next to them.
            </p>

            <div class="garage" role="radiogroup" aria-label="Choose a vehicle">
              ${VEHICLES.map(
                (vehicle) => `
                <button class="garage__item" type="button" role="radio" data-vehicle="${vehicle.id}">
                  <strong>${vehicle.name}</strong>
                  <span>${vehicle.role}</span>
                  <em>${vehicle.zone}</em>
                </button>`
              ).join('')}
            </div>

            <div class="seed-row">
              <label for="world-seed">World code</label>
              <input id="world-seed" class="seed-row__input" type="text" maxlength="9" autocomplete="off" spellcheck="false" />
              <button class="seed-row__random" type="button">Random</button>
            </div>

            <div class="loading-progress">
              <div class="loading-progress__bar"></div>
            </div>

            <div class="loading-card__footer">
              <span class="loading-status">Preparing world assets...</span>
              <button class="start-button" type="button">Start Engine</button>
            </div>
          </div>
        </div>

        <div class="hud">
          <div class="hud-card">
            <span class="hud-card__label">Current Mission</span>
            <span class="hud-card__title">Find a section sign and press Enter or tap ACT.</span>
            <div class="hud-meta">
              <span class="hud-chip"><strong>Speed</strong> <span data-speed>0 km/h</span></span>
              <span class="hud-chip"><strong>Zone</strong> <span data-zone>Free roam</span></span>
              <span class="hud-chip"><strong>Jump</strong> <span data-jump>Ready</span></span>
              <span class="hud-chip"><strong>World</strong> <span data-seed>-</span></span>
              <span class="hud-chip"><strong>Net</strong> <span data-network>Online</span></span>
            </div>
          </div>

          <div class="hud-help">
            <strong>Controls</strong>
            <p>WASD or touch drive, Shift boost, Space jump, Ctrl brake, R recover, Enter interact.</p>
          </div>
        </div>

        <div class="touch-controls" aria-label="Touch controls">
          <div class="touch-controls__cluster touch-controls__cluster--drive">
            <button class="touch-button touch-button--drive" type="button" data-touch-hold="forward">UP</button>
            <div class="touch-controls__row">
              <button class="touch-button" type="button" data-touch-hold="left">LEFT</button>
              <button class="touch-button" type="button" data-touch-hold="right">RIGHT</button>
            </div>
            <button class="touch-button touch-button--drive" type="button" data-touch-hold="backward">DOWN</button>
          </div>

          <div class="touch-controls__cluster touch-controls__cluster--actions">
            <button class="touch-button touch-button--accent" type="button" data-touch-tap="jump">JUMP</button>
            <button class="touch-button" type="button" data-touch-hold="boost">BOOST</button>
            <button class="touch-button" type="button" data-touch-hold="brake">BRAKE</button>
            <button class="touch-button touch-button--accent" type="button" data-touch-tap="interact">ACT</button>
          </div>
        </div>

        <div class="prompt">
          <div class="prompt__title">Projects zone nearby</div>
          <div class="prompt__copy">Press Enter or tap ACT to inspect this section.</div>
        </div>

        <aside class="section-panel">
          <div class="section-panel__eyebrow">Drive closer to a sign</div>
          <h2>Portfolio Panel</h2>
          <p>Section details appear here when you interact.</p>
          <div class="card-list"></div>
          <button class="section-panel__close" type="button">Close panel</button>
        </aside>
      </div>
    `;

    this.experience = this.root.querySelector('.experience');
    this.canvasWrap = this.root.querySelector('.experience__canvas');
    this.loadingScreen = this.root.querySelector('.loading-screen');
    this.loadingBar = this.root.querySelector('.loading-progress__bar');
    this.loadingStatus = this.root.querySelector('.loading-status');
    this.startButton = this.root.querySelector('.start-button');
    this.prompt = this.root.querySelector('.prompt');
    this.promptTitle = this.root.querySelector('.prompt__title');
    this.promptCopy = this.root.querySelector('.prompt__copy');
    this.panel = this.root.querySelector('.section-panel');
    this.panelClose = this.root.querySelector('.section-panel__close');
    this.panelCards = this.root.querySelector('.card-list');
    this.panelEyebrow = this.root.querySelector('.section-panel__eyebrow');
    this.panelTitle = this.root.querySelector('.section-panel h2');
    this.panelDescription = this.root.querySelector('.section-panel p');
    this.hudTitle = this.root.querySelector('.hud-card__title');
    this.hudSpeed = this.root.querySelector('[data-speed]');
    this.hudZone = this.root.querySelector('[data-zone]');
    this.hudJump = this.root.querySelector('[data-jump]');
    this.hudNetwork = this.root.querySelector('[data-network]');
    this.seedInput = this.root.querySelector('.seed-row__input');
    this.seedRandomButton = this.root.querySelector('.seed-row__random');
    this.hudSeed = this.root.querySelector('[data-seed]');
    this.garageButtons = [...this.root.querySelectorAll('[data-vehicle]')];
    this.touchHoldButtons = [...this.root.querySelectorAll('[data-touch-hold]')];
    this.touchTapButtons = [...this.root.querySelectorAll('[data-touch-tap]')];

    watchConnection(this.hudNetwork);
    this.panelClose.addEventListener('click', () => this.closeSectionPanel());
    this.startButton.addEventListener('click', () => this.start());
    this.garageButtons.forEach((button) =>
      button.addEventListener('click', () => this.selectVehicle(button.dataset.vehicle))
    );
    this.markSelectedVehicle();
    this.seedInput.value = this.seedCode;
    this.hudSeed.textContent = this.seedCode;
    this.seedInput.addEventListener('change', () => this.setSeed(this.seedInput.value));
    this.seedInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') this.setSeed(this.seedInput.value);
    });
    this.seedRandomButton.addEventListener('click', () => this.setSeed(randomSeedCode()));
  }

  markSelectedVehicle() {
    this.garageButtons.forEach((button) => {
      const selected = button.dataset.vehicle === this.vehicle.id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  }

  selectVehicle(id) {
    const vehicle = findVehicle(id);
    if (this.started || vehicle.id === this.vehicle.id) {
      return;
    }

    this.vehicle = vehicle;
    saveVehicle(vehicle.id);
    this.markSelectedVehicle();

    if (this.ready) {
      this.car.destroy();
      this.car = new Car(this);
    }
  }

  async init() {
    this.resources = new Resources();
    this.resources.addEventListener('progress', (event) => {
      const { progress, label } = event.detail;
      this.loadingBar.style.width = `${progress}%`;
      this.loadingStatus.textContent = label;
    });

    this.resources.addEventListener('ready', () => {
      this.loadingStatus.textContent = 'Assets loaded. Finalizing physics and world systems...';
    });

    await this.resources.load();

    this.camera = new Camera(this);
    this.renderer = new Renderer(this);
    this.controls = new Controls(this);
    this.bindTouchControls();
    this.physics = await Physics.create();

    this.addLights();
    this.floor = new Floor(this);
    this.objects = new Objects(this);
    this.world = new WorldPack(this, this.seedCode);
    this.car = new Car(this);

    writeSeedToUrl(this.seedCode);
    this.setupAudio();

    this.ready = true;
    seedOfflineCache();
    this.loadingStatus.textContent = 'Everything is loaded. Fire it up.';
    this.startButton.classList.add('is-ready');
    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    gsap.fromTo(
      '.hud-card, .hud-help',
      { y: -18, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, stagger: 0.08, ease: 'power2.out', delay: 0.25 }
    );
  }

  addLights() {
    const hemisphere = new THREE.HemisphereLight('#fff3ca', '#4980a8', 1.6);
    this.hemisphere = hemisphere;
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#fff8d2', 2.7);
    this.sun = sun;
    sun.position.set(18, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -38;
    sun.shadow.camera.right = 38;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
  }

  applyPalette({ sky, hemiSky, hemiGround, sun }) {
    this.scene.background = new THREE.Color(sky);
    this.scene.fog.color.set(sky);
    this.hemisphere.color.set(hemiSky);
    this.hemisphere.groundColor.set(hemiGround);
    this.sun.color.set(sun);
  }

  setSeed(input) {
    const requested = normalizeSeedCode(input);
    const code = requested.length >= 4 ? requested : randomSeedCode();
    this.seedInput.value = code;

    if (this.started || code === this.seedCode || !this.ready) {
      this.seedInput.value = this.seedCode;
      return;
    }

    this.seedCode = code;
    this.world.dispose();
    this.world = new WorldPack(this, code);
    this.hudSeed.textContent = code;
    writeSeedToUrl(code);
  }

  setupAudio() {
    Howler.volume(0.9);

    this.audio = {
      ambient: new Howl({
        src: [this.resources.items.audio.ambient],
        volume: 0.18,
        loop: true
      }),
      engine: new Howl({
        src: [this.resources.items.audio.engine],
        volume: 0.02,
        loop: true,
        rate: 0.8
      }),
      crash: new Howl({
        src: [this.resources.items.audio.crash],
        volume: 0.28
      })
    };
  }

  start() {
    if (!this.ready || this.started) {
      if (!this.ready) {
        this.loadingStatus.textContent = 'World is still initializing. Try again in a moment...';
      }
      return;
    }

    this.started = true;
    this.clock.start();
    this.experience.classList.add('is-started');
    Howler.ctx?.resume?.();

    this.audio.ambient.play();
    this.audio.engine.play();

    gsap.to(this.loadingScreen, {
      autoAlpha: 0,
      duration: 0.6,
      ease: 'power2.out',
      onComplete: () => this.loadingScreen.classList.add('is-hidden')
    });

    requestAnimationFrame(this.tick);
  }

  bindTouchControls() {
    this.touchHoldButtons.forEach((button) => {
      const action = button.dataset.touchHold;
      const release = (event) => {
        event?.preventDefault?.();
        button.classList.remove('is-pressed');
        this.controls.setTouchButton(action, false);
      };

      button.addEventListener('contextmenu', (event) => event.preventDefault());
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.classList.add('is-pressed');
        button.setPointerCapture?.(event.pointerId);
        this.controls.setTouchButton(action, true);
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });

    this.touchTapButtons.forEach((button) => {
      const action = button.dataset.touchTap;

      button.addEventListener('contextmenu', (event) => event.preventDefault());
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.classList.add('is-pressed');

        if (action === 'jump') {
          this.controls.queueJump();
        }

        if (action === 'interact') {
          this.controls.queueInteract();
        }

        window.setTimeout(() => {
          button.classList.remove('is-pressed');
        }, 140);
      });
    });
  }

  tick() {
    if (!this.started) {
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);

    this.controls.update();
    this.physics.update(delta, (step) => this.car.beforePhysics(step));
    this.car.afterPhysics(delta);
    this.objects.update(delta, this.car.position);
    this.world.update();
    this.camera.update(delta);
    this.updateInteractionState();
    this.updateHud();
    this.updateAudio();
    this.renderer.render(delta);

    requestAnimationFrame(this.tick);
  }

  updateInteractionState() {
    const nearby = this.objects.getNearestSection(this.car.position);

    if (nearby?.id !== this.currentPromptId) {
      this.currentPromptId = nearby?.id ?? null;

      if (nearby) {
        this.promptTitle.textContent = `${nearby.title} zone nearby`;
        this.promptCopy.textContent = nearby.prompt;
        this.prompt.classList.add('is-visible');
      } else {
        this.prompt.classList.remove('is-visible');
      }
    }

    if (nearby) {
      this.hudTitle.textContent = nearby.teaser;
    } else {
      this.hudTitle.textContent = 'Find a section sign and press Enter or tap ACT.';
    }

    if (this.controls.consumeInteract()) {
      if (nearby) {
        this.openSectionPanel(nearby);
      } else {
        this.closeSectionPanel();
      }
    }

    if (this.openSectionId && nearby?.id !== this.openSectionId) {
      this.closeSectionPanel();
    }
  }

  openSectionPanel(section) {
    this.openSectionId = section.id;
    this.panelEyebrow.textContent = `${section.title} / interactive stop`;
    this.panelTitle.textContent = section.title;
    this.panelDescription.textContent = section.description;
    this.panel.style.setProperty('--accent', section.accent);
    this.panelCards.innerHTML = '';

    section.cards.forEach((card) => {
      const item = document.createElement('article');
      item.className = 'info-card';
      item.innerHTML = `
        <strong>${card.title}</strong>
        <span>${card.body}</span>
      `;
      this.panelCards.appendChild(item);
    });

    const footer = document.createElement('div');
    footer.className = 'section-panel__footer';
    footer.innerHTML = `
      <span>${section.footerLeft}</span>
      <span>${section.footerRight}</span>
    `;
    this.panelCards.appendChild(footer);

    this.panel.classList.add('is-open');
    gsap.killTweensOf(this.panel);
    gsap.to(this.panel, {
      autoAlpha: 1,
      x: 0,
      duration: 0.35,
      ease: 'power2.out'
    });
  }

  closeSectionPanel() {
    this.openSectionId = null;
    this.panel.classList.remove('is-open');
    gsap.killTweensOf(this.panel);
    gsap.to(this.panel, {
      autoAlpha: 0,
      x: 30,
      duration: 0.24,
      ease: 'power2.out'
    });
  }

  updateHud() {
    this.hudSpeed.textContent = `${Math.round(this.car.speed * 7.2)} km/h`;
    this.hudZone.textContent = this.currentPromptId ? this.currentPromptId : 'Free roam';
    this.hudJump.textContent = this.car.grounded ? 'Ready' : 'Airborne';
  }

  updateAudio() {
    const engineRate = 0.78 + this.car.speedNormalized * 0.85 + (this.controls.input.boost ? 0.15 : 0);
    const engineVolume = 0.02 + this.car.speedNormalized * 0.16;
    this.audio.engine.rate(engineRate);
    this.audio.engine.volume(engineVolume);
  }

  triggerCrash(intensity) {
    if (!this.started) {
      return;
    }

    this.audio.crash.volume(Math.min(0.45, 0.12 + intensity * 0.06));
    this.audio.crash.rate(0.9 + Math.random() * 0.25);
    this.audio.crash.play();
  }

  handleResize() {
    if (!this.renderer || !this.camera) {
      return;
    }

    this.camera.resize();
    this.renderer.resize();
  }
}
