import { TICK_RATE } from '../constants.ts';

const seconds = (s: number) => Math.round(s * TICK_RATE);

export const RULES = Object.freeze({
  introTicks: seconds(4),
  countdownTicks: seconds(3),
  /** Throttle pressed inside this window before GO earns the launch boost. */
  launchWindowStart: seconds(0.45),
  launchWindowEnd: seconds(0.05),
  /** Pressed earlier than this and still held: the engine bogs instead. */
  launchTooEarly: seconds(0.6),
  launchBoostSpeed: 5,
  launchBoostNitro: 15,
  launchBogTicks: seconds(0.6),
  /** After the first finisher, everyone else gets this long before DNF. */
  finishGraceTicks: seconds(30),
  /** Hard cap for a single race so a stuck room always ends. */
  maxRaceTicks: seconds(60 * 12),
  wreckTicks: seconds(1.3),
  respawnGhostTicks: seconds(1.5),
  respawnSpeedFraction: 0.35,
  manualResetCooldownTicks: seconds(3),
  manualResetFreezeTicks: seconds(0.6),
  flippedTicksBeforeReset: seconds(2.5),
  stuckTicksBeforeReset: seconds(2.5),
  /** Below this speed (m/s) with a pedal pressed, the car counts as stuck. */
  stuckSpeed: 1.2,
  wrongWayTicks: seconds(1.2),
  wrongWaySpeed: 3,
  driftRewardRate: 14,
  driftRewardCap: 35,
  driftMinProgressSpeed: 8,
  collisionDamagePerMs: 1.2,
  /** Scrapes and light bumps below this (m/s above the impact threshold) cost no health. */
  collisionDamageMinImpact: 8,
  /** One crash never costs more than this, so walls punish but rarely wreck on their own. */
  collisionDamageCap: 15,
  /** A sustained scrape along a wall counts as one crash, not one per tick. */
  collisionDamageCooldownTicks: seconds(0.5),
  fallResetHeight: -8
});

export const ticksToSeconds = (ticks: number) => ticks / TICK_RATE;
