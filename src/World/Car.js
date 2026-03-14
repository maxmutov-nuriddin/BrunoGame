import * as THREE from 'three';

export default class Car {
  constructor(application) {
    this.application = application;
    this.group = new THREE.Group();
    this.group.name = 'Car';
    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.speedNormalized = 0;
    this.grounded = true;
    this.crashCooldown = 0;
    this.jumpCooldown = 0;
    this.lastHorizontalSpeed = 0;
    this.engineForce = 0;
    this.brakeForce = 0;
    this.steerValue = 0;
    this.visualPitch = 0;
    this.suspensionRestLength = 0.18;
    this.wheelRadius = 0.34;

    const { rigidBody, collider } = this.application.physics.createBox({
      position: new THREE.Vector3(0, 0.68, 0),
      size: new THREE.Vector3(1.7, 0.7, 3.2),
      type: 'dynamic',
      canSleep: false,
      friction: 1.8,
      restitution: 0,
      density: 1.1
    });

    this.rigidBody = rigidBody;
    this.collider = collider;
    this.rigidBody.setEnabledRotations(false, true, false, true);
    this.rigidBody.setLinearDamping(0.16);
    this.rigidBody.setAngularDamping(1.2);
    this.rigidBody.setAdditionalSolverIterations(6);
    this.rigidBody.setGravityScale(1.28, true);

    if (typeof this.rigidBody.setCcdEnabled === 'function') {
      this.rigidBody.setCcdEnabled(true);
    }

    this.vehicle = this.application.physics.world.createVehicleController(this.rigidBody);
    this.vehicle.indexUpAxis = 1;
    try {
      this.vehicle.indexForwardAxis = 2;
    } catch (error) {
      void error;
    }

    try {
      if ('setIndexForwardAxis' in this.vehicle) {
        this.vehicle.setIndexForwardAxis = 2;
      }
    } catch (error) {
      void error;
    }

    this.createVisuals();
    this.setupVehicle();
    this.application.scene.add(this.group);
  }

  moveTowards(current, target, maxDelta) {
    if (current < target) {
      return Math.min(current + maxDelta, target);
    }

    if (current > target) {
      return Math.max(current - maxDelta, target);
    }

    return target;
  }

  hasDrivingInput() {
    const { throttle, steer, boost, brake } = this.application.controls.input;
    return throttle !== 0 || steer !== 0 || boost || brake;
  }

  stabilizeIdle(horizontalSpeed) {
    if (this.hasDrivingInput() || !this.grounded || horizontalSpeed > 0.2) {
      return;
    }

    const linvel = this.rigidBody.linvel();
    const angvel = this.rigidBody.angvel();

    this.rigidBody.setLinvel({ x: 0, y: linvel.y, z: 0 }, true);
    this.rigidBody.setAngvel({ x: angvel.x, y: 0, z: angvel.z }, true);
    this.engineForce = 0;
    this.brakeForce = Math.max(this.brakeForce, 1.8);
    this.steerValue = THREE.MathUtils.damp(this.steerValue, 0, 14, 1 / 60);
  }

  stabilizeStraightLine(delta, throttle, steer) {
    if (!this.grounded || throttle === 0 || Math.abs(steer) > 0.001) {
      return;
    }

    const angvel = this.rigidBody.angvel();
    const correctedYaw = THREE.MathUtils.damp(angvel.y, 0, 7.5, delta);
    this.rigidBody.setAngvel({ x: angvel.x, y: correctedYaw, z: angvel.z }, true);
    this.steerValue = THREE.MathUtils.damp(this.steerValue, 0, 10.5, delta);
  }

