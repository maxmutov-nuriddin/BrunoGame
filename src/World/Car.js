import * as THREE from 'three';
import { DEFAULT_VEHICLE } from '../vehicles.js';

export default class Car {
  constructor(application) {
    this.application = application;
    this.vehicleDef = application.vehicle ?? DEFAULT_VEHICLE;
    this.handling = this.vehicleDef.handling;
    this.group = new THREE.Group();
    this.group.name = 'Car';
    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.speedNormalized = 0;
    this.grounded = false;
    this.crashCooldown = 0;
    this.jumpCooldown = 0;
    this.lastHorizontalSpeed = 0;
    this.engineForce = 0;
    this.steerValue = 0;
    this.suspensionRestLength = 0.32;
    this.wheelRadius = 0.35;
    this.mass = this.handling.mass;

    const { rigidBody, collider } = application.physics.createBox({
      position: new THREE.Vector3(0, 0.95, 0),
      size: new THREE.Vector3(1.78, 0.48, 4.05),
      colliderOffset: new THREE.Vector3(0, 0.18, 0),
      type: 'dynamic', canSleep: false, friction: 0.45,
      restitution: 0.05, density: 1
    });
    this.rigidBody = rigidBody;
    this.collider = collider;
    // Low centre of mass, full pitch/roll/yaw and a separate cabin collision shape.
    const inertiaScale = this.mass / 1250;
    collider.setMassProperties(this.mass - 100, { x: 0, y: -0.18, z: 0 },
      { x: 1700 * inertiaScale, y: 1900 * inertiaScale, z: 500 * inertiaScale }, { x: 0, y: 0, z: 0, w: 1 });
    const R = application.physics.RAPIER;
    const cabin = R.ColliderDesc.cuboid(.65, .27, .60).setTranslation(0, .78, .12).setMass(100);
    application.physics.world.createCollider(cabin, rigidBody);
    rigidBody.setLinearDamping(.025);
    rigidBody.setAngularDamping(.35);
    rigidBody.setAdditionalSolverIterations(6);
    rigidBody.enableCcd(true);

    this.vehicle = application.physics.world.createVehicleController(rigidBody);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    this.createVisuals();
    this.setupVehicle();
    application.scene.add(this.group);
  }

