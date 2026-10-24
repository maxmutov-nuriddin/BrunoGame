import * as THREE from 'three';
import { WORLD_RADIUS } from './pack/zones.js';
import { addStaticBox } from './pack/statics.js';

const GROUND_SIZE = 720;
const GROUND_THICKNESS = 1.2;
const GROUND_FRICTION = 1.8;
const WALL_SEGMENTS = 64;
const WALL_RADIUS = WORLD_RADIUS - 4;
const WALL_HEIGHT = 40;
const WALL_THICKNESS = 4;

/** Physics-only floor: the visuals come from the seeded WorldPack. */
export default class Floor {
  constructor(application) {
    this.application = application;
    this.ctx = { physics: application.physics, bodies: [] };

    this.createGround();
    this.createBoundaryRing();
  }

  createGround() {
    this.application.physics.createBox({
      position: new THREE.Vector3(0, -GROUND_THICKNESS * 0.5, 0),
      size: new THREE.Vector3(GROUND_SIZE, GROUND_THICKNESS, GROUND_SIZE),
      type: 'fixed',
      friction: GROUND_FRICTION
    });
  }

  /** Invisible wall that follows the hills of the world border. */
  createBoundaryRing() {
    const segmentWidth = (Math.PI * 2 * WALL_RADIUS) / WALL_SEGMENTS + 1;

    for (let i = 0; i < WALL_SEGMENTS; i++) {
      const angle = (i / WALL_SEGMENTS) * Math.PI * 2;
      addStaticBox(this.ctx, {
        position: new THREE.Vector3(Math.sin(angle) * WALL_RADIUS, WALL_HEIGHT * 0.5, Math.cos(angle) * WALL_RADIUS),
        yaw: angle,
        size: new THREE.Vector3(segmentWidth, WALL_HEIGHT, WALL_THICKNESS),
        friction: GROUND_FRICTION
      });
    }
  }
}
