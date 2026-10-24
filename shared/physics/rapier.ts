import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js';

let ready: Promise<typeof RAPIER> | null = null;

export function loadRapier(): Promise<typeof RAPIER> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

export { RAPIER };

/** Collision layers. Membership in the high 16 bits, filter in the low 16 bits. */
export const GROUP = Object.freeze({
  STATIC: 1 << 0,
  CAR: 1 << 1,
  GHOST: 1 << 2,
  PROP: 1 << 3
});

export const ALL_GROUPS = 0xffff;

export const interactionGroups = (membership: number, filter: number): number =>
  (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;

export const STATIC_GROUPS = interactionGroups(GROUP.STATIC, ALL_GROUPS);
export const CAR_GROUPS = interactionGroups(GROUP.CAR, GROUP.STATIC | GROUP.CAR | GROUP.PROP);
export const GHOST_GROUPS = interactionGroups(GROUP.GHOST, GROUP.STATIC);
export const PROP_GROUPS = interactionGroups(GROUP.PROP, GROUP.STATIC | GROUP.CAR | GROUP.PROP);
/** Used by wheel rays and projectiles: only static world geometry counts as ground or wall. */
export const STATIC_QUERY_GROUPS = interactionGroups(GROUP.CAR, GROUP.STATIC);
