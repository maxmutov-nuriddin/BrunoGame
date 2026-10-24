import { test } from 'node:test';
import assert from 'node:assert/strict';
import RaceSimulation, { type RaceConfig } from '../../shared/race/RaceSimulation.ts';
import { BotDriver } from '../../shared/race/bot.ts';
import { generateTrack, buildFallbackTrack } from '../../shared/track/generator.ts';
import { validateTrack } from '../../shared/track/validate.ts';
import { GENERATOR_VERSION } from '../../shared/constants.ts';
import { NEUTRAL_INPUT, type DriveInput } from '../../shared/input.ts';
import { RULES } from '../../shared/race/rules.ts';
import { WEAPON, ITEMS } from '../../shared/race/items.ts';
import { VEHICLES } from '../../shared/vehicles.ts';
import { trackFingerprint } from '../../shared/track/fingerprint.ts';

const track = generateTrack('TEST-TRACK').track;

function config(overrides: Partial<RaceConfig> = {}): RaceConfig {
  return {
    track,
    laps: 1,
    mode: 'race',
    itemsEnabled: false,
    seed: 'TEST',
    participants: [{ id: 'p1', name: 'Player', vehicleId: 'bruno-gt', kind: 'human' }],
    ...overrides
  };
}

/** Drive a human car with the bot brain, through the same setInput path a network client uses. */
function autopilot(sim: RaceSimulation, id: string) {
  const car = sim.carsById.get(id)!;
  const brain = new BotDriver(sim, car, `${id}-autopilot`);
  return () => {
    const input = sim.phase === 'racing' ? brain.update() : NEUTRAL_INPUT;
    car.prevInput = input;
    sim.setInput(id, input);
  };
}

function runUntil(sim: RaceSimulation, done: () => boolean, maxTicks: number, beforeStep: () => void = () => {}) {
  for (let i = 0; i < maxTicks && !done(); i++) {
    beforeStep();
    sim.step();
  }
}

const skipToGo = (sim: RaceSimulation, input: DriveInput = NEUTRAL_INPUT) =>
  runUntil(sim, () => sim.phase === 'racing', sim.goTick + 2, () => sim.setInput('p1', input));

test('same seed and generator version give an identical track; different seeds differ', () => {
  const a = generateTrack('SAME-SEED').track;
  const b = generateTrack('SAME-SEED').track;
  const c = generateTrack('OTHER-SEED').track;
  assert.equal(a.generatorVersion, GENERATOR_VERSION);
  assert.equal(trackFingerprint(a), trackFingerprint(b));
  assert.deepEqual(a.checkpoints, b.checkpoints);
  assert.deepEqual(a.pickups, b.pickups);
  assert.notEqual(trackFingerprint(a), trackFingerprint(c));
});

test('generated tracks are valid across many seeds and the fallback is valid', () => {
  for (let i = 0; i < 150; i++) {
    const { track: t } = generateTrack(`VALID-${i}`);
    assert.deepEqual(validateTrack(t), [], `seed VALID-${i}`);
  }
  assert.deepEqual(validateTrack(buildFallbackTrack('FB', 'Fallback')), []);
});

test('cars cannot move before GO', async () => {
  const sim = await RaceSimulation.create(config());
  const start = sim.carsById.get('p1')!.physics.body.translation();
  runUntil(sim, () => sim.tick >= sim.goTick - 1, 10_000, () => sim.setInput('p1', { ...NEUTRAL_INPUT, throttle: 1, nitro: true }));
  const end = sim.carsById.get('p1')!.physics.body.translation();
  assert.ok(Math.hypot(end.x - start.x, end.z - start.z) < 0.15, 'held on the grid');
  sim.dispose();
});

test('a perfectly timed launch boosts, an early press bogs', async () => {
  for (const [lead, expected] of [[Math.round(RULES.launchWindowStart * 0.6), 'perfect'], [RULES.launchTooEarly + 30, 'bogged']] as const) {
    const sim = await RaceSimulation.create(config());
    const events: string[] = [];
    runUntil(sim, () => sim.tick > sim.goTick + 5, 10_000, () => {
      const pressed = sim.tick >= sim.goTick - lead;
      sim.setInput('p1', { ...NEUTRAL_INPUT, throttle: pressed ? 1 : 0 });
      for (const e of sim.events) if (e.t === 'launch') events.push(e.quality);
    });
    assert.deepEqual(events, [expected]);
    sim.dispose();
  }
});

