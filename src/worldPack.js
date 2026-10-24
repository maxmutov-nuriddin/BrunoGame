export const WORLD_PACK_DIR = '/models/world-pack';

/** Only the parts race scenery uses; the plaza/prop models in the folder are not loaded. */
export const WORLD_PACK_FILES = Object.freeze({
  grass: 'grass-tile.glb',
  scenery: 'scenery-kit.glb',
  landmarks: 'landmark-kit.glb',
  border: 'world-border.glb'
});

export const worldResourceName = (key) => `world-${key}`;
