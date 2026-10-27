// Meshopt-compress GLB files in place (EXT_meshopt_compression + quantized attributes).
// Usage: node scripts/compress-models.mjs public/models/a.glb [more.glb …]
// Empty marker nodes (Exhaust_L/R, Wheel_N) are kept: nothing here prunes the scene graph.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

/** Compress each GLB in place; files that are already compressed are left alone. */
export async function compressModels(files) {
  for (const file of files) {
    const before = (await readFile(file)).byteLength;
    const document = await io.read(file);
    if (document.getRoot().listExtensionsUsed().some((ext) => ext.extensionName === 'EXT_meshopt_compression')) {
      console.log(`${file}  already compressed, skipped`);
      continue;
    }
    await document.transform(dedup(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const glb = await io.writeBinary(document);
    await writeFile(file, glb);
    console.log(`${file}  ${(before / 1024).toFixed(0)} KB → ${(glb.byteLength / 1024).toFixed(0)} KB`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: node scripts/compress-models.mjs <file.glb> [...]');
    process.exit(1);
  }
  await compressModels(files);
}
