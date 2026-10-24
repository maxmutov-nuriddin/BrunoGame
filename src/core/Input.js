import { NEUTRAL_INPUT } from '../../shared/input.ts';

/** Actions that fire once per press (queued) rather than being held. */
const EDGE_ACTIONS = new Set(['pause', 'reset', 'item', 'camera']);
/** Actions ignored in a given mode. */
const MODE_BLOCKLIST = {
  menu: new Set(['throttle', 'brake', 'left', 'right', 'handbrake', 'nitro', 'item', 'lookBack', 'reset', 'camera'])
};
const GAMEPAD_DEADZONE = 0.15;

/**
 * Keyboard, touch and gamepad merged into game actions. Menus ignore driving keys;
 * focus loss always releases everything.
 */
export default class Input extends EventTarget {
  constructor(settings) {
    super();
    this.settings = settings;
    this.mode = 'menu';
    this.keys = new Set();
    this.touch = new Map();
    this.pressed = new Set();
    this.capture = null;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.releaseAll = this.releaseAll.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.releaseAll();
    // Presses from the previous screen must not leak into the next one.
    this.pressed.clear();
  }

  get bindings() {
    return this.settings.get('bindings');
  }

  /** Actions a key triggers in the current mode. */
  actionsForKey(code) {
    const blocked = MODE_BLOCKLIST[this.mode] ?? new Set();
    return Object.keys(this.bindings).filter((action) => !blocked.has(action) && this.bindings[action]?.includes(code));
  }

  onKeyDown(event) {
    if (this.capture) {
      event.preventDefault();
      const done = this.capture;
      this.capture = null;
      done(event.code === 'Escape' ? null : event.code);
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    const actions = this.actionsForKey(event.code);
    if (actions.length === 0) {
      if (event.code === 'Escape') this.queue('pause');
      return;
    }
    if (this.mode !== 'menu' || actions.includes('pause')) event.preventDefault();
    if (!event.repeat) for (const action of actions) if (EDGE_ACTIONS.has(action)) this.queue(action);
    this.keys.add(event.code);
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
  }

  queue(action) {
    this.pressed.add(action);
    this.dispatchEvent(new CustomEvent('action', { detail: action }));
  }

  releaseAll() {
    this.keys.clear();
    this.touch.clear();
  }

  /** Register a DOM button as a held or tapped action; multi-touch safe. */
  bindTouch(button, action) {
    const release = (event) => {
      event?.preventDefault?.();
      button.classList.remove('is-pressed');
      this.touch.delete(action);
    };
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.classList.add('is-pressed');
      this.touch.set(action, true);
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // Capture is a nicety; the press still counts without it.
      }
      if (EDGE_ACTIONS.has(action)) this.queue(action);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }

  isDown(action) {
    const blocked = MODE_BLOCKLIST[this.mode];
    if (blocked?.has(action)) return false;
    if (this.touch.get(action)) return true;
    if (this.gamepadDown(action)) return true;
    for (const code of this.bindings[action] ?? []) {
      if (this.keys.has(code)) return true;
    }
    return false;
  }

  consume(action) {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  clearPressed() {
    this.pressed.clear();
  }

  gamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    return [...pads].find((pad) => pad && pad.connected) ?? null;
  }

  gamepadDown(action) {
    const pad = this.gamepad();
    if (!pad) return false;
    const b = (i) => pad.buttons[i]?.pressed;
    switch (action) {
      case 'handbrake': return b(0);
      case 'nitro': return b(1);
      case 'item': return b(2);
      case 'reset': return b(3);
      case 'lookBack': return b(4);
      case 'pause': return b(9);
      default: return false;
    }
  }

  /** Driving input for the vehicle simulation. */
  readDrive() {
    if (this.mode === 'menu') return NEUTRAL_INPUT;
    const pad = this.gamepad();
    let throttle = (this.isDown('throttle') ? 1 : 0) - (this.isDown('brake') ? 1 : 0);
    let steer = (this.isDown('left') ? 1 : 0) - (this.isDown('right') ? 1 : 0);
    if (pad) {
      const axis = pad.axes[0] ?? 0;
      if (Math.abs(axis) > GAMEPAD_DEADZONE) steer = -axis;
      const gas = pad.buttons[7]?.value ?? 0;
      const brake = pad.buttons[6]?.value ?? 0;
      if (gas > 0.05 || brake > 0.05) throttle = gas - brake;
    }
    return {
      throttle,
      steer,
      handbrake: this.isDown('handbrake'),
      nitro: this.isDown('nitro'),
      jump: false,
      useItem: this.isDown('item'),
      reset: this.isDown('reset'),
      lookBack: this.isDown('lookBack')
    };
  }

  /** Next key press is returned to `callback` instead of acting (Escape cancels with null). */
  captureNextKey(callback) {
    this.releaseAll();
    this.capture = callback;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
  }
}
