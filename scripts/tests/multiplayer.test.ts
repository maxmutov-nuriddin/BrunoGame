import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import HostServer from '../../shared/host/HostServer.ts';
import { setTimeScale } from '../../shared/host/clock.ts';
import { trackFingerprint } from '../../shared/track/fingerprint.ts';
import { CAR_FLAG, PROTOCOL_VERSION } from '../../shared/net/protocol.ts';
import { TestClient } from './netClient.ts';

const TIME_SCALE = 3;
let server: HostServer;
const clients: TestClient[] = [];

before(async () => {
  setTimeScale(TIME_SCALE);
  server = await HostServer.create({ raceGraceMs: 20_000, lobbyGraceMs: 3_000, maxRooms: 50 });
  server.start();
});

after(() => {
  for (const c of clients) c.close();
  server.dispose();
  setTimeScale(1);
});

/** `local` is the host's own browser: the only connection allowed to create rooms. */
async function connect(name: string, latencyMs = 0, local = false): Promise<TestClient> {
  const client = new TestClient(server, latencyMs, local);
  clients.push(client);
  await client.hello(name);
  return client;
}

const connectHost = (name: string, latencyMs = 0) => connect(name, latencyMs, true);

async function roomOf(client: TestClient) {
  return client.waitFor('room');
}

test('lobby: create, join by code, ready gating, settings and host transfer', async () => {
  const host = await connectHost('Host');
  host.send({ type: 'createRoom' });
  const room = await roomOf(host);
  assert.equal(room.code.length, 6);
  assert.equal(room.state, 'lobby');

  const guest = await connect('Guest');
  guest.send({ type: 'joinRoom', code: room.code.toLowerCase() });
  const joined = await guest.waitFor('room', (m) => m.players.length === 2);
  assert.equal(joined.code, room.code);

  const missing = await connect('Lost');
  missing.send({ type: 'joinRoom', code: 'ZZZZZZ' });
  assert.equal((await missing.waitFor('error')).code, 'not-found');

  host.clear();
  host.send({ type: 'startRace' });
  assert.equal((await host.waitFor('error')).code, 'not-ready');

  guest.send({ type: 'updateSettings', settings: { laps: 2 } });
  assert.equal((await guest.waitFor('error')).code, 'not-host');

  host.send({ type: 'updateSettings', settings: { laps: 2, botDifficulty: 'hard', trackSeed: 'neon' } });
  const updated = await guest.waitFor('room', (m) => m.settings.laps === 2);
  assert.equal(updated.settings.botDifficulty, 'hard');
  assert.equal(updated.settings.trackSeed, 'NEON');

  guest.clear();
  host.send({ type: 'leaveRoom' });
  const transferred = await guest.waitFor('room', (m) => m.players.length === 1);
  assert.equal(transferred.players[0].host, true, 'guest became host');
  guest.send({ type: 'leaveRoom' });
});

test('a car chosen in the lobby is the car each player races', async () => {
  const host = await connectHost('Picker');
  host.send({ type: 'createRoom' });
  const room = await roomOf(host);
  host.send({ type: 'updateSettings', settings: { laps: 1, fillBots: false, trackSeed: 'CARPICK' } });
  const guest = await connect('Chooser');
  guest.send({ type: 'joinRoom', code: room.code });
  await guest.waitFor('room', (m) => m.players.length === 2);

  host.send({ type: 'setVehicle', vehicleId: 'atlas-hauler' });
  guest.send({ type: 'setVehicle', vehicleId: 'nova-coupe' });
  const shown = await host.waitFor('room', (m) => m.players.some((p) => p.vehicleId === 'nova-coupe') && m.players.some((p) => p.vehicleId === 'atlas-hauler'));
  assert.equal(shown.players.find((p) => p.name === 'Chooser')?.vehicleId, 'nova-coupe', 'everyone sees the new car in the lobby');

  guest.send({ type: 'setReady', ready: true });
  // waitFor also matches earlier messages, so require both players: a host-only room is trivially "all ready".
  await host.waitFor('room', (m) => m.players.length === 2 && m.players.every((p) => p.ready || p.host));
  host.send({ type: 'startRace' });
  const { setup } = await guest.waitFor('raceSetup');
  const cars = Object.fromEntries(setup.participants.map((p) => [p.name, p.vehicleId]));
  assert.equal(cars.Picker, 'atlas-hauler');
  assert.equal(cars.Chooser, 'nova-coupe');
  host.send({ type: 'leaveRoom' });
  guest.send({ type: 'leaveRoom' });
});

