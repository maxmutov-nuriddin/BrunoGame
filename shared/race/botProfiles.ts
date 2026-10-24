export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface BotProfile {
  /** Fraction of the racing-line speed the bot aims for. */
  speedFactor: number;
  /** Ticks between tactical decisions (overtakes, items). */
  reactionTicks: number;
  /** Random error in judging corner speed (fraction). */
  brakeError: number;
  /** Amplitude of steering wobble (fraction of full lock). */
  steerNoise: number;
  /** Probability of making the right call with an item. */
  itemSkill: number;
  /** Probability of using nitro on a good straight. */
  nitroSkill: number;
  /** How readily the bot pulls out to overtake. */
  aggression: number;
  /** Whether the bot handbrakes into hairpins. */
  driftSkill: number;
}

export const BOT_PROFILES: Readonly<Record<BotDifficulty, BotProfile>> = Object.freeze({
  easy: { speedFactor: 0.8, reactionTicks: 24, brakeError: 0.16, steerNoise: 0.12, itemSkill: 0.35, nitroSkill: 0.3, aggression: 0.25, driftSkill: 0.15 },
  normal: { speedFactor: 0.91, reactionTicks: 12, brakeError: 0.08, steerNoise: 0.06, itemSkill: 0.65, nitroSkill: 0.6, aggression: 0.55, driftSkill: 0.5 },
  hard: { speedFactor: 1.0, reactionTicks: 5, brakeError: 0.025, steerNoise: 0.02, itemSkill: 0.92, nitroSkill: 0.9, aggression: 0.9, driftSkill: 0.85 }
});

export const isBotDifficulty = (value: unknown): value is BotDifficulty =>
  value === 'easy' || value === 'normal' || value === 'hard';