  createVisuals() {
    this.visualRoot = this.application.resources.items[this.vehicleDef.resource].scene.clone(true);
    this.group.add(this.visualRoot);
    this.brakeMaterials = new Set();
    this.visualRoot.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material.name === 'BrakeLights') this.brakeMaterials.add(node.material);
    });
    this.wheelHolders = [0, 1, 2, 3].map((index) => {
      const wheel = this.visualRoot.getObjectByName(`Wheel_${index}`);
      if (!wheel) throw new Error(`Car GLB is missing Wheel_${index}`);
      const holder = new THREE.Group();
      holder.position.copy(wheel.position);
      wheel.position.set(0, 0, 0);
      holder.add(wheel);
      this.visualRoot.add(holder);
      return holder;
    });
  }

  setupVehicle() {
    this.connections = [
      { x: -.97, y: .04, z: -1.30 }, { x: .97, y: .04, z: -1.30 },
      { x: -.97, y: .04, z: 1.30 }, { x: .97, y: .04, z: 1.30 }
    ];
    this.connections.forEach((connection, i) => {
      this.vehicle.addWheel(connection, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 },
        this.suspensionRestLength, this.wheelRadius);
      this.vehicle.setWheelSuspensionStiffness(i, this.handling.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(i, 4.4);
      this.vehicle.setWheelSuspensionRelaxation(i, 5.2);
      this.vehicle.setWheelMaxSuspensionTravel(i, this.handling.suspensionTravel);
      this.vehicle.setWheelMaxSuspensionForce(i, 12000);
      this.vehicle.setWheelFrictionSlip(i, this.handling.grip);
      this.vehicle.setWheelSideFrictionStiffness(i, 1.1);
    });
  }

  beforePhysics(delta) {
    const { throttle, steer, boost, brake } = this.application.controls.input;
    const q = this.rigidBody.rotation();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const v = this.rigidBody.linvel();
    const signedSpeed = forward.dot(new THREE.Vector3(v.x, v.y, v.z));
    const speed = Math.abs(signedSpeed);
    const changingDirection = throttle * signedSpeed < -.5;
    const braking = brake || changingDirection;
    const { topSpeed, boostSpeed, reverseSpeed, engineForce, boostForce } = this.handling;
    const limit = throttle < 0 ? reverseSpeed : boost ? boostSpeed : topSpeed;
    const force = braking ? 0 : -throttle * (boost ? boostForce : engineForce) * Math.max(0, 1 - speed / limit);
    this.engineForce = braking ? 0 : THREE.MathUtils.damp(this.engineForce, force, 5, delta);
    const angle = THREE.MathUtils.lerp(.48, .10, Math.min(speed / 32, 1)) * this.handling.steerScale;
    this.steerValue = THREE.MathUtils.damp(this.steerValue, steer * angle, 7, delta);
    this.grounded = this.getWheelContactCount() > 0;

    for (let i = 0; i < 4; i++) {
      // AWD split; Rapier's brake value is an impulse, so scale by the fixed step.
      this.vehicle.setWheelEngineForce(i, this.engineForce * (i < 2 ? .2 : .3));
      this.vehicle.setWheelBrake(i, (braking ? 10500 : throttle === 0 ? 180 : 0) * delta / 4);
      let steering = 0;
      if (i < 2 && Math.abs(this.steerValue) > .001) {
        const radius = 2.6 / Math.tan(Math.abs(this.steerValue));
        const inner = (this.steerValue > 0 && i === 0) || (this.steerValue < 0 && i === 1);
        steering = Math.sign(this.steerValue) * Math.atan(2.6 / (radius + (inner ? -.97 : .97)));
      }
      this.vehicle.setWheelSteering(i, steering);
    }
    // Aerodynamic drag and downforce expressed in SI units, independent of render FPS.
    const drag = .42 * speed;
    this.rigidBody.applyImpulse({ x: -v.x * drag * delta, y: 0, z: -v.z * drag * delta }, true);
    if (this.grounded) this.rigidBody.applyImpulse({ x: 0, y: -.65 * speed * speed * delta, z: 0 }, true);
    // Preserve the game's optional jump action; normal driving uses physical suspension.
    if (this.application.controls.consumeJump() && this.grounded && this.jumpCooldown <= 0) {
      this.rigidBody.applyImpulse({ x: 0, y: this.mass * this.handling.jumpImpulse, z: 0 }, true);
      this.jumpCooldown = .6;
    }
    this.vehicle.updateVehicle(delta, undefined, undefined,
      (candidate) => candidate.parent()?.handle !== this.rigidBody.handle);
    this.brakeMaterials.forEach((material) => { material.emissiveIntensity = braking ? 3 : .7; });
    this.jumpCooldown = Math.max(0, this.jumpCooldown - delta);
    this.crashCooldown = Math.max(0, this.crashCooldown - delta);
    if (this.rigidBody.translation().y < -15) this.recover();
  }

  afterPhysics() {
    const p = this.rigidBody.translation(), q = this.rigidBody.rotation(), v = this.rigidBody.linvel();
    this.position.set(p.x, p.y, p.z);
    this.group.position.copy(this.position);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    this.forward.set(0, 0, -1).applyQuaternion(this.group.quaternion).setY(0).normalize();
    this.velocity.set(v.x, v.y, v.z);
    this.speed = Math.hypot(v.x, v.z);
    this.speedNormalized = THREE.MathUtils.clamp(this.speed / this.handling.topSpeed, 0, 1);
    this.grounded = this.getWheelContactCount() > 0;
    this.wheelHolders.forEach((holder, i) => {
      holder.position.y = this.connections[i].y - (this.vehicle.wheelSuspensionLength(i) ?? this.suspensionRestLength);
      holder.rotation.y = this.vehicle.wheelSteering(i) ?? 0;
      holder.children[0].rotation.x = this.vehicle.wheelRotation(i) ?? 0;
    });
    const drop = this.lastHorizontalSpeed - this.speed;
    if (drop > 4.5 && this.crashCooldown <= 0) {
      this.application.triggerCrash(drop);
      this.crashCooldown = .45;
    }
    this.lastHorizontalSpeed = this.speed;
  }

  recover() {
    const p = this.rigidBody.translation();
    this.rigidBody.setTranslation({ x: p.x, y: Math.max(1.2, p.y + 1), z: p.z }, true);
    const yaw = Math.atan2(-this.forward.x, -this.forward.z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.rigidBody.setRotation(q, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.engineForce = 0;
    this.steerValue = 0;
    this.lastHorizontalSpeed = 0;
  }

  destroy() {
    const { physics, scene } = this.application;
    scene.remove(this.group);
    physics.world.removeVehicleController(this.vehicle);
    physics.world.removeRigidBody(this.rigidBody);
  }

  getWheelContactCount() {
    let count = 0;
    for (let i = 0; i < 4; i++) if (this.vehicle.wheelIsInContact(i)) count++;
    return count;
  }
}