  createVisuals() {
    const matcap = this.application.resources.items.matcap;
    this.visualRoot = new THREE.Group();
    this.group.add(this.visualRoot);

    const chassisMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#b7bec8' });
    const trimMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#707887' });
    const tireMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#1b2131' });
    const glassMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#9cdcff' });
    const accentMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#ff934f' });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.46, 3.34), chassisMaterial);
    chassis.position.y = 0.2;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.visualRoot.add(chassis);

    const underBody = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.18, 2.92), trimMaterial);
    underBody.position.y = -0.02;
    underBody.castShadow = true;
    underBody.receiveShadow = true;
    this.visualRoot.add(underBody);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.34, 1.34), chassisMaterial);
    bed.position.set(0, 0.44, 0.82);
    bed.castShadow = true;
    bed.receiveShadow = true;
    this.visualRoot.add(bed);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.16, 1.02), chassisMaterial);
    hood.position.set(0, 0.56, -0.92);
    hood.rotation.x = 0.18;
    hood.castShadow = true;
    hood.receiveShadow = true;
    this.visualRoot.add(hood);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.13, 1.42), chassisMaterial);
    roof.position.set(0, 0.98, -0.24);
    roof.rotation.x = 0.36;
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.visualRoot.add(roof);

    const rearSlope = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.12, 0.92), chassisMaterial);
    rearSlope.position.set(0, 0.86, 0.46);
    rearSlope.rotation.x = -0.52;
    rearSlope.castShadow = true;
    rearSlope.receiveShadow = true;
    this.visualRoot.add(rearSlope);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.08, 1.06), glassMaterial);
    windshield.position.set(0, 0.9, -0.2);
    windshield.rotation.x = 0.36;
    windshield.castShadow = true;
    windshield.receiveShadow = true;
    this.visualRoot.add(windshield);

    const sidePanels = [
      { x: -0.88, y: 0.14, z: -0.96, size: [0.2, 0.34, 0.86] },
      { x: 0.88, y: 0.14, z: -0.96, size: [0.2, 0.34, 0.86] },
      { x: -0.88, y: 0.14, z: 1.02, size: [0.2, 0.34, 0.86] },
      { x: 0.88, y: 0.14, z: 1.02, size: [0.2, 0.34, 0.86] }
    ];

    sidePanels.forEach(({ x, y, z, size }) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(...size), trimMaterial);
      panel.position.set(x, y, z);
      panel.castShadow = true;
      panel.receiveShadow = true;
      this.visualRoot.add(panel);
    });

    const frontLight = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.05, 0.08), accentMaterial);
    frontLight.position.set(0, 0.48, -1.64);
    frontLight.castShadow = true;
    this.visualRoot.add(frontLight);

    const rearLight = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.08), accentMaterial);
    rearLight.position.set(0, 0.52, 1.66);
    rearLight.castShadow = true;
    this.visualRoot.add(rearLight);

    this.wheelHolders = [];
    const wheelGeometry = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.25, 18);
    wheelGeometry.rotateZ(Math.PI * 0.5);

    const wheelAnchors = [
      { x: -0.92, y: -0.38, z: -0.98 },
      { x: 0.92, y: -0.38, z: -0.98 },
      { x: -0.92, y: -0.38, z: 1.02 },
      { x: 0.92, y: -0.38, z: 1.02 }
    ];

    wheelAnchors.forEach((anchor) => {
      const holder = new THREE.Group();
      const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
      holder.position.set(anchor.x, anchor.y, anchor.z);
      holder.userData.baseY = anchor.y;
      wheel.castShadow = true;
      holder.add(wheel);
      this.visualRoot.add(holder);
      this.wheelHolders.push(holder);
    });

    this.frontWheelPivotLeft = this.wheelHolders[0];
    this.frontWheelPivotRight = this.wheelHolders[1];
    this.rearWheelLeft = this.wheelHolders[2];
    this.rearWheelRight = this.wheelHolders[3];

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 28),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16 })
    );
    shadow.rotation.x = -Math.PI * 0.5;
    shadow.position.y = -0.42;
    this.group.add(shadow);
  }

  getAverageSuspension(indices) {
    let total = 0;
    let count = 0;

    indices.forEach((index) => {
      if (!this.vehicle.wheelIsInContact(index)) {
        return;
      }

      total += this.vehicle.wheelSuspensionLength(index) ?? this.suspensionRestLength;
      count += 1;
    });

    return count > 0 ? total / count : this.suspensionRestLength;
  }

  setupVehicle() {
    const direction = { x: 0, y: -1, z: 0 };
    const axle = { x: -1, y: 0, z: 0 };
    const wheelConnections = [
      { x: -0.92, y: -0.08, z: -1.02 },
      { x: 0.92, y: -0.08, z: -1.02 },
      { x: -0.92, y: -0.08, z: 1.02 },
      { x: 0.92, y: -0.08, z: 1.02 }
    ];

    wheelConnections.forEach((connection) => {
      this.vehicle.addWheel(
        connection,
        direction,
        axle,
        this.suspensionRestLength,
        this.wheelRadius
      );
    });

    this.frontWheelIndices = [0, 1];
    this.rearWheelIndices = [2, 3];

    for (let i = 0; i < this.vehicle.numWheels(); i += 1) {
      this.vehicle.setWheelSuspensionStiffness(i, 23);
      this.vehicle.setWheelSuspensionCompression(i, 3.1);
      this.vehicle.setWheelSuspensionRelaxation(i, 4.1);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.28);
      this.vehicle.setWheelMaxSuspensionForce(i, 180);
      this.vehicle.setWheelFrictionSlip(i, 5.1);
      this.vehicle.setWheelSideFrictionStiffness(i, 8);
    }

    this.frontWheelIndices.forEach((index) => {
      this.vehicle.setWheelFrictionSlip(index, 4.7);
      this.vehicle.setWheelSideFrictionStiffness(index, 8.4);
    });

    this.rigidBody.wakeUp();
  }

  beforePhysics(delta) {
    const { throttle, steer, boost, brake } = this.application.controls.input;
    const currentSpeed = this.vehicle.currentVehicleSpeed();
    const speedRatio = THREE.MathUtils.clamp(Math.abs(currentSpeed) / 24, 0, 1);
    const targetEngineForce =
      throttle > 0
        ? -(boost ? 138 : 96) * throttle
        : throttle < 0
          ? (Math.abs(currentSpeed) < 2 ? 88 : 76) * -throttle
          : 0;
    const changingDirection =
      throttle !== 0 &&
      Math.sign(throttle) !== Math.sign(currentSpeed) &&
      Math.abs(currentSpeed) > 2.8;
    const targetBrakeForce =
      brake || changingDirection
        ? 2.6
        : throttle === 0
          ? 1.15
          : 0;
    const steeringLimit = THREE.MathUtils.lerp(0.5, 0.16, speedRatio);
    const steeringResponse = this.grounded ? 7.5 : 2.4;

    this.grounded = this.getWheelContactCount() > 0;
    this.engineForce = this.moveTowards(this.engineForce, targetEngineForce, 180 * delta);
    this.brakeForce = this.moveTowards(
      this.brakeForce,
      targetBrakeForce,
      (throttle !== 0 ? 16 : 8) * delta
    );
    this.steerValue = THREE.MathUtils.damp(
      this.steerValue,
      steer * steeringLimit,
      steeringResponse,
      delta
    );
    this.stabilizeStraightLine(delta, throttle, steer);

    this.frontWheelIndices.forEach((index) => {
      this.vehicle.setWheelSteering(index, this.steerValue);
      this.vehicle.setWheelBrake(index, this.brakeForce);
      this.vehicle.setWheelEngineForce(index, this.engineForce * 0.35);
    });

    this.rearWheelIndices.forEach((index) => {
      this.vehicle.setWheelSteering(index, 0);
      this.vehicle.setWheelBrake(index, this.brakeForce * 0.9);
      this.vehicle.setWheelEngineForce(index, this.engineForce);
    });

    const jumpRequested = this.application.controls.consumeJump();

    if (jumpRequested && this.grounded && this.jumpCooldown <= 0) {
      this.rigidBody.applyImpulse({ x: 0, y: 5.2, z: 0 }, true);
      this.jumpCooldown = 0.45;
    }

    if (this.grounded && !(jumpRequested && this.jumpCooldown > 0.4)) {
      const downforce = 0.08 + Math.abs(currentSpeed) * 0.018;
      this.rigidBody.applyImpulse({ x: 0, y: -downforce, z: 0 }, true);
    }

    this.vehicle.updateVehicle(delta, undefined, undefined, (candidate) => {
      return candidate.handle !== this.collider.handle;
    });

    this.jumpCooldown = Math.max(0, this.jumpCooldown - delta);
    this.crashCooldown = Math.max(0, this.crashCooldown - delta);
  }

  afterPhysics(delta) {
    const translation = this.rigidBody.translation();
    const rotation = this.rigidBody.rotation();

    this.position.set(translation.x, translation.y, translation.z);
    this.group.position.copy(this.position);
    this.group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    this.forward.set(0, 0, -1).applyQuaternion(this.group.quaternion).setY(0).normalize();

    const linvel = this.rigidBody.linvel();
    this.velocity.set(linvel.x, linvel.y, linvel.z);
    this.speed = new THREE.Vector2(linvel.x, linvel.z).length();
    this.speedNormalized = THREE.MathUtils.clamp(this.speed / 24, 0, 1);
    this.grounded = this.getWheelContactCount() > 0;

    this.frontWheelPivotLeft.rotation.y = this.steerValue;
    this.frontWheelPivotRight.rotation.y = this.steerValue;

    this.wheelHolders.forEach((holder, index) => {
      const suspensionLength = this.vehicle.wheelSuspensionLength(index) ?? this.suspensionRestLength;
      const wheelRotation = this.vehicle.wheelRotation(index) ?? 0;
      holder.position.y = holder.userData.baseY - (suspensionLength - this.suspensionRestLength);
      holder.children[0].rotation.x = wheelRotation;
    });

    const frontSuspension = this.getAverageSuspension(this.frontWheelIndices);
    const rearSuspension = this.getAverageSuspension(this.rearWheelIndices);
    const pitchTarget = THREE.MathUtils.clamp((rearSuspension - frontSuspension) * 4.2, -0.32, 0.32);
    this.visualPitch = THREE.MathUtils.damp(
      this.visualPitch,
      this.grounded ? pitchTarget : this.visualPitch * 0.95,
      this.grounded ? 9 : 4,
      delta
    );
    this.visualRoot.rotation.x = this.visualPitch;

    const horizontalSpeed = new THREE.Vector2(linvel.x, linvel.z).length();
    this.stabilizeIdle(horizontalSpeed);
    const speedDrop = this.lastHorizontalSpeed - horizontalSpeed;

    if (speedDrop > 4.5 && this.crashCooldown <= 0) {
      this.application.triggerCrash(speedDrop);
      this.crashCooldown = 0.45;
    }

    this.lastHorizontalSpeed = horizontalSpeed;
  }

  getWheelContactCount() {
    let count = 0;

    for (let i = 0; i < this.vehicle.numWheels(); i += 1) {
      if (this.vehicle.wheelIsInContact(i)) {
        count += 1;
      }
    }

    return count;
  }
}
