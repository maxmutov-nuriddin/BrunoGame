import * as THREE from 'three';

const BASE_FOV = 62;
const SPEED_FOV = 14;
const NITRO_FOV = 9;
const DISTANCE = { min: 6.4, max: 8.4 };
const HEIGHT = { min: 2.4, max: 2.9 };
const LOOK_AHEAD = 6;
const POSITION_STIFFNESS = 9;
const LOOK_STIFFNESS = 12;
const FOV_SMOOTHING = 4;
const WALL_MARGIN = 0.4;
const SHAKE_DECAY = 6;
/** Far camera: same rig, pulled back and up. */
const FAR_SCALE = { distance: 1.55, height: 1.7 };
/** Hood (first-person) camera: just above the bonnet, looking down the road. */
const HOOD_OFFSET = new THREE.Vector3(0, 0.95, -0.55);
const HOOD_LOOK = new THREE.Vector3(0, 0.75, -30);
const HOOD_FOV = 74;
const HOOD_ROTATION_SMOOTHING = 18;

const tmp = new THREE.Vector3();
const flatForward = new THREE.Vector3();

/** Spring-follow chase camera with speed FOV, light shake, look-back and wall avoidance. */
export default class ChaseCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.3, 1400);
    this.position = new THREE.Vector3(0, 8, 12);
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.fov = BASE_FOV;
    this.reducedMotion = false;
    this.snapNext = true;
  }

  addShake(amount) {
    if (!this.reducedMotion) this.shake = Math.min(1.2, this.shake + amount);
  }

  snap() {
    this.snapNext = true;
  }

  /**
   * @param frame car frame (position, quaternion, speed, flags)
   * @param raycast optional (from, to) => distance|null against static world, for wall avoidance
   */
  update(dt, frame, { maxSpeed, lookBack = false, raycast = null, mode = 'chase' }) {
    if (mode === 'hood') return this.updateHood(dt, frame, maxSpeed, lookBack);
    flatForward.set(0, 0, -1).applyQuaternion(frame.quaternion).setY(0);
    if (flatForward.lengthSq() < 1e-4) flatForward.set(0, 0, -1);
    flatForward.normalize();
    const speedRatio = Math.min(1, frame.speed / maxSpeed);
    const airborne = !frame.flags.grounded;
    const far = mode === 'far';
    const distance = THREE.MathUtils.lerp(DISTANCE.min, DISTANCE.max, speedRatio) * (far ? FAR_SCALE.distance : 1);
    const height = (THREE.MathUtils.lerp(HEIGHT.min, HEIGHT.max, speedRatio) + (airborne ? 0.8 : 0)) * (far ? FAR_SCALE.height : 1);
    const direction = lookBack ? -1 : 1;

    const desired = tmp.copy(frame.position).addScaledVector(flatForward, -distance * direction);
    desired.y += height;

    if (raycast) {
      const from = frame.position.clone();
      from.y += 1.2;
      const toDesired = desired.clone().sub(from);
      const length = toDesired.length();
      const hit = raycast(from, toDesired.normalize(), length);
      if (hit !== null && hit < length) desired.copy(from).addScaledVector(toDesired, Math.max(1.5, hit - WALL_MARGIN));
    }

    if (this.snapNext) {
      this.position.copy(desired);
      this.lookAt.copy(frame.position);
      this.snapNext = false;
    }
    const follow = 1 - Math.exp(-dt * (lookBack ? 30 : POSITION_STIFFNESS * (airborne ? 0.6 : 1)));
    this.position.lerp(desired, follow);
    const target = frame.position.clone().addScaledVector(flatForward, LOOK_AHEAD * direction);
    target.y += 1.2;
    this.lookAt.lerp(target, 1 - Math.exp(-dt * LOOK_STIFFNESS));

    const targetFov = BASE_FOV + (this.reducedMotion ? SPEED_FOV * 0.35 : SPEED_FOV) * speedRatio + (frame.flags.nitro && !this.reducedMotion ? NITRO_FOV : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * FOV_SMOOTHING));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.position);
    if (this.shake > 0.001) {
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-dt * SHAKE_DECAY);
    }
    this.camera.lookAt(this.lookAt);
  }

  /** First-person view from the bonnet: rigidly attached, rotation lightly smoothed against jitter. */
  updateHood(dt, frame, maxSpeed, lookBack) {
    const speedRatio = Math.min(1, frame.speed / maxSpeed);
    this.camera.position.copy(HOOD_OFFSET).applyQuaternion(frame.quaternion).add(frame.position);
    const look = HOOD_LOOK.clone();
    if (lookBack) look.z = -look.z;
    const target = look.applyQuaternion(frame.quaternion).add(frame.position);
    this.hoodQuaternion ??= new THREE.Quaternion();
    const desired = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(this.camera.position, target, new THREE.Vector3(0, 1, 0)));
    if (this.snapNext) {
      this.hoodQuaternion.copy(desired);
      this.snapNext = false;
    } else {
      this.hoodQuaternion.slerp(desired, 1 - Math.exp(-dt * HOOD_ROTATION_SMOOTHING));
    }
    this.camera.quaternion.copy(this.hoodQuaternion);
    const targetFov = HOOD_FOV + (this.reducedMotion ? 4 : 12) * speedRatio + (frame.flags.nitro && !this.reducedMotion ? 6 : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * FOV_SMOOTHING));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    if (this.shake > 0.001) {
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.08;
      this.shake *= Math.exp(-dt * SHAKE_DECAY);
    }
    this.position.copy(this.camera.position);
    this.lookAt.copy(target);
  }

  /** Cinematic orbit for the intro: angle 0..1 sweeps around `center`. */
  orbit(center, t, radius = 22, height = 7) {
    const angle = Math.PI * 0.35 + t * Math.PI * 1.1;
    this.camera.position.set(center.x + Math.sin(angle) * radius, center.y + height - t * 3, center.z + Math.cos(angle) * radius);
    this.camera.lookAt(center.x, center.y + 1, center.z);
    this.fov = 50;
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
