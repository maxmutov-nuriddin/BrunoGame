import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLES, findVehicle } from '../../shared/vehicles.ts';
import { flatTestbed, input } from './helpers.ts';

const KMH = 3.6;

async function measure(id: string) {
  const bed = await flatTestbed(findVehicle(id));
  bed.run(1, input());
  const zeroTo60 = bed.run(20, input({ throttle: 1 }), () => bed.car.speed * KMH >= 60);
  const zeroTo100 = zeroTo60 + bed.run(20, input({ throttle: 1 }), () => bed.car.speed * KMH >= 100);
  bed.run(20, input({ throttle: 1 }));
  const topSpeed = bed.car.speed;
  const start = bed.car.body.translation();
  const brakeTime = bed.run(10, input({ throttle: -1 }), () => bed.car.forwardSpeed < 0.5);
  const end = bed.car.body.translation();
  const brakeDistance = Math.hypot(end.x - start.x, end.z - start.z);
  bed.dispose();
  return { zeroTo60, zeroTo100, topSpeed, brakeTime, brakeDistance };
}

test('every car settles on four wheels and stays still when frozen', async () => {
  for (const vehicle of VEHICLES) {
    const bed = await flatTestbed(vehicle);
    bed.rules.frozen = true;
    bed.run(2, input({ throttle: 1, nitro: true }));
    assert.equal(bed.car.wheelContacts(), 4, `${vehicle.id} wheels`);
    assert.ok(bed.car.speed < 0.2, `${vehicle.id} must not creep while frozen`);
    bed.dispose();
  }
});

test('cars accelerate, reach a distinct top speed and brake', async () => {
  const results = new Map<string, Awaited<ReturnType<typeof measure>>>();
  for (const vehicle of VEHICLES) {
    const r = await measure(vehicle.id);
    results.set(vehicle.id, r);
    assert.ok(r.zeroTo100 < 12, `${vehicle.id} 0-100 ${r.zeroTo100.toFixed(2)}s`);
    assert.ok(Math.abs(r.topSpeed - vehicle.handling.maxSpeed) < 4, `${vehicle.id} top ${r.topSpeed.toFixed(1)}`);
    assert.ok(r.brakeDistance < 120, `${vehicle.id} brake ${r.brakeDistance.toFixed(1)}m`);
  }
  const nova = results.get('nova-coupe')!;
  const pixel = results.get('pixel-hatch')!;
  const atlas = results.get('atlas-hauler')!;
  assert.ok(nova.topSpeed > atlas.topSpeed + 4, 'Nova is the fastest at the top end');
  assert.ok(pixel.zeroTo60 < nova.zeroTo60, `Pixel launches harder than Nova (${pixel.zeroTo60.toFixed(2)} vs ${nova.zeroTo60.toFixed(2)})`);
  console.table([...results].map(([id, r]) => ({ id, '0-60 s': r.zeroTo60.toFixed(2), '0-100 s': r.zeroTo100.toFixed(2), 'top km/h': (r.topSpeed * KMH).toFixed(0), 'brake m': r.brakeDistance.toFixed(1) })));
});

test('reverse works only after stopping', async () => {
  const bed = await flatTestbed(findVehicle('bruno-gt'));
  bed.run(1, input());
  bed.run(3, input({ throttle: -1 }));
  assert.ok(bed.car.forwardSpeed < -3, `reversing at ${bed.car.forwardSpeed.toFixed(1)}`);
  bed.dispose();
});

test('steering turns the car, less sharply at speed', async () => {
  const bed = await flatTestbed(findVehicle('bruno-gt'));
  bed.run(1, input());
  bed.run(3, input({ throttle: 0.5 }));
  bed.run(1.5, input({ throttle: 0.5, steer: 1 }));
  const yawRateSlow = Math.abs(bed.car.body.angvel().y);
  assert.ok(yawRateSlow > 0.3, `turns left at low speed (${yawRateSlow.toFixed(2)} rad/s)`);
  assert.ok(bed.car.body.translation().x < -1, 'positive steer goes left (-X when facing -Z)');
  bed.dispose();
});

