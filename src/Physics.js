import RAPIER from '@dimforge/rapier3d-compat';

export default class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -14, z: 0 });
    this.fixedTimeStep = 1 / 60;
    this.accumulator = 0;

    this.world.integrationParameters.dt = this.fixedTimeStep;
  }

  createBox({
    position,
    size,
    type = 'fixed',
    rotation = null,
    canSleep = true,
    restitution = 0.04,
    friction = 1.3,
    density = 1
  }) {
    const bodyDesc =
      type === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();

    bodyDesc.setTranslation(position.x, position.y, position.z);
    bodyDesc.setCanSleep(canSleep);

    if (rotation) {
      bodyDesc.setRotation(rotation);
    }

    const rigidBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    colliderDesc.setRestitution(restitution);
    colliderDesc.setFriction(friction);
    colliderDesc.setDensity(density);

    const collider = this.world.createCollider(colliderDesc, rigidBody);
    return { rigidBody, collider };
  }

  createCylinder({
    position,
    radius,
    height,
    type = 'fixed',
    canSleep = true,
    restitution = 0.04,
    friction = 1.2
  }) {
    const bodyDesc =
      type === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();

    bodyDesc.setTranslation(position.x, position.y, position.z);
    bodyDesc.setCanSleep(canSleep);

    const rigidBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cylinder(height * 0.5, radius);
    colliderDesc.setRestitution(restitution);
    colliderDesc.setFriction(friction);

    const collider = this.world.createCollider(colliderDesc, rigidBody);
    return { rigidBody, collider };
  }

  update(delta) {
    this.accumulator += delta;

    while (this.accumulator >= this.fixedTimeStep) {
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
    }
  }
}
