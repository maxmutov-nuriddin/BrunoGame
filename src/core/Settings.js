import { DEFAULT_VEHICLE, VEHICLES, findVehicle } from '../../shared/vehicles.ts';

const SETTINGS_KEY = 'bruno-race:settings';
const RECORDS_KEY = 'bruno-race:records';
const SCHEMA_VERSION = 3;
export const CAMERA_MODES = ['chase', 'far', 'hood', 'cockpit'];

export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export const DEFAULT_BINDINGS = Object.freeze({
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space', 'ControlLeft'],
  nitro: ['ShiftLeft', 'ShiftRight'],
  item: ['KeyE'],
  lookBack: ['KeyQ'],
  reset: ['KeyR'],
  pause: ['Escape'],
  camera: ['KeyC']
});

/** Phones and tablets start on Low, everything else on Medium; players can raise it in Settings. */
function defaultQuality() {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return coarse ? 'low' : 'medium';
}

const defaults = () => ({
  version: SCHEMA_VERSION,
  name: '',
  vehicleId: DEFAULT_VEHICLE.id,
  quality: defaultQuality(),
  cameraMode: 'chase',
  fpsCap: 60,
  reducedMotion: false,
  rearMirror: true,
  volume: { master: 0.8, music: 0.5, sfx: 0.8 },
  bindings: structuredClone(DEFAULT_BINDINGS),
  serverUrl: '',
  unlockedVehicles: []
});

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Private mode or blocked storage: settings still work for this session.
    return false;
  }
}

const HIDDEN_IDS = new Set(VEHICLES.filter((v) => v.hidden).map((v) => v.id));

/** Hidden cars this device unlocked with a promo code; anything else in storage is dropped. */
const validUnlocks = (list) => (Array.isArray(list) ? [...new Set(list.filter((id) => HIDDEN_IDS.has(id)))] : []);

/** A hidden car can only stay selected while it is unlocked. */
export function usableVehicleId(id, unlocked) {
  const vehicle = findVehicle(id);
  return !vehicle.hidden || unlocked.includes(vehicle.id) ? vehicle.id : DEFAULT_VEHICLE.id;
}

const clamp01 = (value, fallback) => (typeof value === 'number' && value >= 0 && value <= 1 ? value : fallback);

/** Validate whatever came out of storage; unknown or broken fields fall back to defaults. */
function migrate(stored) {
  const base = defaults();
  if (!stored || typeof stored !== 'object') return base;
  const legacyVehicle = (() => {
    try {
      return window.localStorage.getItem('bruno-game:vehicle');
    } catch {
      return null;
    }
  })();
  const bindings = { ...base.bindings };
  if (stored.bindings && typeof stored.bindings === 'object') {
    for (const action of Object.keys(DEFAULT_BINDINGS)) {
      const keys = stored.bindings[action];
      if (Array.isArray(keys) && keys.every((k) => typeof k === 'string' && k.length < 32)) bindings[action] = keys.slice(0, 3);
    }
  }
  const unlockedVehicles = validUnlocks(stored.unlockedVehicles);
  return {
    version: SCHEMA_VERSION,
    name: typeof stored.name === 'string' ? stored.name.slice(0, 16) : '',
    vehicleId: usableVehicleId(stored.vehicleId ?? legacyVehicle, unlockedVehicles),
    quality: QUALITY_LEVELS.includes(stored.quality) ? stored.quality : base.quality,
    reducedMotion: stored.reducedMotion === true,
    rearMirror: stored.rearMirror !== false,
    cameraMode: CAMERA_MODES.includes(stored.cameraMode) ? stored.cameraMode : base.cameraMode,
    fpsCap: [30, 60, 0].includes(stored.fpsCap) ? stored.fpsCap : base.fpsCap,
    volume: {
      master: clamp01(stored.volume?.master, base.volume.master),
      music: clamp01(stored.volume?.music, base.volume.music),
      sfx: clamp01(stored.volume?.sfx, base.volume.sfx)
    },
    bindings,
    serverUrl: typeof stored.serverUrl === 'string' ? stored.serverUrl.slice(0, 200) : '',
    unlockedVehicles
  };
}

/** Versioned settings with change notifications. */
export default class Settings extends EventTarget {
  constructor() {
    super();
    this.values = migrate(readJson(SETTINGS_KEY));
    if (!this.values.name) this.values.name = `Racer${Math.floor(100 + Math.random() * 900)}`;
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values = { ...this.values, [key]: value };
    writeJson(SETTINGS_KEY, this.values);
    this.dispatchEvent(new CustomEvent('change', { detail: { key, value } }));
  }

  /** Add a hidden car to this device's garage; returns false when it was already unlocked. */
  unlockVehicle(id) {
    const unlocked = this.get('unlockedVehicles');
    if (unlocked.includes(id)) return false;
    this.set('unlockedVehicles', validUnlocks([...unlocked, id]));
    return true;
  }

  resetBindings() {
    this.set('bindings', structuredClone(DEFAULT_BINDINGS));
  }
}

/** Time-trial records keyed by track seed, generator version and car. */
export const Records = {
  key(track, vehicleId) {
    return `${track.seed}@${track.generatorVersion}|${vehicleId}`;
  },
  all() {
    const stored = readJson(RECORDS_KEY);
    return stored && stored.version === 1 && typeof stored.entries === 'object' ? stored.entries : {};
  },
  get(track, vehicleId) {
    return this.all()[this.key(track, vehicleId)] ?? null;
  },
  /** Returns true when `lapMs` beats the stored best. */
  submit(track, vehicleId, lapMs, totalMs) {
    const entries = this.all();
    const key = this.key(track, vehicleId);
    const current = entries[key];
    const better = !current || lapMs < current.bestLapMs;
    entries[key] = {
      bestLapMs: better ? lapMs : current.bestLapMs,
      bestTotalMs: current ? Math.min(current.bestTotalMs ?? Infinity, totalMs) : totalMs,
      updated: new Date().toISOString()
    };
    writeJson(RECORDS_KEY, { version: 1, entries });
    return better;
  }
};