test('malformed, oversized and out-of-range messages are rejected', async () => {
  const client = await connect('Fuzz');
  client.clear();
  client.send('not json');
  assert.equal((await client.waitFor('error')).code, 'bad-message');
  client.clear();
  client.send({ type: 'input', inputs: [[1, 1, 999, 0, 0]] });
  assert.equal((await client.waitFor('error')).code, 'bad-message');
  client.clear();
  client.send({ type: 'setName', name: '<script>alert(1)</script>' });
  assert.equal((await client.waitFor('error')).code, 'bad-message');
  client.clear();
  client.send({ type: 'joinRoom', code: 'A'.repeat(5000) });
  assert.equal((await client.waitFor('error')).code, 'bad-message');
});

test('two clients race with bots: synced start, shared world, identical results, rematch without reload', async () => {
  const a = await connectHost('Alice');
  const b = await connect('Bob');
  a.send({ type: 'createRoom' });
  const room = await roomOf(a);
  a.send({ type: 'updateSettings', settings: { laps: 1, maxPlayers: 4, botDifficulty: 'easy', trackSeed: 'MPTEST' } });
  b.send({ type: 'joinRoom', code: room.code });
  await b.waitFor('room', (m) => m.players.length === 2);
  b.send({ type: 'setReady', ready: true });
  await a.waitFor('room', (m) => m.players.length === 2 && m.players.every((p) => p.ready || p.host));
  a.send({ type: 'startRace' });

  const [setupA, setupB] = await Promise.all([a.waitFor('raceSetup'), b.waitFor('raceSetup')]);
  assert.equal(trackFingerprint(setupA.setup.track), trackFingerprint(setupB.setup.track), 'both clients race the same track');
  assert.equal(setupA.setup.participants.length, 4, '2 humans + 2 bots');
  a.send({ type: 'loaded', raceId: setupA.setup.raceId });
  b.send({ type: 'loaded', raceId: setupB.setup.raceId });
  const [startA, startB] = await Promise.all([a.waitFor('raceStart'), b.waitFor('raceStart')]);
  assert.equal(startA.tick0At, startB.tick0At, 'one server start time for everyone');

  const firstSnapshot = await a.waitFor('snapshot');
  assert.equal(firstSnapshot.s.cars.length, 4, 'every car visible to every client');
  a.startDriving();
  b.startDriving();

  const [resultsA, resultsB] = await Promise.all([a.waitFor('results', () => true, 90_000), b.waitFor('results', () => true, 90_000)]);
  assert.deepEqual(resultsA.results, resultsB.results, 'identical results on both clients');
  const humans = resultsA.results.filter((r) => r.kind === 'human');
  assert.ok(humans.some((r) => r.finished), 'networked inputs drove a human car to the finish');
  a.stopDriving();
  b.stopDriving();

  const finishedRoom = await a.waitFor('room', (m) => m.state === 'finished');
  assert.ok(finishedRoom.results);
  a.clear();
  b.clear();
  b.send({ type: 'setReady', ready: true });
  await a.waitFor('room', (m) => m.players.length === 2 && m.players.every((p) => p.ready || p.host));
  a.send({ type: 'startRace' });
  const rematch = await b.waitFor('raceSetup');
  assert.equal(rematch.setup.raceId, setupA.setup.raceId + 1, 'rematch started without reconnecting');
  a.send({ type: 'leaveRoom' });
  b.send({ type: 'leaveRoom' });
});

test('disconnect mid-race: a bot takes over, the player resumes with a token and gets a full snapshot', async () => {
  const a = await connectHost('Ana');
  const b = await connect('Ben');
  a.send({ type: 'createRoom' });
  const room = await roomOf(a);
  a.send({ type: 'updateSettings', settings: { laps: 2, fillBots: false, trackSeed: 'RECON' } });
  b.send({ type: 'joinRoom', code: room.code });
  await b.waitFor('room', (m) => m.players.length === 2);
  b.send({ type: 'setReady', ready: true });
  await a.waitFor('room', (m) => m.players.length === 2 && m.players.every((p) => p.ready || p.host));
  a.send({ type: 'startRace' });
  const setup = await b.waitFor('raceSetup');
  a.send({ type: 'loaded', raceId: setup.setup.raceId });
  b.send({ type: 'loaded', raceId: setup.setup.raceId });
  await b.waitFor('raceStart');
  await a.waitFor('snapshot', (m) => m.s.ph === 'racing', 30_000);

  const token = b.token;
  const benId = b.playerId;
  b.close();
  const taken = await a.waitFor('snapshot', (m) => m.s.cars.some((c) => c[0] === benId && (c[16] & CAR_FLAG.BOT_DRIVEN) !== 0));
  assert.ok(taken, 'bot drives the disconnected car');

  const back = new TestClient(server);
  clients.push(back);
  back.send({ type: 'resume', v: PROTOCOL_VERSION, token });
  const welcome = await back.waitFor('welcome');
  assert.equal(welcome.playerId, benId);
  await back.waitFor('raceSetup');
  await back.waitFor('raceStart');
  const snapshot = await back.waitFor('snapshot');
  assert.equal(snapshot.s.cars.length, 2);
  const restored = await a.waitFor('snapshot', (m) => m.s.cars.some((c) => c[0] === benId && (c[16] & CAR_FLAG.BOT_DRIVEN) === 0));
  assert.ok(restored, 'human control restored');

  const stale = new TestClient(server);
  clients.push(stale);
  stale.send({ type: 'resume', v: PROTOCOL_VERSION, token: 'x'.repeat(30) });
  assert.equal((await stale.waitFor('error')).code, 'resume-failed');
  a.send({ type: 'leaveRoom' });
  back.send({ type: 'leaveRoom' });
});

