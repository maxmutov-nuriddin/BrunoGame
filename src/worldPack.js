export const WORLD_PACK_DIR = '/models/world-pack';

export const WORLD_PACK_FILES = Object.freeze({
  grass: 'grass-tile.glb',
  road: 'straight-road.glb',
  info: 'info-plaza.glb',
  gallery: 'gallery-plaza.glb',
  blocks: 'blocks-plaza.glb',
  contact: 'contact-plaza.glb',
  jumps: 'driving-jumps.glb',
  scenery: 'scenery-kit.glb',
  landmarks: 'landmark-kit.glb',
  border: 'world-border.glb',
  crate: 'WoodCrate.glb',
  barrel: 'Barrel.glb',
  pin: 'BowlingPin.glb',
  brick: 'ToyBrick.glb',
  tire: 'Tire.glb',
  cone: 'TrafficCone.glb'
});

export const worldResourceName = (key) => `world-${key}`;
