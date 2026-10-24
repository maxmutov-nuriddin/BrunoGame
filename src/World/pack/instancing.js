import * as THREE from 'three';

/** Collapse a tile into InstancedMeshes (one per geometry+material) repeated at `tileMatrices`. */
export function instanceTile(tileRoot, tileMatrices, { castShadow = false, receiveShadow = true } = {}) {
  tileRoot.updateMatrixWorld(true);
  const groups = new Map();

  tileRoot.traverse((node) => {
    if (!node.isMesh) return;
    const key = `${node.geometry.uuid}|${node.material.uuid}`;
    const group = groups.get(key) ?? { geometry: node.geometry, material: node.material, matrices: [] };
    tileMatrices.forEach((tileMatrix) => {
      group.matrices.push(new THREE.Matrix4().multiplyMatrices(tileMatrix, node.matrixWorld));
    });
    groups.set(key, group);
  });

  const root = new THREE.Group();
  groups.forEach(({ geometry, material, matrices }) => {
    const instanced = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = castShadow;
    instanced.receiveShadow = receiveShadow;
    root.add(instanced);
  });

  return root;
}

export function enableShadows(object, { cast = true, receive = true } = {}) {
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = cast;
    node.receiveShadow = receive;
  });
  return object;
}

/** Detach named top-level children of a kit into reusable templates with a local bounding box. */
export function extractTemplates(kitScene) {
  const root = kitScene.children[0] ?? kitScene;
  const templates = new Map();

  root.children.forEach((child) => {
    const object = child.clone(true);
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    templates.set(child.name, {
      object,
      size: box.getSize(new THREE.Vector3()),
      center: box.getCenter(new THREE.Vector3())
    });
  });

  return templates;
}

/** Push matching base layers behind coplanar neighbours so they stop z-fighting. */
export function pushBackLayers(root, namePattern, { factor = 4, units = 4 } = {}) {
  root.traverse((node) => {
    if (!node.isMesh || !namePattern.test(node.name) || node.material.polygonOffset) return;
    node.material = node.material.clone();
    node.material.polygonOffset = true;
    node.material.polygonOffsetFactor = factor;
    node.material.polygonOffsetUnits = units;
  });
  return root;
}