test('eight clients fill one room; a ninth is turned away; the server stays fast', async () => {
  const players = await Promise.all(Array.from({ length: 8 }, (_, i) => connect(`P${i}`, 40, i === 0)));
  const [host, ...rest] = players;
  host.send({ type: 'createRoom' });
  const room = await roomOf(host);
  host.send({ type: 'updateSettings', settings: { laps: 1, trackSeed: 'EIGHT' } });
  for (const p of rest) p.send({ type: 'joinRoom', code: room.code });
  await host.waitFor('room', (m) => m.players.length === 8, 20_000);
  const ninth = await connect('Ninth');
  ninth.send({ type: 'joinRoom', code: room.code });
  assert.equal((await ninth.waitFor('error')).code, 'full');

  for (const p of rest) p.send({ type: 'setReady', ready: true });
  await host.waitFor('room', (m) => m.players.length === 8 && m.players.every((p) => p.ready || p.host), 20_000);
  host.send({ type: 'startRace' });
  const setups = await Promise.all(players.map((p) => p.waitFor('raceSetup', () => true, 20_000)));
  assert.ok(setups.every((s) => s.setup.participants.length === 8 && s.setup.participants.every((p) => p.kind === 'human')));
  for (const [i, p] of players.entries()) p.send({ type: 'loaded', raceId: setups[i].setup.raceId });
  await Promise.all(players.map((p) => p.waitFor('raceStart', () => true, 20_000)));
  for (const p of players) p.startDriving(0.7);

  const runner = server.manager.rooms.get(room.code)!.runner!;
  const t0 = performance.now();
  const tick0 = runner.sim.tick;
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const ticks = runner.sim.tick - tick0;
  const realSeconds = (performance.now() - t0) / 1000;
  assert.ok(ticks / realSeconds > 60 * TIME_SCALE * 0.9, `server kept up: ${(ticks / realSeconds).toFixed(0)} ticks/s at ${TIME_SCALE}x`);
  for (const p of players) {
    p.stopDriving();
    p.send({ type: 'leaveRoom' });
  }
});

test('only the host connection can create rooms; guests join', async () => {
  const guest = await connect('Guest');
  guest.send({ type: 'createRoom' });
  assert.equal((await guest.waitFor('error')).code, 'host-only');
  guest.clear();
  guest.send({ type: 'createPublicRoom' });
  assert.equal((await guest.waitFor('error')).code, 'host-only');
});

test('quick play: guests matched to a public room, the countdown runs at 3, the race starts and the room locks', async () => {
  const host = await connectHost('Q1');
  host.send({ type: 'createPublicRoom' });
  const room = await host.waitFor('room', (m) => m.public);
  assert.ok(room.players[0].ready, 'the host sits in their own public room, ready');
  const guests = await Promise.all(['Q2', 'Q3'].map((name) => connect(name)));
  for (const g of guests) g.send({ type: 'joinPublic', code: room.code });
  const players = [host, ...guests];
  const rooms = await Promise.all(players.map((p) => p.waitFor('room', (m) => m.public && m.players.length === 3)));
  assert.equal(new Set(rooms.map((r) => r.code)).size, 1, 'all three land in the same public room');
  const counting = await host.waitFor('room', (m) => m.public && m.countdownEndsAt > 0);
  assert.ok(counting.players.every((p) => p.ready), 'accepting is the ready press');
  const setups = await Promise.all(players.map((p) => p.waitFor('raceSetup', () => true, 15000)));
  assert.equal(setups[0].setup.participants.length, 3, 'no bots in quick play');

  // The started room is closed: a newcomer cannot take a seat, by quick play or by code.
  const late = await connect('Late');
  late.send({ type: 'joinPublic', code: room.code });
  assert.equal((await late.waitFor('error')).code, 'in-progress');
  late.clear();
  late.send({ type: 'joinRoom', code: room.code });
  assert.equal((await late.waitFor('error')).code, 'in-progress');
  for (const p of players) p.send({ type: 'leaveRoom' });
});

test('joinPublic never reaches a private room', async () => {
  const host = await connectHost('Private');
  host.send({ type: 'createRoom' });
  const room = await roomOf(host);
  const guest = await connect('Sneaky');
  guest.send({ type: 'joinPublic', code: room.code });
  assert.equal((await guest.waitFor('error')).code, 'not-found');
  host.send({ type: 'leaveRoom' });
});
