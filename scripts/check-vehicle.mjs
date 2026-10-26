// Checks car GLBs against the vehicle contract in docs/VEHICLES.md before they go into the game.
// Usage: npm run model:check -- path/to/car.glb [...]   (no arguments: every car in public/models)
// Reads the GLB directly (JSON + binary chunks), so it needs no browser and ignores textures it cannot decode.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as T from 'three';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const WHEELS = [
  { name: 'Wheel_0', x: -0.97, z: -1.3, label: 'front-left' },
  { name: 'Wheel_1', x: 0.97, z: -1.3, label: 'front-right' },
  { name: 'Wheel_2', x: -0.97, z: 1.3, label: 'rear-left' },
  { name: 'Wheel_3', x: 0.97, z: 1.3, label: 'rear-right' }
];
const WHEEL_Y = -0.28;
const WHEEL_POSITION_TOLERANCE = 0.25;
const WHEEL_RADIUS = 0.35;
const WHEEL_RADIUS_TOLERANCE = 0.08;
const SIZE = { maxWidth: 2.3, minLength: 3.4, maxLength: 4.8, maxHeight: 2.2 };
const TRIANGLES = { target: 25_000, hardLimit: 40_000 };
const MAX_TEXTURE_SIZE = 1024;
const REQUIRED_MATERIALS = ['BrakeLights', 'Paint'];

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a binary glTF (.glb) file');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'));
    else if (type === CHUNK_BIN) bin = data;
    offset += 8 + length;
  }
  if (!json) throw new Error('missing JSON chunk');
  return { json, bin };
}

function localMatrix(node) {
  if (node.matrix) return new T.Matrix4().fromArray(node.matrix);
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return new T.Matrix4().compose(new T.Vector3(tx, ty, tz), new T.Quaternion(qx, qy, qz, qw), new T.Vector3(sx, sy, sz));
}

/** Visit every node of the default scene with its world matrix and the chain of ancestor names. */
function walk(json, visit) {
  const scene = json.scenes?.[json.scene ?? 0];
  const recurse = (index, parentMatrix, ancestors) => {
    const node = json.nodes[index];
    const world = parentMatrix.clone().multiply(localMatrix(node));
    const chain = [...ancestors, node.name ?? ''];
    visit(node, world, chain);
    for (const child of node.children ?? []) recurse(child, world, chain);
  };
  for (const root of scene?.nodes ?? []) recurse(root, new T.Matrix4(), []);
}

function primitiveBox(json, primitive) {
  const accessor = json.accessors[primitive.attributes.POSITION];
  if (!accessor?.min || !accessor?.max) return null;
  return new T.Box3(new T.Vector3(...accessor.min), new T.Vector3(...accessor.max));
}

function primitiveTriangles(json, primitive) {
  const mode = primitive.mode ?? 4;
  if (mode !== 4) return 0;
  const count = primitive.indices !== undefined ? json.accessors[primitive.indices].count : json.accessors[primitive.attributes.POSITION].count;
  return count / 3;
}

/** Width and height of embedded PNG/JPEG images, read from their headers. */
function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 8 < bytes.length) {
      const marker = bytes[i + 1];
      const length = bytes.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      i += 2 + length;
    }
  }
  return null;
}

function checkWheels(wheelOrigins, wheelBoxes, errors, warnings) {
  for (const wheel of WHEELS) {
    const origin = wheelOrigins.get(wheel.name);
    if (!origin) {
      errors.push(`missing node "${wheel.name}" (${wheel.label} wheel)`);
      continue;
    }
    const off = Math.hypot(origin.x - wheel.x, origin.y - WHEEL_Y, origin.z - wheel.z);
    if (off > WHEEL_POSITION_TOLERANCE) {
      errors.push(`${wheel.name} at (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)}), expected about (${wheel.x}, ${WHEEL_Y}, ${wheel.z})`);
    }
    const box = wheelBoxes.get(wheel.name);
    if (box.isEmpty()) {
      errors.push(`${wheel.name} has no mesh under it`);
      continue;
    }
    const size = box.getSize(new T.Vector3());
    const radius = Math.max(size.y, size.z) / 2;
    if (Math.abs(radius - WHEEL_RADIUS) > WHEEL_RADIUS_TOLERANCE) warnings.push(`${wheel.name} radius ${radius.toFixed(2)} m, physics uses ${WHEEL_RADIUS} m`);
  }
}

