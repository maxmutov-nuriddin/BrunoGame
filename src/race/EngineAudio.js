import * as THREE from 'three';
import { findVehicle } from '../../shared/vehicles.ts';

/** Upper bound of each gear as a fraction of top speed. */
const GEARS = [0.16, 0.32, 0.5, 0.7, 0.88, 1.15];
const RIVAL_VOICES = 2;
const RIVAL_RANGE = 70;
const CHARACTER = {
  'bruno-gt': { pitch: 1, grit: 0.35 },
  'atlas-hauler': { pitch: 0.72, grit: 0.7 },
  'pixel-hatch': { pitch: 1.35, grit: 0.25 },
  'nova-coupe': { pitch: 1.15, grit: 0.5 },
  'courier-van': { pitch: 0.8, grit: 0.55 },
  'dune-jumper': { pitch: 0.9, grit: 0.8 }
};

const toCamera = new THREE.Vector3();
const cameraRight = new THREE.Vector3();

function gearState(speed, maxSpeed) {
  const ratio = Math.max(0, speed / maxSpeed);
  let gear = GEARS.findIndex((top) => ratio < top);
  if (gear < 0) gear = GEARS.length - 1;
  const low = gear === 0 ? 0 : GEARS[gear - 1];
  const rpm = 0.18 + 0.82 * Math.min(1, (ratio - low) / (GEARS[gear] - low));
  return { gear, rpm };
}

/** Local engine plus the two closest rivals, and the tyre/wind/nitro layers. */
export default class EngineAudio {
  constructor(audio, participants, localId) {
    this.audio = audio;
    this.localId = localId;
    this.vehicles = new Map(participants.map((p) => [p.id, p.vehicleId]));
    const local = this.vehicles.get(localId);
    this.local = audio.createEngine(CHARACTER[local] ?? CHARACTER['bruno-gt']);
    this.rivals = Array.from({ length: RIVAL_VOICES }, () => ({ voice: null, id: null }));
    this.lastGear = 0;
    this.shiftDip = 0;
  }

  update(frames, camera, racing) {
    const me = frames.get(this.localId);
    if (!me || !this.audio.ready) return;
    const handling = findVehicle(me.vehicleId).handling;
    const { gear, rpm } = gearState(me.speed, handling.maxSpeed);
    if (gear !== this.lastGear && racing) {
      this.shiftDip = 0.25;
      if (gear > this.lastGear) this.audio.play('gear');
    }
    this.lastGear = gear;
    this.shiftDip = Math.max(0, this.shiftDip - 0.016 * 3);
    const load = me.flags.nitro ? 1 : Math.min(1, Math.abs(me.forwardSpeed) / 6 + (me.flags.braking ? 0 : 0.4));
    // Before GO the engine revs with the throttle so the grid sounds alive.
    const idle = racing ? rpm - this.shiftDip : 0.2;
    this.local?.update(Math.max(0.1, idle), load, me.flags.wrecked ? 0.2 : 1);

    const skid = me.flags.grounded ? Math.min(1, Math.max(0, Math.abs(me.slip) - 0.12) * 3 + (me.flags.drifting ? 0.4 : 0)) * Math.min(1, me.speed / 12) : 0;
    this.audio.setDriving({ skid, speed: Math.min(1, me.speed / handling.maxSpeed), nitro: me.flags.nitro ? 1 : 0 });
    this.updateRivals(frames, camera, me);
  }

  updateRivals(frames, camera, me) {
    const nearest = [...frames.values()]
      .filter((f) => f.id !== this.localId && !f.flags.wrecked)
      .map((f) => ({ f, d: f.position.distanceTo(me.position) }))
      .filter(({ d }) => d < RIVAL_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, RIVAL_VOICES);
    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.rivals.forEach((slot, i) => {
      const entry = nearest[i];
      if (!entry) {
        if (slot.voice) slot.voice.update(0.2, 0, 0);
        return;
      }
      if (slot.id !== entry.f.id) {
        this.audio.releaseEngine(slot.voice);
        slot.voice = this.audio.createEngine({ ...(CHARACTER[this.vehicles.get(entry.f.id)] ?? CHARACTER['bruno-gt']), pan: true });
        slot.id = entry.f.id;
      }
      const handling = findVehicle(entry.f.vehicleId).handling;
      const { rpm } = gearState(entry.f.speed, handling.maxSpeed);
      toCamera.copy(entry.f.position).sub(camera.position).normalize();
      const pan = toCamera.dot(cameraRight);
      slot.voice?.update(rpm, 0.7, (1 - entry.d / RIVAL_RANGE) * 0.55, pan);
    });
  }

  dispose() {
    this.audio.releaseEngine(this.local);
    for (const slot of this.rivals) this.audio.releaseEngine(slot.voice);
    this.audio.silenceDriving();
  }
}
