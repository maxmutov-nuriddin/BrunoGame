import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import { FIXED_DT } from '../constants.ts';
import { RAPIER, STATIC_GROUPS, loadRapier } from './rapier.ts';

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

interface BodyOptions {
  position: Vec3;
  type?: 'fixed' | 'dynamic' | 'kinematic';
  rotation?: Quat | null;
  colliderOffset?: Vec3 | null;
  canSleep?: boolean;
  restitution?: number;
  friction?: number;
  density?: number;
  contactSkin?: number;
  groups?: number;
}

export interface BoxOptions extends BodyOptions { size: Vec3 }
export interface CylinderOptions extends BodyOptions { radius: number; height: number }
export interface HullOptions extends BodyOptions { points: Float32Array | number[] }

/** Thin wrapper over a Rapier world with a fixed 60 Hz step that is independent of render rate. */
export default class PhysicsWorld {
  readonly RAPIER = RAPIER;
  readonly world: World;
  readonly fixedTimeStep = FIXED_DT;
  private accumulator = 0;

  static async create(): Promise<PhysicsWorld> {
    await loadRapier();
    return new PhysicsWorld();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.dt = this.fixedTimeStep;
  }

  private createBody({ position, type = 'fixed', rotation = null, canSleep = true }: BodyOptions): RigidBody {
    const desc =
      type === 'dynamic'
        ? RAPIER.RigidBodyDesc.dynamic()
        : type === 'kinematic'
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(position.x, position.y, position.z);
    desc.setCanSleep(canSleep);
    if (rotation) desc.setRotation(rotation);
    return this.world.createRigidBody(desc);
  }

  private attach(desc: InstanceType<typeof RAPIER.ColliderDesc>, body: RigidBody, options: BodyOptions): Collider {
    const { restitution = 0.04, friction = 1.3, density = 1, colliderOffset = null, contactSkin = 0 } = options;
    desc.setRestitution(restitution);
    desc.setFriction(friction);
    desc.setDensity(density);
    desc.setCollisionGroups(options.groups ?? (options.type === 'fixed' || !options.type ? STATIC_GROUPS : 0xffffffff));
    if (colliderOffset) desc.setTranslation(colliderOffset.x, colliderOffset.y, colliderOffset.z);
    if (contactSkin > 0) desc.setContactSkin(contactSkin);
    return this.world.createCollider(desc, body);
  }

  createBox(options: BoxOptions) {
    const rigidBody = this.createBody(options);
    const { size } = options;
    const collider = this.attach(RAPIER.ColliderDesc.cuboid(size.x * 0.5, size.y * 0.5, size.z * 0.5), rigidBody, options);
    return { rigidBody, collider };
  }

  createCylinder(options: CylinderOptions) {
    const rigidBody = this.createBody(options);
    const collider = this.attach(RAPIER.ColliderDesc.cylinder(options.height * 0.5, options.radius), rigidBody, options);
    return { rigidBody, collider };
  }

  createConvexHull(options: HullOptions) {
    const rigidBody = this.createBody(options);
    const points = options.points instanceof Float32Array ? options.points : new Float32Array(options.points);
    const desc = RAPIER.ColliderDesc.convexHull(points);
    if (!desc) throw new Error('Failed to build convex hull collider.');
    const collider = this.attach(desc, rigidBody, options);
    return { rigidBody, collider };
  }

  createTrimesh(options: BodyOptions & { vertices: Float32Array; indices: Uint32Array }) {
    const rigidBody = this.createBody(options);
    const collider = this.attach(RAPIER.ColliderDesc.trimesh(options.vertices, options.indices), rigidBody, options);
    return { rigidBody, collider };
  }

  /** Advance in fixed steps; `beforeStep` runs once per step with the fixed dt. Returns steps taken. */
  update(delta: number, beforeStep: (dt: number) => void = () => {}): number {
    this.accumulator += Math.min(delta, 0.1);
    let steps = 0;
    while (this.accumulator >= this.fixedTimeStep) {
      beforeStep(this.fixedTimeStep);
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
      steps += 1;
    }
    return steps;
  }

  step(beforeStep: (dt: number) => void = () => {}): void {
    beforeStep(this.fixedTimeStep);
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