test('nitro drains, adds speed and stops at zero', async () => {
  const bed = await flatTestbed(findVehicle('bruno-gt'));
  bed.run(1, input());
  bed.run(15, input({ throttle: 1 }));
  const cruise = bed.car.speed;
  bed.car.addNitro(100);
  bed.run(2, input({ throttle: 1, nitro: true }));
  assert.ok(bed.car.nitroActive, 'nitro engages');
  assert.ok(bed.car.speed > cruise + 2, `nitro adds speed (${cruise.toFixed(1)} -> ${bed.car.speed.toFixed(1)})`);
  bed.run(6, input({ throttle: 1, nitro: true }));
  assert.equal(bed.car.nitro, 0, 'energy runs out');
  assert.equal(bed.car.nitroActive, false, 'nitro stops when empty');
  bed.car.addNitro(5);
  bed.run(0.5, input({ throttle: 1, nitro: true }));
  assert.equal(bed.car.nitroActive, false, 'cannot start below the minimum charge');
  bed.dispose();
});

test('handbrake at speed starts a controllable drift; standing still never drifts', async () => {
  const bed = await flatTestbed(findVehicle('bruno-gt'));
  bed.run(1, input());
  bed.run(0.5, input({ handbrake: true, steer: 1 }));
  assert.equal(bed.car.drifting, false, 'no drift at standstill');
  bed.run(8, input({ throttle: 1 }));
  let eligibleSteps = 0;
  let maxSlip = 0;
  bed.run(1.5, input({ throttle: 1, handbrake: true, steer: 1 }), () => {
    if (bed.car.driftRewardEligible) eligibleSteps++;
    maxSlip = Math.max(maxSlip, Math.abs(bed.car.slipAngle));
    return false;
  });
  assert.equal(bed.car.drifting, true, 'drifting');
  assert.ok(maxSlip > 0.15, `slides (${(maxSlip * 57.3).toFixed(0)} deg)`);
  assert.ok(eligibleSteps > 20, 'drift qualifies for reward');
  bed.run(3, input({ throttle: 1 }));
  assert.equal(bed.car.drifting, false, 'releasing the handbrake and straightening exits the drift');
  assert.ok(bed.car.speed > 10, 'keeps speed through the drift');
  bed.dispose();
});

test('jump only when allowed', async () => {
  const bed = await flatTestbed(findVehicle('dune-jumper'));
  bed.run(1, input());
  bed.run(0.2, input({ jump: true }));
  assert.ok(bed.car.body.translation().y < 1.2, 'race rules block the jump');
  bed.rules.allowJump = true;
  bed.run(0.05, input());
  bed.run(0.3, input({ jump: true }));
  assert.ok(bed.car.body.translation().y > 1.2, 'free roam allows the jump');
  bed.dispose();
});

test('wall hits slow the car by angle: glancing keeps most speed, head-on stops', async () => {
  const WALL_Z = -60;
  const APPROACH_SPEED = 30;
  const speedAfterHit = async (angleToWallDeg: number) => {
    const bed = await flatTestbed(findVehicle('bruno-gt'));
    bed.physics.createBox({ position: { x: 0, y: 1, z: WALL_Z }, size: { x: 400, y: 2, z: 1 }, friction: 0.6 });
    bed.car.teleport({ x: 0, y: 0.9, z: WALL_Z + 5 }, ((90 - angleToWallDeg) * Math.PI) / 180, APPROACH_SPEED);
    bed.run(1.5, input({ throttle: 1 }));
    const speed = bed.car.speed;
    bed.dispose();
    return speed;
  };
  const shallow = await speedAfterHit(15);
  const medium = await speedAfterHit(45);
  const headOn = await speedAfterHit(90);
  assert.ok(shallow > APPROACH_SPEED * 0.85, `15° scrape keeps speed (${shallow.toFixed(1)} m/s)`);
  assert.ok(medium > APPROACH_SPEED * 0.75 && medium < shallow, `45° hit costs more (${medium.toFixed(1)} m/s)`);
  assert.ok(headOn < 3, `head-on stops the car (${headOn.toFixed(1)} m/s)`);
});

test('every car in the roster has a GLB that passes the vehicle contract', async () => {
  const { execFileSync } = await import('node:child_process');
  const files = VEHICLES.map((v) => `public/models/${v.file}`);
  const output = execFileSync(process.execPath, ['scripts/check-vehicle.mjs', ...files], { encoding: 'utf8' });
  assert.equal((output.match(/^PASS /gm) ?? []).length, VEHICLES.length, output);
  assert.equal(new Set(VEHICLES.map((v) => v.id)).size, VEHICLES.length, 'ids are unique');
});
