export default class Controls {
  constructor(application) {
    this.application = application;
    this.keys = new Set();
    this.interactQueued = false;
    this.jumpQueued = false;
    this.touch = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      boost: false,
      brake: false
    };
    this.input = {
      throttle: 0,
      steer: 0,
      boost: false,
      brake: false
    };

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.reset();
      }
    });
  }

  onKeyDown(event) {
    const code = event.code;

    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'ControlLeft', 'ControlRight', 'Enter'].includes(code)) {
      event.preventDefault();
    }

    if (code === 'Enter' && !event.repeat) {
      this.interactQueued = true;
    }

    if (code === 'Space' && !event.repeat) {
      this.jumpQueued = true;
    }

    this.keys.add(code);
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
  }

  setTouchButton(action, pressed) {
    if (!(action in this.touch)) {
      return;
    }

    this.touch[action] = pressed;
  }

  queueInteract() {
    this.interactQueued = true;
  }

  queueJump() {
    this.jumpQueued = true;
  }

  reset() {
    this.keys.clear();

    Object.keys(this.touch).forEach((action) => {
      this.touch[action] = false;
    });

    this.input.throttle = 0;
    this.input.steer = 0;
    this.input.boost = false;
    this.input.brake = false;
  }

  update() {
    const forward = this.keys.has('KeyW') || this.touch.forward ? 1 : 0;
    const backward = this.keys.has('KeyS') || this.touch.backward ? 1 : 0;
    const left = this.keys.has('KeyA') || this.touch.left ? 1 : 0;
    const right = this.keys.has('KeyD') || this.touch.right ? 1 : 0;

    this.input.throttle = forward - backward;
    this.input.steer = left - right;
    this.input.boost =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.boost;
    this.input.brake =
      this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.touch.brake;
  }

  consumeInteract() {
    if (!this.interactQueued) {
      return false;
    }

    this.interactQueued = false;
    return true;
  }

  consumeJump() {
    if (!this.jumpQueued) {
      return false;
    }

    this.jumpQueued = false;
    return true;
  }
}
