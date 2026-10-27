import * as THREE from 'three';
import PhysicsWorld from '../../shared/physics/PhysicsWorld.ts';
import VehiclePhysics from '../../shared/physics/VehiclePhysics.ts';
import { GROUP, RAPIER, STATIC_QUERY_GROUPS, interactionGroups } from '../../shared/physics/rapier.ts';
import { buildTrackColliders } from '../../shared/track/colliders.ts';
import { findVehicle } from '../../shared/vehicles.ts';
import { FIXED_DT, INPUT_SEND_EVERY_TICKS, TICK_RATE } from '../../shared/constants.ts';
import { encodeInput, NEUTRAL_INPUT } from '../../shared/input.ts';
import { MAX_INPUTS_PER_MESSAGE } from '../../shared/net/protocol.ts';
import { CarFrame, flagsFromBits } from './frames.js';

const TICK_MS = 1000 / TICK_RATE;
/** Projectiles and mines are drawn slightly in the past so they never jump backwards. */
const INTERPOLATION_DELAY_MS = 100;
/** Rivals are predicted at most this far past their last snapshot. */
const MAX_EXTRAPOLATION_MS = 250;
const RIVAL_SMOOTHING = 14;
/** Rivals: how fast the drawn velocity follows the snapshot velocity, and the drawn position its target (1/s). */
const RIVAL_VELOCITY_BLEND = 10;
const RIVAL_POSITION_BLEND = 6;
const RIVAL_SNAP_DISTANCE = 6;
const target = new THREE.Vector3();
const targetQuat = new THREE.Quaternion();
const tmpVelocity = new THREE.Vector3();
const IDENTITY_QUAT = new THREE.Quaternion();
const SNAPSHOT_BUFFER = 40;
const HISTORY = 240;
const POSITION_TOLERANCE = 0.12;
const VELOCITY_TOLERANCE = 0.4;
/** Fast cars move over a metre per tick, so the tolerances widen with speed (per m/s) to avoid needless replays. */
const POSITION_TOLERANCE_PER_SPEED = 0.004;
const VELOCITY_TOLERANCE_PER_SPEED = 0.01;
const CORRECTION_DECAY = 7;
const MAX_CATCH_UP = 8;
const SNAP_DISTANCE = 6;
/** Rival proxies touch only cars: they are moved to the snapshot every frame, never by the track. */
const PROXY_GROUPS = interactionGroups(GROUP.CAR, GROUP.CAR);
const PROXY_HALF = { x: 0.89, y: 0.4, z: 2.0 };
const PROXY_FRICTION = 0.12;
const PROXY_RESTITUTION = 0.05;

/**
 * Networked race view. The host (a browser running shared/host) is the only authority: the local car is predicted for
 * responsiveness and reconciled to server snapshots; rivals are interpolated.
 */
export default class OnlineRaceSession {
  static async create(net, setup) {
    const physics = await PhysicsWorld.create();
    return new OnlineRaceSession(net, setup, physics);
  }

