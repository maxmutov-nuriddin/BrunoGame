import PhysicsWorld from '../../shared/physics/PhysicsWorld.ts';
import VehiclePhysics from '../../shared/physics/VehiclePhysics.ts';
import { NEUTRAL_INPUT, type DriveInput } from '../../shared/input.ts';
import type { VehicleDefinition } from '../../shared/vehicles.ts';

export const input = (overrides: Partial<DriveInput> = {}): DriveInput => ({ ...NEUTRAL_INPUT, ...overrides });

export async function flatTestbed(definition: VehicleDefinition) {
  const physics = await PhysicsWorld.create();
  physics.createBox({ position: { x: 0, y: -0.5, z: 0 }, size: { x: 4000, y: 1, z: 4000 }, friction: 1.8 });
  const car = new VehiclePhysics(physics, definition, { position: { x: 0, y: 0.9, z: 0 }, yaw: 0 });
  const rules = { frozen: false, allowJump: false };
  const run = (seconds: number, drive: DriveInput | ((t: number) => DriveInput), until?: () => boolean) => {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) {
      const command = typeof drive === 'function' ? drive(i / 60) : drive;
      car.step(command, physics.fixedTimeStep, rules);
      physics.world.step();
      car.afterStep();
      if (until?.()) return (i + 1) / 60;
    }
    return seconds;
  };
  return { physics, car, rules, run, dispose: () => physics.dispose() };
}
