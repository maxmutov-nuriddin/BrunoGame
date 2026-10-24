/** Bump whenever the wire format changes; client and server must match. */
export const PROTOCOL_VERSION = 1;
/** Bump whenever track generation output changes for the same seed. */
export const GENERATOR_VERSION = 1;

export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
/** Server snapshots at 20 Hz. */
export const SNAPSHOT_EVERY_TICKS = 3;
/** Clients batch inputs at 30 Hz. */
export const INPUT_SEND_EVERY_TICKS = 2;

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
export const DEFAULT_LAPS = 3;
export const MAX_LAPS = 5;
