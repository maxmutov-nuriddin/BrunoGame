import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const WHEEL_NAME = /^Wheel_\d$/;
const GRID_KEY_DIGITS = 3;

const triangleKey = (mesh) => {
  const geometry = mesh.geometry;
  return `${mesh.material.uuid}|${Object.keys(geometry.attributes).sort().join(',')}|${geometry.index ? 'i' : 'n'}`;
};

/**
 * Quantized (meshopt / KHR_mesh_quantization) attributes back to plain Float32, in place. The dequantizing
 * scale stays on the mesh node, so nothing moves; merging and baking below then work on ordinary floats.
 */
export function dequantize(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    const { geometry } = node;
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (attribute.array instanceof Float32Array && !attribute.normalized && !attribute.isInterleavedBufferAttribute) continue;
      const { count, itemSize } = attribute;
      const floats = new Float32Array(count * itemSize);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < itemSize; j++) floats[i * itemSize + j] = attribute.getComponent(i, j);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(floats, itemSize));
    }
  });
}

/**
 * Merge every static mesh under `root` that shares a material into one mesh (one draw call per material).
 * Subtrees for which `exclude` returns true are left alone, as are meshes with children, so animated parts
 * (wheels) can be merged separately inside their own node.
 */
export function mergeByMaterial(root, exclude = () => false) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const groups = new Map();
  const visit = (node) => {
    for (const child of node.children) {
      if (exclude(child)) continue;
      if (child.isMesh && !child.isSkinnedMesh && !child.morphTargetInfluences && child.children.length === 0 && !Array.isArray(child.material)) {
        const key = triangleKey(child);
        groups.set(key, [...(groups.get(key) ?? []), child]);
        continue;
      }
      visit(child);
    }
  };
  visit(root);

  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld)));
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const first = meshes[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = first.material.name || first.name;
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    for (const old of meshes) old.removeFromParent();
    root.add(mesh);
  }
}

/** Car GLB: one mesh per material for the body, and the same inside each wheel so wheels still spin. */
export function optimizeCar(scene) {
  mergeByMaterial(scene, (node) => WHEEL_NAME.test(node.name));
  for (let i = 0; i < 4; i++) {
    const wheel = scene.getObjectByName(`Wheel_${i}`);
    if (wheel) mergeByMaterial(wheel);
  }
}

/**
 * A flat, regular grid whose look comes only from vertex colours becomes a 2-triangle quad with those
 * colours baked into a texture. Linear filtering reproduces the per-vertex interpolation, so it looks the
 * same at a fraction of the vertex work. Returns false (and changes nothing) for anything else.
 */
export function bakeGridColors(mesh) {
  const { position, color, normal } = mesh.geometry.attributes;
  if (!color || !normal) return false;
  const xs = [...new Set(Array.from({ length: position.count }, (_, i) => position.getX(i).toFixed(GRID_KEY_DIGITS)))].map(Number).sort((a, b) => a - b);
  const zs = [...new Set(Array.from({ length: position.count }, (_, i) => position.getZ(i).toFixed(GRID_KEY_DIGITS)))].map(Number).sort((a, b) => a - b);
  const width = xs.length;
  const height = zs.length;
  if (width * height !== position.count || width < 2 || height < 2) return false;
  const y = position.getY(0);
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - y) > 1e-4 || normal.getY(i) < 0.999) return false;
  }

  const [minX, maxX, minZ, maxZ] = [xs[0], xs.at(-1), zs[0], zs.at(-1)];
  const data = new Uint16Array(width * height * 4);
  for (let i = 0; i < position.count; i++) {
    const column = Math.round(((position.getX(i) - minX) / (maxX - minX)) * (width - 1));
    const row = Math.round(((position.getZ(i) - minZ) / (maxZ - minZ)) * (height - 1));
    const offset = (row * width + column) * 4;
    data[offset] = THREE.DataUtils.toHalfFloat(color.getX(i));
    data[offset + 1] = THREE.DataUtils.toHalfFloat(color.getY(i));
    data[offset + 2] = THREE.DataUtils.toHalfFloat(color.getZ(i));
    data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  // Texel centres sit exactly on the old vertices.
  const u = (x) => (((x - minX) / (maxX - minX)) * (width - 1) + 0.5) / width;
  const v = (z) => (((z - minZ) / (maxZ - minZ)) * (height - 1) + 0.5) / height;
  const corners = [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]];
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(([x, z]) => [x, y, z]), 3));
  quad.setAttribute('normal', new THREE.Float32BufferAttribute(corners.flatMap(() => [0, 1, 0]), 3));
  quad.setAttribute('uv', new THREE.Float32BufferAttribute(corners.flatMap(([x, z]) => [u(x), v(z)]), 2));
  quad.setIndex([0, 2, 1, 1, 2, 3]);

  const material = mesh.material.clone();
  material.vertexColors = false;
  material.map = texture;
  mesh.geometry.dispose();
  mesh.geometry = quad;
  mesh.material = material;
  return true;
}

/** Grass tile: bake the big coloured ground grid, merge the scattered tiny flowers into one mesh. */
export function optimizeGrassTile(scene) {
  scene.traverse((node) => {
    if (node.isMesh && node.geometry.attributes.color) bakeGridColors(node);
  });
  mergeByMaterial(scene, (node) => node.name === 'Soil' || node.material?.map);
}