test('a forged early press timestamp is clamped to a few ticks before its arrival', async () => {
  const sim = await RaceSimulation.create(config());
  const car = sim.carsById.get('p1')!;
  runUntil(sim, () => sim.tick >= sim.goTick - 30, 10_000, () => sim.setInput('p1', NEUTRAL_INPUT));
  const arrival = sim.tick;
  sim.setInput('p1', { ...NEUTRAL_INPUT, throttle: 1 }, arrival - 25, arrival);
  assert.equal(car.throttlePressTick, arrival - 4, 'claim limited to 4 ticks of latency compensation');
  sim.setInput('p1', NEUTRAL_INPUT);
  sim.setInput('p1', { ...NEUTRAL_INPUT, throttle: 1 }, arrival + 50, arrival);
  assert.equal(car.throttlePressTick, arrival, 'a claim in the future is pulled back to the arrival tick');
  sim.dispose();
});

test('checkpoints count only in order; crossing the line backwards gives no lap', async () => {
  const sim = await RaceSimulation.create(config({ laps: 2 }));
  const car = sim.carsById.get('p1')!;
  skipToGo(sim);
  // Reverse back over the start line: no lap, wrong-way warning.
  let wrongWay = false;
  runUntil(sim, () => car.progress < -3 || sim.tick > sim.goTick + 600, 600, () => {
    sim.setInput('p1', { ...NEUTRAL_INPUT, throttle: -1 });
    if (car.wrongWay) wrongWay = true;
  });
  assert.equal(car.lapsCompleted, 0);
  assert.equal(car.nextCheckpoint, 1, 'still waiting for checkpoint 1');
  assert.ok(wrongWay, 'wrong-way warning shown');

  // Teleport past checkpoint 3 without passing 1 and 2: nothing counts.
  const later = track.samples[track.checkpoints[3].sample + 3];
  car.physics.teleport({ x: later.x, y: later.y + 1, z: later.z }, Math.atan2(-later.tx, -later.tz), 10);
  car.prevX = later.x;
  car.prevZ = later.z;
  runUntil(sim, () => false, 60, () => sim.setInput('p1', { ...NEUTRAL_INPUT, throttle: 1 }));
  assert.equal(car.nextCheckpoint, 1, 'a cut does not skip checkpoints');
  sim.dispose();
});

test('a human-input car can complete a full race with 7 bots, finishing in rank order', async () => {
  const participants = [
    { id: 'p1', name: 'Player', vehicleId: 'bruno-gt', kind: 'human' as const },
    ...Array.from({ length: 7 }, (_, i) => ({ id: `bot${i}`, name: `Bot ${i}`, vehicleId: VEHICLES[(i + 1) % VEHICLES.length].id, kind: 'bot' as const, difficulty: 'normal' as const }))
  ];
  const sim = await RaceSimulation.create(config({ laps: 2, itemsEnabled: true, participants }));
  const drive = autopilot(sim, 'p1');
  runUntil(sim, () => sim.phase === 'finished', 60 * 60 * 6, drive);
  assert.equal(sim.phase, 'finished');
  const results = sim.results();
  assert.equal(results.length, 8);
  assert.ok(results.find((r) => r.id === 'p1')!.finished, 'player finished');
  const finishers = results.filter((r) => r.finished);
  assert.ok(finishers.length >= 6, `${finishers.length} finishers`);
  for (let i = 1; i < finishers.length; i++) assert.ok(finishers[i].totalTicks >= finishers[i - 1].totalTicks);
  results.forEach((r, i) => assert.equal(r.rank, i + 1));
  sim.dispose();
});

test('manual reset never moves a car forward and has a cooldown', async () => {
  const sim = await RaceSimulation.create(config());
  const car = sim.carsById.get('p1')!;
  skipToGo(sim);
  runUntil(sim, () => false, 60 * 6, () => sim.setInput('p1', { ...NEUTRAL_INPUT, throttle: 1, steer: car.lateral > 0 ? -0.2 : 0.2 }));
  const before = car.progress;
  let respawns = 0;
  runUntil(sim, () => false, 30, () => {
    sim.setInput('p1', { ...NEUTRAL_INPUT, reset: sim.tick % 2 === 0 });
    respawns += sim.events.filter((e) => e.t === 'respawn').length;
  });
  assert.equal(respawns, 1, 'cooldown blocks repeated resets');
  assert.ok(car.progress <= before + 0.5, `reset moved back (${before.toFixed(1)} -> ${car.progress.toFixed(1)})`);
  sim.dispose();
});

