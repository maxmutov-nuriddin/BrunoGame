import * as THREE from 'three';
import type { Collider, DynamicRayCastVehicleController, RigidBody } from '@dimforge/rapier3d-compat';
import type PhysicsWorld from './PhysicsWorld.ts';
import type { Vec3 } from './PhysicsWorld.ts';
import { CAR_GROUPS, GHOST_GROUPS, RAPIER, STATIC_QUERY_GROUPS } from './rapier.ts';
import type { DriveInput } from '../input.ts';
import type { HandlingConfig, VehicleDefinition } from '../vehicles.ts';

export const WHEEL_RADIUS = 0.35;
export const SUSPENSION_REST = 0.32;
export const WHEEL_CONNECTIONS: readonly Vec3[] = Object.freeze([
  { x: -0.97, y: 0.04, z: -1.3 },
  { x: 0.97, y: 0.04, z: -1.3 },
  { x: -0.97, y: 0.04, z: 1.3 },
  { x: 0.97, y: 0.04, z: 1.3 }
]);
const WHEELBASE = 2.6;
const TRACK_HALF = 0.97;
const CHASSIS_HALF = { x: 0.89, y: 0.24, z: 2.025 };
const CHASSIS_OFFSET_Y = 0.18;
const CABIN_MASS = 100;
const REFERENCE_MASS = 1250;
const SOFT_CCD_DISTANCE = 1.5;
const CHASSIS_FRICTION = 0.12;

export const NITRO_CAPACITY = 100;
const NITRO_MIN_TO_START = 8;
const DRIFT_MIN_SPEED = 11;
const DRIFT_MIN_STEER = 0.15;
const DRIFT_KEEP_SLIP = THREE.MathUtils.degToRad(12);
const DRIFT_MAX_DURATION = 8;
const DRIFT_EXIT_BOOST_MIN_TIME = 0.6;
const DRIFT_EXIT_BOOST_MAX_SLIP = THREE.MathUtils.degToRad(25);
const DRIFT_EXIT_BOOST_DV = 1.8;
const DRIFT_REWARD_MIN_SLIP = THREE.MathUtils.degToRad(8);
const DRIFT_REWARD_MAX_SLIP = THREE.MathUtils.degToRad(65);
const DRIFT_REWARD_MIN_SPEED = 12;
/** Yaw rate (rad/s) the drift steers toward at full lock. */
const DRIFT_TARGET_YAW_RATE = 1.35;
const DRIFT_YAW_GAIN = 7;
/** Beyond this slip the rear tyres progressively regain grip, so drifts never become spins. */
const DRIFT_SLIP_LIMIT = THREE.MathUtils.degToRad(40);
/** Throttle keeps momentum through a drift (m/s² along the direction of travel). */
const DRIFT_MOMENTUM = 4.5;
/** How fast sideways velocity turns into forward velocity while drifting (1/s); sets the steady slip angle. */
const DRIFT_TRACTION = 1.7;
const DRIFT_SPEED_LOSS = 0.05;
const LATERAL_ASSIST = 1.6;
const ROLLING_RESISTANCE = 0.15;
const DRAG = 0.42;
const DOWNFORCE = 0.65;
const COAST_BRAKE = 200;
/** Horizontal velocity change in one step that counts as a collision (m/s). */
export const IMPACT_THRESHOLD = 1.2;
/**
 * Arcade glancing hits: after a collision that turned the car by more than this, its horizontal speed is
 * at least `before * sqrt(cos(turn))` (20° keeps 97 %, 45° keeps 84 %, 70° keeps 58 %, head-on stops).
 * Smaller turns are rear-end bumps and pushes, which physics already handles.
 */
const GLANCE_MIN_TURN = THREE.MathUtils.degToRad(8);
const GLANCE_MIN_SPEED = 4;
const JUMP_COOLDOWN = 0.6;
const LAND_EVENT_MIN_AIRTIME = 0.45;

export interface VehicleRules {
  /** Cars hold still on the grid until GO. */
  frozen: boolean;
  allowJump: boolean;
}

export type VehicleEventType = 'driftStart' | 'driftEnd' | 'driftBoost' | 'nitroStart' | 'nitroEnd' | 'jump' | 'land';
export interface VehicleEvent { type: VehicleEventType; value: number }

