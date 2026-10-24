export interface DriveInput {
  /** -1 (brake / reverse) .. 1 (throttle) */
  throttle: number;
  /** -1 (right) .. 1 (left) */
  steer: number;
  handbrake: boolean;
  nitro: boolean;
  jump: boolean;
  useItem: boolean;
  reset: boolean;
  lookBack: boolean;
}

export const BUTTON = Object.freeze({
  HANDBRAKE: 1,
  NITRO: 2,
  JUMP: 4,
  ITEM: 8,
  RESET: 16,
  LOOK_BACK: 32
});

const KNOWN_BUTTONS = 63;
const AXIS_STEPS = 127;

export const NEUTRAL_INPUT: Readonly<DriveInput> = Object.freeze({
  throttle: 0, steer: 0, handbrake: false, nitro: false, jump: false, useItem: false, reset: false, lookBack: false
});

export const quantizeAxis = (value: number): number => Math.round(clampAxis(value) * AXIS_STEPS) / AXIS_STEPS;

const clampAxis = (value: number): number => (Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);

export function packButtons(input: DriveInput): number {
  return (
    (input.handbrake ? BUTTON.HANDBRAKE : 0) |
    (input.nitro ? BUTTON.NITRO : 0) |
    (input.jump ? BUTTON.JUMP : 0) |
    (input.useItem ? BUTTON.ITEM : 0) |
    (input.reset ? BUTTON.RESET : 0) |
    (input.lookBack ? BUTTON.LOOK_BACK : 0)
  );
}

export function unpackInput(throttle: number, steer: number, buttons: number): DriveInput {
  return {
    throttle: quantizeAxis(throttle),
    steer: quantizeAxis(steer),
    handbrake: (buttons & BUTTON.HANDBRAKE) !== 0,
    nitro: (buttons & BUTTON.NITRO) !== 0,
    jump: (buttons & BUTTON.JUMP) !== 0,
    useItem: (buttons & BUTTON.ITEM) !== 0,
    reset: (buttons & BUTTON.RESET) !== 0,
    lookBack: (buttons & BUTTON.LOOK_BACK) !== 0
  };
}

/** Compact wire form: [seq, tick, throttle*127, steer*127, buttons]. */
export type WireInput = [number, number, number, number, number];

export function encodeInput(seq: number, tick: number, input: DriveInput): WireInput {
  return [seq, tick, Math.round(clampAxis(input.throttle) * AXIS_STEPS), Math.round(clampAxis(input.steer) * AXIS_STEPS), packButtons(input)];
}

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Strict validation of untrusted wire input. Returns null on any malformed field. */
export function decodeInput(raw: unknown): { seq: number; tick: number; input: DriveInput } | null {
  if (!Array.isArray(raw) || raw.length !== 5) return null;
  const [seq, tick, throttle, steer, buttons] = raw;
  if (!isInt(seq, 0, 2 ** 31) || !isInt(tick, 0, 2 ** 31)) return null;
  if (!isInt(throttle, -AXIS_STEPS, AXIS_STEPS) || !isInt(steer, -AXIS_STEPS, AXIS_STEPS)) return null;
  if (!isInt(buttons, 0, KNOWN_BUTTONS)) return null;
  return { seq, tick, input: unpackInput(throttle / AXIS_STEPS, steer / AXIS_STEPS, buttons) };
}