function checkCar(file, buffer) {
  const errors = [];
  const warnings = [];
  const { json, bin } = parseGlb(buffer);
  const bounds = new T.Box3();
  const wheelBoxes = new Map(WHEELS.map((w) => [w.name, new T.Box3()]));
  const wheelOrigins = new Map();
  let triangles = 0;

  walk(json, (node, world, chain) => {
    if (wheelBoxes.has(node.name)) wheelOrigins.set(node.name, new T.Vector3().setFromMatrixPosition(world));
    if (node.mesh === undefined) return;
    const owner = chain.find((name) => wheelBoxes.has(name));
    for (const primitive of json.meshes[node.mesh].primitives) {
      triangles += primitiveTriangles(json, primitive);
      const box = primitiveBox(json, primitive);
      if (!box) continue;
      box.applyMatrix4(world);
      bounds.union(box);
      if (owner) wheelBoxes.get(owner).union(box);
    }
  });
  checkWheels(wheelOrigins, wheelBoxes, errors, warnings);

  const size = bounds.getSize(new T.Vector3());
  if (size.x > SIZE.maxWidth) errors.push(`too wide: ${size.x.toFixed(2)} m (max ${SIZE.maxWidth})`);
  if (size.z < SIZE.minLength || size.z > SIZE.maxLength) errors.push(`length ${size.z.toFixed(2)} m (expected ${SIZE.minLength}–${SIZE.maxLength})`);
  if (size.y > SIZE.maxHeight) errors.push(`too tall: ${size.y.toFixed(2)} m (max ${SIZE.maxHeight})`);
  if (size.x > size.z) errors.push('car is wider than it is long: it is probably rotated 90° (front must face -Z)');

  if (triangles > TRIANGLES.hardLimit) errors.push(`${Math.round(triangles)} triangles (hard limit ${TRIANGLES.hardLimit})`);
  else if (triangles > TRIANGLES.target) warnings.push(`${Math.round(triangles)} triangles (target ≤ ${TRIANGLES.target})`);

  const materialNames = new Set((json.materials ?? []).map((m) => m.name));
  for (const name of REQUIRED_MATERIALS) if (!materialNames.has(name)) errors.push(`missing material "${name}"`);

  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.bufferView === undefined || !bin) continue;
    const view = json.bufferViews[image.bufferView];
    const dims = imageSize(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    if (dims && Math.max(dims.width, dims.height) > MAX_TEXTURE_SIZE) warnings.push(`texture ${image.name ?? index} is ${dims.width}×${dims.height} (max ${MAX_TEXTURE_SIZE})`);
  }

  return { file, errors, warnings, triangles: Math.round(triangles), size };
}

async function defaultFiles() {
  const dir = 'public/models';
  return (await readdir(dir)).filter((f) => f.endsWith('.glb')).map((f) => join(dir, f));
}

const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : await defaultFiles();
let failed = 0;
for (const file of files) {
  let report;
  try {
    report = checkCar(file, await readFile(file));
  } catch (error) {
    report = { file, errors: [error.message], warnings: [], triangles: 0, size: new T.Vector3() };
  }
  const ok = report.errors.length === 0;
  if (!ok) failed += 1;
  const s = report.size;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}  ${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)} m  ${report.triangles} tris`);
  for (const message of report.errors) console.log(`  error: ${message}`);
  for (const message of report.warnings) console.log(`  warn:  ${message}`);
}
process.exitCode = failed > 0 ? 1 : 0;