/** Everything needed to rewind and replay a car (client prediction). */
export interface VehicleState {
  p: [number, number, number];
  q: [number, number, number, number];
  v: [number, number, number];
  w: [number, number, number];
  engineForce: number;
  steerValue: number;
  nitro: number;
  nitroActive: boolean;
  drifting: boolean;
  driftTime: number;
  driftCharge: number;
  jumpCooldown: number;
  prevJump: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpQuat = new THREE.Quaternion();
const axis = new THREE.Vector3();

export default class VehiclePhysics {
  readonly body: RigidBody;
  readonly chassis: Collider;
  readonly cabin: Collider;
  readonly controller: DynamicRayCastVehicleController;
  readonly handling: HandlingConfig;
  readonly mass: number;
  readonly events: VehicleEvent[] = [];
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly right = new THREE.Vector3(1, 0, 0);
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly velocity = new THREE.Vector3();

  engineForce = 0;
  steerValue = 0;
  nitro = 0;
  nitroActive = false;
  drifting = false;
  driftTime = 0;
  /** Nitro already granted during the current drift (capped by the race rules). */
  driftCharge = 0;
  slipAngle = 0;
  grounded = false;
  airTime = 0;
  jumpCooldown = 0;
  speed = 0;
  forwardSpeed = 0;
  braking = false;
  reversing = false;
  /** Horizontal velocity change beyond normal driving in the last step (m/s). */
  impact = 0;
  ghost = false;

  private prevJump = false;
  private readonly prevVelocity = new THREE.Vector3();
  private readonly physics: PhysicsWorld;

  constructor(physics: PhysicsWorld, definition: VehicleDefinition, spawn: { position: Vec3; yaw: number }) {
    this.physics = physics;
    this.handling = definition.handling;
    this.mass = this.handling.mass;

    const rotation = new THREE.Quaternion().setFromAxisAngle(UP, spawn.yaw);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.position.x, spawn.position.y, spawn.position.z)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
      .setCanSleep(false)
      // Soft CCD: predictive contacts stop wall tunnelling at a fraction of hard CCD's cost against trimeshes.
      .setSoftCcdPrediction(SOFT_CCD_DISTANCE)
      .setLinearDamping(0.025)
      .setAngularDamping(0.35)
      .setAdditionalSolverIterations(6);
    this.body = physics.world.createRigidBody(desc);

    const inertiaScale = this.mass / REFERENCE_MASS;
    const chassisDesc = RAPIER.ColliderDesc.cuboid(CHASSIS_HALF.x, CHASSIS_HALF.y, CHASSIS_HALF.z)
      .setTranslation(0, CHASSIS_OFFSET_Y, 0)
      // Low body friction: cars and walls glance off each other instead of locking together.
      .setFriction(CHASSIS_FRICTION)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.05)
      .setCollisionGroups(CAR_GROUPS)
      .setMassProperties(
        this.mass - CABIN_MASS,
        { x: 0, y: -0.18, z: 0 },
        { x: 1700 * inertiaScale, y: 1900 * inertiaScale, z: 500 * inertiaScale },
        { x: 0, y: 0, z: 0, w: 1 }
      );
    this.chassis = physics.world.createCollider(chassisDesc, this.body);
    const cabinDesc = RAPIER.ColliderDesc.cuboid(0.65, 0.27, 0.6)
      .setTranslation(0, 0.78, 0.12)
      .setMass(CABIN_MASS)
      .setFriction(CHASSIS_FRICTION)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setCollisionGroups(CAR_GROUPS);
    this.cabin = physics.world.createCollider(cabinDesc, this.body);

