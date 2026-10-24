import RaceSimulation from '../shared/race/RaceSimulation.ts';
import { trackForSeed } from '../shared/track/presets.ts';
import { VEHICLES } from '../shared/vehicles.ts';
import { baseSnapshot, privateState } from '../shared/net/snapshot.ts';
const track = trackForSeed('SUNSET');
const sim = await RaceSimulation.create({ track, laps: 3, mode: 'race', itemsEnabled: true, seed: 'S', participants: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `Bot${i}`, vehicleId: VEHICLES[i % 6].id, kind: 'bot' as const, difficulty: 'hard' as const })) });
let sizes: number[] = []; const times: number[] = [];
while (sim.phase !== 'finished') {
  const a = performance.now(); sim.step(); times.push(performance.now() - a);
  if (sim.tick % 3 === 0) sizes.push(JSON.stringify({ type: 'snapshot', s: { ...baseSnapshot(sim, 0, sim.events.map(e => ({ k: sim.tick, e }))), ack: 1, me: privateState(sim.cars[0]) } }).length);
}
times.sort((a, b) => a - b);
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
console.log('setup JSON bytes', JSON.stringify(track).length);
console.log('snapshot bytes avg', avg(sizes).toFixed(0), 'max', Math.max(...sizes), '→ per client', (avg(sizes) * 20 / 1024).toFixed(1), 'KB/s');
console.log('tick ms avg', avg(times).toFixed(3), 'p99', times[Math.floor(times.length * 0.99)].toFixed(3), 'max', times.at(-1)!.toFixed(2));
