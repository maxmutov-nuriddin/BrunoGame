import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Physics from '../src/Physics.js';
import WorldPack from '../src/World/WorldPack.js';
import Floor from '../src/World/Floor.js';
import { WORLD_PACK_DIR, WORLD_PACK_FILES, worldResourceName } from '../src/worldPack.js';
import { createRng, normalizeSeedCode, randomSeedCode } from '../src/World/pack/seed.js';
import { JUMP_SPOTS, ZONES, isInside } from '../src/World/pack/zones.js';

const loader = new GLTFLoader();
const items = {};
for (const [key, file] of Object.entries(WORLD_PACK_FILES)) {
  const bytes = await readFile(new URL(`../public${WORLD_PACK_DIR}/${file}`, import.meta.url));
  items[worldResourceName(key)] = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

const sequence = (code) => {
  const rng = createRng(code);
  return Array.from({ length: 6 }, () => rng.next());
};
assert.deepEqual(sequence('ABCD-1234'), sequence('ABCD-1234'), 'same code must give the same sequence');
assert.notDeepEqual(sequence('ABCD-1234'), sequence('ABCD-1235'), 'different codes must differ');
assert.equal(normalizeSeedCode(' ab-cd 12345!'), 'ABCD-12345');
assert.match(randomSeedCode(), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

async function build(code) {
  const physics = await Physics.create();
  const app = { resources: { items }, physics, scene: new THREE.Scene(), applyPalette() {} };
  new Floor(app);
  const world = new WorldPack(app, code);
  return { physics, app, world };
}

const layout = (world) => world.group.children.map((child) => `${child.name}@${child.position.x.toFixed(2)},${child.position.z.toFixed(2)}`).join('|');

const a = await build('TEST-0001');
const b = await build('TEST-0001');
const c = await build('TEST-0002');
assert.equal(layout(a.world), layout(b.world), 'same seed must rebuild the identical layout');
assert.notEqual(layout(a.world), layout(c.world), 'different seeds must give different layouts');

const props = a.world.ctx.dynamics.length;
assert.ok(props > 40 && props < 160, `knockable prop budget: ${props}`);
assert.ok(a.world.ctx.bodies.length > props + 20, 'static colliders must exist');

a.world.ctx.placer.placed.forEach(({ x, z }) => {
  assert.ok(Math.hypot(x, z) < 320, `placement inside the border: ${x},${z}`);
  ZONES.plazas.forEach((zone) => assert.ok(!isInside(zone, x, z), 'nothing placed inside a plaza'));
});

for (let i = 0; i < 90; i++) a.physics.update(1 / 60);
a.world.update();
a.world.ctx.dynamics.forEach(({ body }) => {
  const { x, y, z } = body.translation();
  assert.ok([x, y, z].every(Number.isFinite) && y > -1, 'props must settle on the ground');
});

const bodiesBefore = a.physics.world.bodies.len();
const worldBodies = a.world.ctx.bodies.length;
a.world.dispose();
assert.equal(a.physics.world.bodies.len(), bodiesBefore - worldBodies, 'dispose must remove exactly the world bodies');

// Jump 02 has a deliberate gap between take-off and landing, so probe along its whole length.
for (const { x: jumpX, z: jumpZ } of Object.values(JUMP_SPOTS)) {
  const hits = [];
  for (let offset = -22; offset <= 22; offset += 2) {
    const probe = new THREE.Raycaster(new THREE.Vector3(jumpX, 20, jumpZ + offset), new THREE.Vector3(0, -1, 0));
    hits.push(...probe.intersectObjects(b.world.group.children, true).filter((hit) => /^(Tabletop|Takeoff|Landing)$/.test(hit.object.name)));
  }
  assert.ok(hits.length > 0, `a jump must stand at ${jumpX},${jumpZ}`);
}

const takeoff = b.world.group.getObjectByName('Takeoff');
const landing = b.world.group.getObjectByName('Landing');
const zOf = (object) => new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).z;
assert.ok(zOf(takeoff) < zOf(landing), 'Jump 02 take-off must face the spawn side');

console.log(`World checks passed: ${props} knockable props, ${b.world.ctx.bodies.length} static colliders.`);
