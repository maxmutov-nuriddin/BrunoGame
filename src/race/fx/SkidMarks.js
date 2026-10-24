import * as THREE from 'three';

const MAX_SEGMENTS = { low: 400, medium: 900, high: 1600 };
const MARK_WIDTH = 0.32;
const MIN_STEP = 0.35;

/** Tyre marks as a ring buffer of quads; old marks are overwritten instead of allocating. */
export default class SkidMarks {
  constructor(quality = 'high') {
    this.capacity = MAX_SEGMENTS[quality] ?? MAX_SEGMENTS.high;
    this.positions = new Float32Array(this.capacity * 4 * 3);
    this.alphas = new Float32Array(this.capacity * 4);
    const indices = new Uint32Array(this.capacity * 6);
    for (let i = 0; i < this.capacity; i++) indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      vertexShader: 'attribute float alpha; varying float vAlpha; void main(){ vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vAlpha; void main(){ gl_FragColor = vec4(0.05, 0.05, 0.06, vAlpha * 0.55); }'
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.next = 0;
    this.trails = new Map();
  }

  /** Extend the mark for `key` (car+wheel) to `point`; `strength` 0 ends the mark. */
  add(key, point, sideways, strength) {
    const previous = this.trails.get(key);
    if (strength <= 0) {
      this.trails.delete(key);
      return;
    }
    if (!previous) {
      this.trails.set(key, { point: point.clone(), side: sideways.clone() });
      return;
    }
    if (previous.point.distanceTo(point) < MIN_STEP) return;
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const w = MARK_WIDTH / 2;
    const a = previous.point, b = point, sa = previous.side, sb = sideways;
    this.positions.set([
      a.x - sa.x * w, a.y + 0.03, a.z - sa.z * w,
      a.x + sa.x * w, a.y + 0.03, a.z + sa.z * w,
      b.x - sb.x * w, b.y + 0.03, b.z - sb.z * w,
      b.x + sb.x * w, b.y + 0.03, b.z + sb.z * w
    ], i * 12);
    this.alphas.set([strength, strength, strength, strength], i * 4);
    previous.point.copy(point);
    previous.side.copy(sideways);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
