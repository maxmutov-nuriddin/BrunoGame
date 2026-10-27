/** Bump whenever the wire format changes; client and server must match. */
export const PROTOCOL_VERSION = 3;
/** Bump whenever track generation output changes for the same seed. */
export const GENERATOR_VERSION = 2;

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

/** Quick play: a public race starts once this many players have joined... */
export const MATCH_MIN_PLAYERS = 3;
/** ...after a countdown that gives late joiners time to get in. */
export const MATCH_COUNTDOWN_MS = 15_000;
/** A found match must be accepted ("Ready") within this time, or the seat goes to someone else (lobby directory). */
export const MATCH_OFFER_MS = 10_000;
