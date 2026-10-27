// Generates every car GLB from scripts/cars/designs.mjs into public/models/<id>.glb.
// Usage: npm run model:cars [-- id ...]   (no ids: all twelve). Check the output with npm run model:check.
import { writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { DESIGNS } from './cars/designs.mjs';
import { fileURLToPath } from 'node:url';
import { compressModels } from './compress-models.mjs';

// GLTFExporter uses FileReader to pack the binary; Node has Blob but no FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const requested = process.argv.slice(2);
const unknown = requested.filter((id) => !DESIGNS[id]);
if (unknown.length > 0) {
  console.error(`Unknown car id(s): ${unknown.join(', ')}. Known: ${Object.keys(DESIGNS).join(', ')}`);
  process.exit(1);
}

for (const id of requested.length > 0 ? requested : Object.keys(DESIGNS)) {
  const car = DESIGNS[id]();
  car.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(car, { binary: true });
  const file = new URL(`../public/models/${id}.glb`, import.meta.url);
  await writeFile(file, Buffer.from(glb));
  console.log(`${id}.glb  ${(glb.byteLength / 1024).toFixed(0)} KB`);
  await compressModels([fileURLToPath(file)]);
}