test('weapons damage, shields block, wrecks respawn at a checkpoint as a ghost', async () => {
  const participants = [
    { id: 'p1', name: 'A', vehicleId: 'bruno-gt', kind: 'human' as const },
    { id: 'p2', name: 'B', vehicleId: 'bruno-gt', kind: 'human' as const }
  ];
  const sim = await RaceSimulation.create(config({ participants, itemsEnabled: true }));
  const [a, b] = [sim.carsById.get('p1')!, sim.carsById.get('p2')!];
  runUntil(sim, () => sim.phase === 'racing', sim.goTick + 2);

  b.shieldUntil = sim.tick + WEAPON.shieldTicks;
  b.shieldAbsorb = WEAPON.shieldAbsorb;
  a.item = 'shock';
  a.itemReadyTick = 0;
  const pa = a.physics.body.translation();
  b.physics.teleport({ x: pa.x + 3, y: pa.y, z: pa.z }, a.physics.body.rotation().y, 0);
  sim.setInput('p1', { ...NEUTRAL_INPUT, useItem: true });
  sim.step();
  const blocked = sim.events.find((e) => e.t === 'hit' && e.car === 'p2');
  assert.ok(blocked && blocked.t === 'hit' && blocked.blocked, 'shield absorbs the shock');
  assert.equal(b.health, b.maxHealth);

  b.shieldUntil = 0;
  sim.damage(b, b.health - 1, 'p1', 'pulse');
  const lastCheckpoint = b.lastCheckpoint;
  sim.damage(b, ITEMS.pulse.damage, 'p1', 'pulse');
  assert.ok(b.isWrecked(sim.tick), 'health 0 wrecks the car');
  runUntil(sim, () => !b.isWrecked(sim.tick) && b.physics.ghost && sim.events.some((e) => e.t === 'respawn'), RULES.wreckTicks + 5);
  assert.equal(b.lastCheckpoint, lastCheckpoint);
  assert.ok(b.physics.ghost, 'respawned car is a ghost');
  assert.equal(b.health, b.maxHealth, 'health restored after a wreck');
  sim.dispose();
});

test('two cars reaching one item box on the same tick: exactly one gets it', async () => {
  const participants = [
    { id: 'p1', name: 'A', vehicleId: 'bruno-gt', kind: 'human' as const },
    { id: 'p2', name: 'B', vehicleId: 'pixel-hatch', kind: 'human' as const }
  ];
  const sim = await RaceSimulation.create(config({ participants, itemsEnabled: true }));
  runUntil(sim, () => sim.phase === 'racing', sim.goTick + 2);
  const spot = track.pickups[0];
  const sample = track.samples[spot.sample];
  const yaw = Math.atan2(-sample.tx, -sample.tz);
  sim.carsById.get('p1')!.physics.teleport({ x: spot.x + 0.4, y: spot.y - 0.4, z: spot.z }, yaw, 0);
  sim.carsById.get('p2')!.physics.teleport({ x: spot.x - 0.4, y: spot.y - 0.4, z: spot.z }, yaw, 0);
  sim.step();
  const pickups = sim.events.filter((e) => e.t === 'pickup' && e.pickup === spot.id);
  assert.equal(pickups.length, 1);
  assert.equal(sim.pickups[spot.id].available, false);
  sim.dispose();
});

test('drift reward needs real progress and is capped per drift', async () => {
  const sim = await RaceSimulation.create(config());
  const car = sim.carsById.get('p1')!;
  skipToGo(sim);
  car.physics.drifting = true;
  car.physics.driftTime = 0;
  car.physics.driftCharge = RULES.driftRewardCap;
  const before = car.physics.nitro;
  sim.step();
  assert.equal(car.physics.nitro, before, 'no reward beyond the cap');
  sim.dispose();
});

test('after the first finisher, the rest get a grace period then DNF', async () => {
  const participants = [
    { id: 'p1', name: 'A', vehicleId: 'bruno-gt', kind: 'human' as const },
    { id: 'p2', name: 'B', vehicleId: 'bruno-gt', kind: 'human' as const }
  ];
  const sim = await RaceSimulation.create(config({ participants }));
  const drive = autopilot(sim, 'p1');
  runUntil(sim, () => sim.phase === 'finished', 60 * 60 * 4, () => {
    drive();
    sim.setInput('p2', NEUTRAL_INPUT);
  });
  const [first, second] = sim.results();
  assert.equal(first.id, 'p1');
  assert.ok(first.finished);
  assert.ok(second.dnf, 'idle car is DNF');
  assert.equal(sim.tick - (sim.carsById.get('p1')!.finishTick), RULES.finishGraceTicks + 1);
  sim.dispose();
});

test('a car slammed sideways into a barrier at 60 m/s does not tunnel through', async () => {
  const sim = await RaceSimulation.create(config());
  const car = sim.carsById.get('p1')!;
  skipToGo(sim);
  const s = track.samples[track.checkpoints[2].sample];
  car.physics.teleport({ x: s.x, y: s.y + 0.9, z: s.z }, Math.atan2(-s.tx, -s.tz), 0);
  car.physics.body.setLinvel({ x: s.nx * 60, y: 0, z: s.nz * 60 }, true);
  for (let i = 0; i < 60; i++) {
    sim.setInput('p1', NEUTRAL_INPUT);
    sim.step();
  }
  const p = car.physics.body.translation();
  const lateral = (p.x - s.x) * s.nx + (p.z - s.z) * s.nz;
  assert.ok(Math.abs(lateral) < track.width / 2 + 0.5, `stayed inside (${lateral.toFixed(2)}m)`);
  sim.dispose();
});
