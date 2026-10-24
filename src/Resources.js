import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LoadingManager } from 'three';
import { VEHICLES } from '../shared/vehicles.ts';
import { WORLD_PACK_DIR, WORLD_PACK_FILES, worldResourceName } from './worldPack.js';
import { optimizeCar, optimizeGrassTile } from './modelOptimizer.js';

/** Loads every car and world-pack model; progress events reflect files actually loaded. */
export default class Resources extends EventTarget {
  constructor() {
    super();
    this.items = {};
  }

  sources() {
    return [
      ...VEHICLES.map((vehicle) => ({ name: vehicle.resource, path: `/models/${vehicle.file}`, label: `Loading ${vehicle.name}…`, optimize: optimizeCar })),
      ...Object.entries(WORLD_PACK_FILES).map(([key, file]) => ({
        name: worldResourceName(key),
        path: `${WORLD_PACK_DIR}/${file}`,
        label: 'Loading the world…',
        optimize: key === 'grass' ? optimizeGrassTile : null
      }))
    ];
  }

  async load() {
    const sources = this.sources().filter((source) => !this.items[source.name]);
    const total = sources.length;
    let loaded = 0;
    const manager = new LoadingManager();
    const loader = new GLTFLoader(manager);
    await Promise.all(
      sources.map((source) =>
        loader.loadAsync(source.path).then((gltf) => {
          // Fewer draw calls and vertices for every later use (showroom, every car and tile in a race).
          source.optimize?.(gltf.scene);
          this.items[source.name] = gltf;
          loaded += 1;
          this.dispatchEvent(new CustomEvent('progress', { detail: { progress: Math.round((loaded / total) * 100), label: source.label } }));
        })
      )
    );
    this.dispatchEvent(new Event('ready'));
  }
}