    this.controller = physics.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    const { suspension } = this.handling;
    WHEEL_CONNECTIONS.forEach((connection, i) => {
      this.controller.addWheel(connection, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, SUSPENSION_REST, WHEEL_RADIUS);
      this.controller.setWheelSuspensionStiffness(i, suspension.stiffness);
      this.controller.setWheelSuspensionCompression(i, suspension.compression);
      this.controller.setWheelSuspensionRelaxation(i, suspension.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, suspension.travel);
      this.controller.setWheelMaxSuspensionForce(i, 12000 * inertiaScale);
      this.controller.setWheelFrictionSlip(i, this.handling.grip);
      this.controller.setWheelSideFrictionStiffness(i, this.handling.sideGrip);
    });
    this.readFrame();
  }

  /** Apply one fixed step of driver input. Call before `world.step()`. */
  step(input: DriveInput, dt: number, rules: VehicleRules): void {
    this.events.length = 0;
    this.readFrame();
    const h = this.handling;
    const throttle = rules.frozen ? 0 : input.throttle;

    this.reversing = throttle < 0 && this.forwardSpeed < 1;
    this.braking = rules.frozen || (throttle < 0 && this.forwardSpeed >= 1) || (throttle > 0 && this.forwardSpeed < -1);

    this.updateNitro(input, dt, rules);
    this.updateDrift(input, dt, rules);

    const limit = this.reversing ? h.reverseSpeed : h.maxSpeed + (this.nitroActive ? h.nitro.speedBonus : 0);
    const drive = this.braking ? 0 : this.reversing ? throttle : Math.max(throttle, this.nitroActive ? 1 : 0);
    const power = h.acceleration * (this.nitroActive ? h.nitro.strength : 1);
    const headroom = THREE.MathUtils.clamp(1 - Math.abs(this.forwardSpeed) / limit, 0, 1);
    const targetForce = -drive * power * Math.sqrt(headroom);
    this.engineForce = this.braking ? 0 : THREE.MathUtils.damp(this.engineForce, targetForce, 6, dt);

    const lock = THREE.MathUtils.lerp(h.steering, h.steeringAtSpeed, Math.min(this.speed / h.maxSpeed, 1)) * (this.drifting ? 1.35 : 1);
    this.steerValue = THREE.MathUtils.damp(this.steerValue, input.steer * lock, 8, dt);

    this.applyWheels(input, throttle, dt);
    this.applyAssists(input, throttle, dt);
    this.applyJump(input, rules);

    this.controller.updateVehicle(dt, undefined, STATIC_QUERY_GROUPS, (collider) => collider.parent()?.handle !== this.body.handle);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
  }

  /** Read results after `world.step()`: speed, contact, slip and impacts. */
  afterStep(): void {
    const v = this.body.linvel();
    const dvx = v.x - this.prevVelocity.x;
    const dvz = v.z - this.prevVelocity.z;
    this.impact = Math.max(0, Math.hypot(dvx, dvz) - IMPACT_THRESHOLD);
    if (this.impact > 0) this.keepGlancingSpeed(v);
    const after = this.body.linvel();
    this.prevVelocity.set(after.x, after.y, after.z);

    const wasGrounded = this.grounded;
    this.grounded = this.wheelContacts() > 0;
    if (this.grounded && !wasGrounded && this.airTime > LAND_EVENT_MIN_AIRTIME) {
      this.events.push({ type: 'land', value: this.airTime });
    }
    this.readFrame();
  }

  /** Scale horizontal velocity back up after a glancing hit; direction stays what physics decided. */
  private keepGlancingSpeed(v: { x: number; y: number; z: number }): void {
    const before = Math.hypot(this.prevVelocity.x, this.prevVelocity.z);
    const after = Math.hypot(v.x, v.z);
    if (before < GLANCE_MIN_SPEED || after < 0.5) return;
    const cosTurn = THREE.MathUtils.clamp((this.prevVelocity.x * v.x + this.prevVelocity.z * v.z) / (before * after), -1, 1);
    if (cosTurn <= 0 || Math.acos(cosTurn) < GLANCE_MIN_TURN) return;
    const target = before * Math.sqrt(cosTurn);
    if (after >= target) return;
    const scale = target / after;
    this.body.setLinvel({ x: v.x * scale, y: v.y, z: v.z * scale }, true);
  }

  /** True when the current drift qualifies for a nitro reward this step. */
  get driftRewardEligible(): boolean {
    const slip = Math.abs(this.slipAngle);
    return (
      this.drifting && this.grounded && this.speed > DRIFT_REWARD_MIN_SPEED &&
      slip > DRIFT_REWARD_MIN_SLIP && slip < DRIFT_REWARD_MAX_SLIP
    );
  }

  addNitro(amount: number): void {
    this.nitro = THREE.MathUtils.clamp(this.nitro + amount, 0, NITRO_CAPACITY);
  }

  setGhost(ghost: boolean): void {
    if (ghost === this.ghost) return;
    this.ghost = ghost;
    const groups = ghost ? GHOST_GROUPS : CAR_GROUPS;
    this.chassis.setCollisionGroups(groups);
    this.cabin.setCollisionGroups(groups);
  }

  /** Place the car upright at `position`, heading `yaw`, moving forward at `speed`. */
  teleport(position: Vec3, yaw: number, speed = 0): void {
    tmpQuat.setFromAxisAngle(UP, yaw);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(tmpQuat);
    this.body.setTranslation(position, true);
    this.body.setRotation({ x: tmpQuat.x, y: tmpQuat.y, z: tmpQuat.z, w: tmpQuat.w }, true);
    this.body.setLinvel({ x: dir.x * speed, y: 0, z: dir.z * speed }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVelocity.set(dir.x * speed, 0, dir.z * speed);
    this.engineForce = 0;
    this.steerValue = 0;
    this.drifting = false;
    this.nitroActive = false;
    this.impact = 0;
    this.airTime = 0;
    this.readFrame();
  }

  /** Weapon or shockwave push. Not counted as a crash by the impact detector. */
  applyImpulse(impulse: Vec3, torque?: Vec3): void {
    this.body.applyImpulse(impulse, true);
    if (torque) this.body.applyTorqueImpulse(torque, true);
    this.prevVelocity.x += impulse.x / this.mass;
    this.prevVelocity.z += impulse.z / this.mass;
  }

  getState(): VehicleState {
    const p = this.body.translation();
    const q = this.body.rotation();
    const v = this.body.linvel();
    const w = this.body.angvel();
    return {
      p: [p.x, p.y, p.z],
      q: [q.x, q.y, q.z, q.w],
      v: [v.x, v.y, v.z],
      w: [w.x, w.y, w.z],
      engineForce: this.engineForce,
      steerValue: this.steerValue,
      nitro: this.nitro,
      nitroActive: this.nitroActive,
      drifting: this.drifting,
      driftTime: this.driftTime,
      driftCharge: this.driftCharge,
      jumpCooldown: this.jumpCooldown,
      prevJump: this.prevJump
    };
  }

  setState(state: VehicleState): void {
    const [px, py, pz] = state.p;
    const [qx, qy, qz, qw] = state.q;
    this.body.setTranslation({ x: px, y: py, z: pz }, true);
    this.body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
    this.body.setLinvel({ x: state.v[0], y: state.v[1], z: state.v[2] }, true);
    this.body.setAngvel({ x: state.w[0], y: state.w[1], z: state.w[2] }, true);
    this.prevVelocity.set(state.v[0], state.v[1], state.v[2]);
    this.engineForce = state.engineForce;
    this.steerValue = state.steerValue;
    this.nitro = state.nitro;
    this.nitroActive = state.nitroActive;
    this.drifting = state.drifting;
    this.driftTime = state.driftTime;
    this.driftCharge = state.driftCharge;
    this.jumpCooldown = state.jumpCooldown;
    this.prevJump = state.prevJump;
    this.readFrame();
  }

  wheelContacts(): number {
    let count = 0;
    for (let i = 0; i < 4; i++) if (this.controller.wheelIsInContact(i)) count++;
    return count;
  }

  /** Visual wheel pose: suspension drop, steering and spin per wheel. */
  wheelPose(i: number): { drop: number; steering: number; rotation: number } {
    return {
      drop: WHEEL_CONNECTIONS[i].y - (this.controller.wheelSuspensionLength(i) ?? SUSPENSION_REST),
      steering: this.controller.wheelSteering(i) ?? 0,
      rotation: this.controller.wheelRotation(i) ?? 0
    };
  }

  dispose(): void {
    this.physics.world.removeVehicleController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }

  private readFrame(): void {
    const q = this.body.rotation();
    tmpQuat.set(q.x, q.y, q.z, q.w);
    this.forward.set(0, 0, -1).applyQuaternion(tmpQuat);
    this.right.set(1, 0, 0).applyQuaternion(tmpQuat);
    this.up.set(0, 1, 0).applyQuaternion(tmpQuat);
    const v = this.body.linvel();
    this.velocity.set(v.x, v.y, v.z);
    this.forwardSpeed = this.velocity.dot(this.forward);
    this.speed = Math.hypot(v.x, v.z);
    const lateral = this.velocity.dot(this.right);
    this.slipAngle = this.speed > 3 ? Math.atan2(lateral, Math.abs(this.forwardSpeed)) : 0;
  }

  private updateNitro(input: DriveInput, dt: number, rules: VehicleRules): void {
    const want = !rules.frozen && input.nitro && input.throttle >= 0 && !this.reversing;
    if (this.nitroActive && (!want || this.nitro <= 0)) {
      this.nitroActive = false;
      this.events.push({ type: 'nitroEnd', value: this.nitro });
    } else if (!this.nitroActive && want && this.nitro >= NITRO_MIN_TO_START) {
      this.nitroActive = true;
      this.events.push({ type: 'nitroStart', value: this.nitro });
    }
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - this.handling.nitro.burnRate * dt);
  }

  private updateDrift(input: DriveInput, dt: number, rules: VehicleRules): void {
    if (!this.drifting) {
      const canStart =
        !rules.frozen && input.handbrake && this.grounded && this.speed > DRIFT_MIN_SPEED && Math.abs(input.steer) > DRIFT_MIN_STEER;
      if (canStart) {
        this.drifting = true;
        this.driftTime = 0;
        this.driftCharge = 0;
        this.events.push({ type: 'driftStart', value: this.speed });
      }
      return;
    }

    this.driftTime += dt;
    const slip = Math.abs(this.slipAngle);
    const keep = (input.handbrake || slip > DRIFT_KEEP_SLIP) && this.speed > 7 && this.driftTime < DRIFT_MAX_DURATION;
    if (keep) return;

    this.drifting = false;
    this.events.push({ type: 'driftEnd', value: this.driftTime });
    const boost = input.throttle > 0.5 && this.driftTime > DRIFT_EXIT_BOOST_MIN_TIME && slip < DRIFT_EXIT_BOOST_MAX_SLIP;
    if (!boost) return;
    const dv = DRIFT_EXIT_BOOST_DV;
    this.body.applyImpulse({ x: this.forward.x * this.mass * dv, y: 0, z: this.forward.z * this.mass * dv }, true);
    this.prevVelocity.addScaledVector(this.forward, dv);
    this.events.push({ type: 'driftBoost', value: this.driftTime });
  }

  private applyWheels(input: DriveInput, throttle: number, dt: number): void {
    const h = this.handling;
    const overSlip = THREE.MathUtils.clamp((Math.abs(this.slipAngle) - DRIFT_SLIP_LIMIT) / DRIFT_SLIP_LIMIT, 0, 1);
    const driftSide = THREE.MathUtils.lerp(h.sideGrip * h.driftGrip, h.sideGrip, overSlip);
    const rearSide = this.drifting ? driftSide : h.sideGrip;
    const rearSlip = this.drifting ? h.grip * 0.85 : h.grip;
    const handbrakeOnly = input.handbrake && !this.drifting;
    const coast = throttle === 0 && !this.nitroActive;

    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      // AWD with a rear bias; Rapier's brake value is an impulse, hence the fixed-step scale.
      this.controller.setWheelEngineForce(i, this.engineForce * (rear ? 0.3 : 0.2));
      let brake = this.braking ? h.braking / 4 : coast ? COAST_BRAKE / 4 : 0;
      if (rear && handbrakeOnly) brake = Math.max(brake, (h.braking * 0.6) / 2);
      this.controller.setWheelBrake(i, brake * dt);
      if (rear) {
        this.controller.setWheelSideFrictionStiffness(i, rearSide);
        this.controller.setWheelFrictionSlip(i, rearSlip);
      }

      let steering = 0;
      if (!rear && Math.abs(this.steerValue) > 0.001) {
        const radius = WHEELBASE / Math.tan(Math.abs(this.steerValue));
        const inner = (this.steerValue > 0 && i === 0) || (this.steerValue < 0 && i === 1);
        steering = Math.sign(this.steerValue) * Math.atan(WHEELBASE / (radius + (inner ? -TRACK_HALF : TRACK_HALF)));
      }
      this.controller.setWheelSteering(i, steering);
    }
  }

  private applyAssists(input: DriveInput, throttle: number, dt: number): void {
    const m = this.mass;
    const v = this.body.linvel();
    const drag = DRAG * this.speed;
    this.body.applyImpulse({ x: -v.x * drag * dt, y: 0, z: -v.z * drag * dt }, true);

    if (this.grounded) {
      this.airTime = 0;
      this.body.applyImpulse({ x: 0, y: -DOWNFORCE * this.speed * this.speed * dt, z: 0 }, true);
      if (throttle === 0 && !this.nitroActive && Math.abs(this.forwardSpeed) > 0.1) {
        const roll = -Math.sign(this.forwardSpeed) * Math.min(Math.abs(this.forwardSpeed), ROLLING_RESISTANCE * 9.81 * dt) * m;
        this.body.applyImpulse({ x: this.forward.x * roll, y: 0, z: this.forward.z * roll }, true);
      }
      if (this.drifting) {
        this.steerDrift(input, throttle, dt);
      } else {
        const lateral = v.x * this.right.x + v.z * this.right.z;
        const push = -lateral * m * LATERAL_ASSIST * dt;
        this.body.applyImpulse({ x: this.right.x * push, y: 0, z: this.right.z * push }, true);
      }
      return;
    }

    // Airborne: gentle yaw control and self-levelling so landings stay controllable.
    this.airTime += dt;
    const yaw = input.steer * this.handling.airControl * m * 0.5 * dt;
    axis.crossVectors(this.up, UP).multiplyScalar(m * 2.2 * dt);
    this.body.applyTorqueImpulse({ x: axis.x, y: axis.y + yaw, z: axis.z }, true);
  }

  /** Arcade drift: steer sets the yaw rate, throttle keeps momentum along the slide. */
  private steerDrift(input: DriveInput, throttle: number, dt: number): void {
    const w = this.body.angvel();
    const yawRate = w.x * this.up.x + w.y * this.up.y + w.z * this.up.z;
    const target = input.steer * DRIFT_TARGET_YAW_RATE * Math.min(this.speed / 15, 1);
    const inertia = 1900 * (this.mass / REFERENCE_MASS);
    const yaw = (target - yawRate) * inertia * Math.min(DRIFT_YAW_GAIN * dt, 1);
    this.body.applyTorqueImpulse({ x: this.up.x * yaw, y: this.up.y * yaw, z: this.up.z * yaw }, true);
    this.redirectSlide(dt);

    if (throttle <= 0 || this.speed > this.handling.maxSpeed * 0.92 || this.speed < 1) return;
    const push = this.mass * DRIFT_MOMENTUM * throttle * dt;
    const v = this.body.linvel();
    this.body.applyImpulse({ x: (v.x / this.speed) * push, y: 0, z: (v.z / this.speed) * push }, true);
  }

  /** Bend the direction of travel toward the nose while keeping most of the speed. */
  private redirectSlide(dt: number): void {
    const v = this.body.linvel();
    const along = v.x * this.forward.x + v.z * this.forward.z;
    const lateral = v.x * this.right.x + v.z * this.right.z;
    const horizontal = Math.hypot(v.x, v.z);
    const newLateral = lateral * (1 - Math.min(DRIFT_TRACTION * dt, 1));
    const newAlong = Math.sign(along || 1) * Math.sqrt(Math.max(horizontal * horizontal - newLateral * newLateral, 0)) * (1 - DRIFT_SPEED_LOSS * dt);
    const dAlong = newAlong - along;
    const dLateral = newLateral - lateral;
    this.body.applyImpulse(
      {
        x: this.mass * (this.forward.x * dAlong + this.right.x * dLateral),
        y: 0,
        z: this.mass * (this.forward.z * dAlong + this.right.z * dLateral)
      },
      true
    );
  }

  private applyJump(input: DriveInput, rules: VehicleRules): void {
    const pressed = input.jump && !this.prevJump;
    this.prevJump = input.jump;
    if (!pressed || !rules.allowJump || rules.frozen || !this.grounded || this.jumpCooldown > 0) return;
    this.body.applyImpulse({ x: 0, y: this.mass * this.handling.jumpImpulse, z: 0 }, true);
    this.jumpCooldown = JUMP_COOLDOWN;
    this.events.push({ type: 'jump', value: 1 });
  }
}