  constructor(net, setup, physics) {
    this.kind = 'online';
    this.net = net;
    this.setup = setup;
    this.track = setup.track;
    this.localId = setup.youId;
    this.config = { laps: setup.laps, itemsEnabled: setup.itemsEnabled, participants: setup.participants, mode: 'race', track: setup.track };
    this.physics = physics;
    this.staticBodies = buildTrackColliders(physics, this.track);
    this.frames = new Map(setup.participants.map((p) => [p.id, new CarFrame(p, p.id === this.localId)]));
    this.goTick = Infinity;
    this.tick0At = -1;
    this.localTick = 0;
    this.seq = 0;
    this.history = [];
    this.unsent = [];
    this.snapshots = [];
    this.events = [];
    this.results = null;
    this.initialized = false;
    this.correction = new THREE.Vector3();
    /** Rotation still to blend out after a replay: drawn = correctionQuat × simulated. */
    this.correctionQuat = new THREE.Quaternion();
    /** Pose one tick before the current one, for drawing the local car between ticks. */
    this.prevPose = null;
    this.rivalMotion = new Map();
    this.stats = { replays: 0, lastError: 0 };
    this.serverPhase = 'countdown';
    this.lastSnapshotAt = 0;

    const slot = setup.participants.findIndex((p) => p.id === this.localId);
    const grid = this.track.grid[Math.max(0, slot)];
    const local = setup.participants[Math.max(0, slot)];
    this.car = local ? new VehiclePhysics(physics, findVehicle(local.vehicleId), { position: grid, yaw: grid.yaw }) : null;
    this.proxies = new Map();
    for (const [index, participant] of setup.participants.entries()) {
      if (participant.id === this.localId) continue;
      const g = this.track.grid[index];
      // Dynamic with the rival's real mass (not kinematic): a bump shares momentum like it does on the
      // server, instead of the local car bouncing off an immovable wall and then being corrected.
      const body = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(g.x, g.y, g.z).setGravityScale(0).lockRotations().setCanSleep(false)
      );
      const collider = physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(PROXY_HALF.x, PROXY_HALF.y, PROXY_HALF.z)
          .setTranslation(0, 0.3, 0)
          .setMass(findVehicle(participant.vehicleId).handling.mass)
          .setFriction(PROXY_FRICTION)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setRestitution(PROXY_RESTITUTION)
          .setCollisionGroups(PROXY_GROUPS),
        body
      );
      this.proxies.set(participant.id, { body, collider, ghost: false });
      this.frames.get(participant.id).position.set(g.x, g.y, g.z);
    }

    this.onSnapshot = (event) => this.receive(event.detail.s);
    this.onStart = (event) => this.start(event.detail);
    this.onResults = (event) => {
      this.results = event.detail.results;
    };
    net.addEventListener('snapshot', this.onSnapshot);
    net.addEventListener('raceStart', this.onStart);
    net.addEventListener('results', this.onResults);
    if (net.lastRaceStart?.raceId === setup.raceId) this.start(net.lastRaceStart);

    // A hidden tab stops rendering, so it would stop sending input; leave the car coasting instead.
    this.onVisibility = () => {
      if (document.hidden && this.started) this.net.send({ type: 'input', inputs: [encodeInput(this.seq++, Math.max(0, this.localTick), NEUTRAL_INPUT)] });
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start({ tick0At, goTick }) {
    this.tick0At = tick0At;
    this.goTick = goTick;
  }

  get started() {
    return this.tick0At >= 0;
  }

  /** Server tick we believe is happening right now. */
  serverTick() {
    if (!this.started) return 0;
    return (this.net.serverNow() - this.tick0At) / TICK_MS;
  }

  get tick() {
    return this.localTick;
  }

  get displayTick() {
    return Math.max(0, this.serverTick());
  }

  get phase() {
    if (this.results) return 'finished';
    return this.serverPhase === 'countdown' && this.displayTick >= this.goTick ? 'racing' : this.serverPhase;
  }

  get ended() {
    return this.results !== null;
  }

  setPaused() {
    // Online races never pause; Esc only opens a local menu.
  }

  receive(snapshot) {
    this.lastSnapshotAt = performance.now();
    this.serverPhase = snapshot.ph;
    const cars = new Map(snapshot.cars.map((c) => [c[0], c]));
    this.snapshots.push({ st: snapshot.st, k: snapshot.k, cars, pr: snapshot.pr, mn: snapshot.mn, pk: snapshot.pk });
    if (this.snapshots.length > SNAPSHOT_BUFFER) this.snapshots.shift();
    for (const { e } of snapshot.ev) {
      this.events.push({ k: snapshot.k, e });
      this.trackLapEvent(e);
    }
    for (const wire of snapshot.cars) this.applyStatus(wire);
    const mine = cars.get(this.localId);
    if (mine) this.reconcile(snapshot, mine);
  }

  trackLapEvent(e) {
    const frame = this.frames.get(e.car);
    if (!frame) return;
    if (e.t === 'lap') {
      frame.lastLapTicks = e.ticks;
      if (e.best) frame.bestLapTicks = e.ticks;
    } else if (e.t === 'finish') {
      frame.finishTicks = e.ticks;
    }
  }

  applyStatus(wire) {
    const frame = this.frames.get(wire[0]);
    if (!frame) return;
    frame.health = wire[14];
    frame.nitro = wire[15];
    frame.flags = flagsFromBits(wire[16]);
    frame.item = wire[17] || null;
    frame.lapsCompleted = wire[18];
    frame.nextCheckpoint = wire[19];
    frame.rank = wire[20];
    frame.progress = wire[21];
    frame.steer = wire[22];
    frame.lastCheckpoint = wire[23];
  }

  /** Rewind to the server's state for the last acknowledged input and replay the rest. */
  reconcile(snapshot, wire) {
    if (!this.car) return;
    const flags = flagsFromBits(wire[16]);
    const serverState = this.stateFromWire(wire, snapshot.me, flags);
    if (!this.initialized || flags.wrecked) {
      this.car.setState(serverState);
      this.car.setGhost(flags.ghost);
      this.prevPose = null;
      this.localTick = snapshot.k;
      this.history = this.history.filter((h) => h.seq > snapshot.ack);
      this.initialized = true;
      return;
    }
    this.car.setGhost(flags.ghost);
    const index = this.history.findIndex((h) => h.seq === snapshot.ack);
    if (index < 0) return;
    const predicted = this.history[index].state;
    this.history = this.history.slice(index + 1);
    const positionError = Math.hypot(predicted.p[0] - serverState.p[0], predicted.p[1] - serverState.p[1], predicted.p[2] - serverState.p[2]);
    const velocityError = Math.hypot(predicted.v[0] - serverState.v[0], predicted.v[2] - serverState.v[2]);
    // Status-only fields never need a replay, but keep them authoritative.
    const speed = Math.hypot(serverState.v[0], serverState.v[2]);
    const positionTolerance = POSITION_TOLERANCE + speed * POSITION_TOLERANCE_PER_SPEED;
    const velocityTolerance = VELOCITY_TOLERANCE + speed * VELOCITY_TOLERANCE_PER_SPEED;
    if (positionError < positionTolerance && velocityError < velocityTolerance) {
      this.car.nitro = serverState.nitro;
      return;
    }
    const before = this.car.body.translation();
    const beforeRotation = this.car.body.rotation();
    const qBefore = new THREE.Quaternion(beforeRotation.x, beforeRotation.y, beforeRotation.z, beforeRotation.w);
    this.stats.replays += 1;
    this.stats.lastError = positionError;
    this.car.setState(serverState);
    // Rival positions at those past ticks are unknown (proxies sit at the present), so the replay ignores
    // them; the server state we rewound to already contains every contact up to the acknowledged input.
    this.setProxiesActive(false);
    for (const entry of this.history) {
      this.simulate(entry.input, entry.tick);
      entry.state = this.car.getState();
    }
    this.setProxiesActive(true);
    const after = this.car.body.translation();
    const jump = Math.hypot(before.x - after.x, before.z - after.z);
    // Respawns and big desyncs snap; small errors are blended out over a few frames.
    if (jump > SNAP_DISTANCE) {
      this.correction.set(0, 0, 0);
      this.correctionQuat.identity();
      this.prevPose = null;
      return;
    }
    this.correction.add(new THREE.Vector3(before.x - after.x, before.y - after.y, before.z - after.z));
    const r = this.car.body.rotation();
    const qAfterInverse = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
    this.correctionQuat.premultiply(qBefore.multiply(qAfterInverse)).normalize();
  }

  stateFromWire(wire, me, flags) {
    const [engineForce, steerValue, driftTime, driftCharge, jumpCooldown, prevJump] = me ?? [0, 0, 0, 0, 0, 0];
    return {
      p: [wire[1], wire[2], wire[3]],
      q: [wire[4], wire[5], wire[6], wire[7]],
      v: [wire[8], wire[9], wire[10]],
      w: [wire[11], wire[12], wire[13]],
      engineForce, steerValue, nitro: wire[15], nitroActive: flags.nitro, drifting: flags.drifting,
      driftTime, driftCharge, jumpCooldown, prevJump: prevJump === 1
    };
  }

  simulate(input, tick) {
    const frame = this.frames.get(this.localId);
    const frozen = tick < this.goTick || frame.flags.wrecked || frame.flags.finished;
    this.car.step(input, FIXED_DT, { frozen, allowJump: false });
    this.physics.world.step();
    this.car.afterStep();
  }

  update(dt, input) {
    if (!this.started || !this.car) {
      this.flush();
      return;
    }
    const target = Math.floor(this.serverTick());
    if (!this.initialized) this.localTick = Math.max(this.localTick, target - 1);
    let steps = 0;
    this.moveProxies();
    while (this.localTick < target && steps < MAX_CATCH_UP) {
      const tick = this.localTick;
      const command = this.phase === 'finished' ? NEUTRAL_INPUT : input;
      this.capturePrevPose();
      this.simulate(command, tick);
      const seq = this.seq++;
      this.history.push({ seq, tick, input: command, state: this.car.getState() });
      if (this.history.length > HISTORY) this.history.shift();
      this.unsent.push(encodeInput(seq, Math.max(0, tick), command));
      this.localTick += 1;
      steps += 1;
      if (this.localTick % INPUT_SEND_EVERY_TICKS === 0) this.flush();
    }
    if (this.localTick < target - MAX_CATCH_UP) this.localTick = target;
    const decay = Math.exp(-dt * CORRECTION_DECAY);
    this.correction.multiplyScalar(decay);
    this.correctionQuat.slerp(IDENTITY_QUAT, 1 - decay);
  }

  capturePrevPose() {
    const p = this.car.body.translation();
    const q = this.car.body.rotation();
    this.prevPose ??= { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.prevPose.p.set(p.x, p.y, p.z);
    this.prevPose.q.set(q.x, q.y, q.z, q.w);
  }

  flush() {
    while (this.unsent.length > 0) {
      this.net.send({ type: 'input', inputs: this.unsent.splice(0, MAX_INPUTS_PER_MESSAGE) });
    }
  }

  /** Rivals at their extrapolated present, moving with their snapshot velocity, so local bumps feel right before the server confirms. */
  moveProxies() {
    const latest = this.snapshots.at(-1);
    if (!latest) return;
    const ahead = Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, this.net.serverNow() - latest.st)) / 1000;
    for (const [id, proxy] of this.proxies) {
      const c = latest.cars.get(id);
      if (!c) continue;
      proxy.ghost = flagsFromBits(c[16]).ghost;
      proxy.collider.setEnabled(!proxy.ghost);
      proxy.body.setTranslation({ x: c[1] + c[8] * ahead, y: c[2] + c[9] * ahead, z: c[3] + c[10] * ahead }, true);
      proxy.body.setRotation({ x: c[4], y: c[5], z: c[6], w: c[7] }, true);
      proxy.body.setLinvel({ x: c[8], y: c[9], z: c[10] }, true);
      proxy.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  setProxiesActive(active) {
    for (const proxy of this.proxies.values()) proxy.collider.setEnabled(active && !proxy.ghost);
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  readFrames(dt) {
    if (this.car) {
      const frame = this.frames.get(this.localId);
      const p = this.car.body.translation();
      const q = this.car.body.rotation();
      const v = this.car.body.linvel();
      frame.position.set(p.x, p.y, p.z);
      frame.quaternion.set(q.x, q.y, q.z, q.w);
      // Draw between the previous and the current tick (one tick behind real time) so the car glides
      // instead of stepping at 60 Hz on faster screens or when a frame takes two ticks.
      if (this.prevPose) {
        const alpha = THREE.MathUtils.clamp(this.serverTick() - this.localTick, 0, 1);
        frame.position.lerpVectors(this.prevPose.p, frame.position, alpha);
        frame.quaternion.slerpQuaternions(this.prevPose.q, frame.quaternion, alpha);
      }
      frame.position.add(this.correction);
      frame.quaternion.premultiply(this.correctionQuat);
      frame.velocity.set(v.x, v.y, v.z);
      frame.refresh();
      frame.steer = this.car.steerValue;
      frame.flags = { ...frame.flags, drifting: this.car.drifting, nitro: this.car.nitroActive, braking: this.car.braking, grounded: this.car.grounded };
      frame.nitro = this.car.nitro;
      frame.wheels = [0, 1, 2, 3].map((i) => this.car.wheelPose(i));
    }
    this.interpolateRivals(dt);
    return this.frames;
  }

  /**
   * Rivals are drawn where their collision proxies are: extrapolated to the present from the latest
   * snapshot, then smoothed. Drawing them 100 ms in the past made cars look like they drove through each other.
   */
  interpolateRivals(dt = 1 / 60) {
    const latest = this.snapshots.at(-1);
    if (!latest) return;
    const ahead = Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, this.net.serverNow() - latest.st)) / 1000;
    const blend = 1 - Math.exp(-dt * RIVAL_SMOOTHING);
    for (const [id, frame] of this.frames) {
      if (id === this.localId) continue;
      const c = latest.cars.get(id);
      if (!c) continue;
      target.set(c[1] + c[8] * ahead, c[2] + c[9] * ahead, c[3] + c[10] * ahead);
      targetQuat.set(c[4], c[5], c[6], c[7]);
      const motion = this.rivalMotion.get(id);
      if (!motion || frame.position.distanceTo(target) > RIVAL_SNAP_DISTANCE) {
        frame.position.copy(target);
        frame.quaternion.copy(targetQuat);
        this.rivalMotion.set(id, { velocity: new THREE.Vector3(c[8], c[9], c[10]) });
      } else {
        // Projective velocity blending: coast on a velocity that eases toward the snapshot's, and pull the
        // position toward the extrapolated target gently. A new snapshot bends the path instead of jerking it.
        motion.velocity.lerp(tmpVelocity.set(c[8], c[9], c[10]), 1 - Math.exp(-dt * RIVAL_VELOCITY_BLEND));
        frame.position.addScaledVector(motion.velocity, dt);
        frame.position.lerp(target, 1 - Math.exp(-dt * RIVAL_POSITION_BLEND));
        frame.quaternion.slerp(targetQuat, blend);
      }
      frame.velocity.set(c[8], c[9], c[10]);
      frame.refresh();
    }
  }

  readWorld() {
    const latest = this.snapshots.at(-1);
    if (!latest) return { taken: new Set(), projectiles: [], mines: [] };
    const ahead = Math.min(0.15, Math.max(0, (this.net.serverNow() - INTERPOLATION_DELAY_MS - latest.st) / 1000));
    return {
      taken: new Set(latest.pk),
      projectiles: latest.pr.map(([id, kind, x, y, z, vx, vz]) => ({ id, kind, x: x + vx * ahead, y, z: z + vz * ahead, vx, vz })),
      mines: latest.mn.map(([id, x, y, z, armed]) => ({ id, x, y, z, armed: armed === 1 }))
    };
  }

  raycast(origin, direction, maxDistance) {
    const hit = this.physics.world.castRay(new RAPIER.Ray(origin, direction), maxDistance, true, undefined, STATIC_QUERY_GROUPS);
    return hit ? hit.timeOfImpact : null;
  }

  /** Seconds since the last snapshot; used for the connection warning. */
  get snapshotAge() {
    return this.lastSnapshotAt ? (performance.now() - this.lastSnapshotAt) / 1000 : 0;
  }

  dispose() {
    this.net.removeEventListener('snapshot', this.onSnapshot);
    this.net.removeEventListener('raceStart', this.onStart);
    this.net.removeEventListener('results', this.onResults);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.car?.dispose();
    this.physics.dispose();
  }
}
