import * as THREE from 'three';
import { CAR_FLAG } from '../../shared/net/protocol.ts';
import { findVehicle } from '../../shared/vehicles.ts';

export const flagsFromBits = (bits) => ({
  drifting: (bits & CAR_FLAG.DRIFTING) !== 0,
  nitro: (bits & CAR_FLAG.NITRO) !== 0,
  shield: (bits & CAR_FLAG.SHIELD) !== 0,
  ghost: (bits & CAR_FLAG.GHOST) !== 0,
  wrecked: (bits & CAR_FLAG.WRECKED) !== 0,
  finished: (bits & CAR_FLAG.FINISHED) !== 0,
  dnf: (bits & CAR_FLAG.DNF) !== 0,
  wrongWay: (bits & CAR_FLAG.WRONG_WAY) !== 0,
  connected: (bits & CAR_FLAG.CONNECTED) !== 0,
  botDriven: (bits & CAR_FLAG.BOT_DRIVEN) !== 0,
  braking: (bits & CAR_FLAG.BRAKING) !== 0,
  grounded: (bits & CAR_FLAG.GROUNDED) !== 0
});

/** What the view and HUD need about one car, whatever produced it (local sim or network). */
export class CarFrame {
  constructor(participant, isLocal) {
    this.id = participant.id;
    this.name = participant.name;
    this.vehicleId = participant.vehicleId;
    this.kind = participant.kind;
    this.isLocal = isLocal;
    this.maxHealth = findVehicle(participant.vehicleId).handling.health;
    this.maxSpeed = findVehicle(participant.vehicleId).handling.maxSpeed;
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.forwardSpeed = 0;
    this.steer = 0;
    this.slip = 0;
    this.health = this.maxHealth;
    this.nitro = 0;
    this.item = null;
    this.flags = flagsFromBits(0);
    this.lapsCompleted = 0;
    this.nextCheckpoint = 1;
    this.lastCheckpoint = 0;
    this.rank = 1;
    this.progress = 0;
    this.wheels = null;
    this.bestLapTicks = -1;
    this.lastLapTicks = -1;
    this.finishTicks = -1;
  }

  /** Derive speed values from velocity and orientation. */
  refresh() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.forwardSpeed = this.velocity.dot(forward);
    this.slip = this.speed > 3 ? Math.atan2(this.velocity.dot(right), Math.abs(this.forwardSpeed)) : 0;
  }
}
