export const WORLD_RADIUS = 320;
export const SPAWN_CLEAR_RADIUS = 30;

export const JUMP_SPOTS = Object.freeze({
  tabletop: { x: -120, z: -170 },
  bigAir: { x: 120, z: 170 }
});

export const PLAZA_CENTERS = Object.freeze({
  about: { x: -52, z: -88 },
  projects: { x: -52, z: 88 },
  skills: { x: 52, z: 88 },
  contact: { x: 52, z: -88 }
});

const rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

export const ZONES = Object.freeze({
  road: rect(-31, 31, -WORLD_RADIUS, WORLD_RADIUS),
  spawn: rect(-SPAWN_CLEAR_RADIUS, SPAWN_CLEAR_RADIUS, -SPAWN_CLEAR_RADIUS, SPAWN_CLEAR_RADIUS),
  plazas: [
    rect(-86, -18, -124, -52),
    rect(-86, -18, 52, 124),
    rect(18, 86, 52, 124),
    rect(18, 86, -124, -52)
  ],
  // Ramps stand in the open field beside the road, each with a long run-up from the spawn side.
  jumps: [rect(-146, -94, -215, -30), rect(94, 146, 30, 215)],
  challenges: [rect(-22, 22, -256, -126), rect(-22, 22, 192, 272)]
});

const flatten = (names) => names.flatMap((name) => [].concat(ZONES[name]));

export function isInside(zone, x, z, margin = 0) {
  return (
    x > zone.minX - margin && x < zone.maxX + margin && z > zone.minZ - margin && z < zone.maxZ + margin
  );
}

/** Rejection sampler with spacing and named keep-out zones. */
export function createPlacer(rng) {
  const placed = [];

  return {
    placed,
    tryPlace({ minRadius = 0, maxRadius = WORLD_RADIUS - 24, size = 2, avoid = [], attempts = 24 }) {
      const zones = flatten(avoid);

      for (let i = 0; i < attempts; i++) {
        const radius = Math.sqrt(rng.range(minRadius ** 2, maxRadius ** 2));
        const angle = rng.angle();
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        const blockedByZone = zones.some((zone) => isInside(zone, x, z, size));
        const blockedByNeighbour = placed.some(
          (other) => Math.hypot(other.x - x, other.z - z) < other.size + size
        );

        if (!blockedByZone && !blockedByNeighbour) {
          const spot = { x, z, size };
          placed.push(spot);
          return spot;
        }
      }

      return null;
    }
  };
}
