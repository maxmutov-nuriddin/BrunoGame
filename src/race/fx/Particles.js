import * as THREE from 'three';

const LIMITS = { low: 350, medium: 900, high: 1600 };

const VERTEX = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = /* glsl */ `
  varying vec4 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vTint.rgb, vTint.a * smoothstep(0.5, 0.15, d));
  }
`;

/** Pooled CPU particles drawn as one Points object (smoke, sparks, debris, nitro trails). */
export default class Particles {
  constructor(quality = 'high', blending = THREE.NormalBlending) {
    this.capacity = LIMITS[quality] ?? LIMITS.high;
    this.count = 0;
    this.position = new Float32Array(this.capacity * 3);
    this.velocity = new Float32Array(this.capacity * 3);
    this.size = new Float32Array(this.capacity);
    this.tint = new Float32Array(this.capacity * 4);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    this.grow = new Float32Array(this.capacity);
    this.drag = new Float32Array(this.capacity);
    this.gravity = new Float32Array(this.capacity);
    this.baseAlpha = new Float32Array(this.capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.geometry.setDrawRange(0, 0);
  }

  /** Oldest particles are recycled once the pool is full. */
  emit({ x, y, z, vx = 0, vy = 0, vz = 0, size = 1, color = [1, 1, 1], alpha = 1, life = 1, grow = 0, drag = 0, gravity = 0 }) {
    const i = this.count < this.capacity ? this.count++ : Math.floor(Math.random() * this.capacity);
    this.position.set([x, y, z], i * 3);
    this.velocity.set([vx, vy, vz], i * 3);
    this.size[i] = size;
    this.tint.set([color[0], color[1], color[2], alpha], i * 4);
    this.baseAlpha[i] = alpha;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.swapRemove(i);
        continue;
      }
      const k = i * 3;
      const damping = Math.max(0, 1 - this.drag[i] * dt);
      this.velocity[k] *= damping;
      this.velocity[k + 1] = this.velocity[k + 1] * damping - this.gravity[i] * dt;
      this.velocity[k + 2] *= damping;
      this.position[k] += this.velocity[k] * dt;
      this.position[k + 1] += this.velocity[k + 1] * dt;
      this.position[k + 2] += this.velocity[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.tint[i * 4 + 3] = this.baseAlpha[i] * (this.life[i] / this.maxLife[i]);
      i++;
    }
    this.geometry.setDrawRange(0, this.count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.tint.needsUpdate = true;
  }

  swapRemove(i) {
    const last = --this.count;
    if (i === last) return;
    this.position.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.velocity.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.tint.copyWithin(i * 4, last * 4, last * 4 + 4);
    for (const array of [this.size, this.life, this.maxLife, this.grow, this.drag, this.gravity, this.baseAlpha]) array[i] = array[last];
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
