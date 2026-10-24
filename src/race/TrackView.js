import * as THREE from 'three';
import { barrierTexture, bannerTexture, checkerTexture, roadTexture } from './textures.js';

const ROAD_V_REPEAT = 12;
const BARRIER_VISIBLE_HEIGHT = 1.1;
const BARRIER_INSET = 0.4;
const BARRIER_THICKNESS = 1.2;
const CURB_WIDTH = 1.1;
const CURB_MIN_CURVATURE = 1 / 85;
const POST_SPACING_SAMPLES = 5;
const SLOPE_WIDTH = 9;

/** Visual track built from the same definition as the physics colliders. */
export default class TrackView {
  constructor(track, accent = '#ff4f6d') {
    this.track = track;
    this.group = new THREE.Group();
    this.group.name = 'Track';
    this.disposables = [];
    this.buildRoad();
    this.buildCurbs();
    for (const side of [1, -1]) this.buildBarrier(side, accent);
    for (const side of [1, -1]) this.buildSlope(side);
    this.buildStart(accent);
    this.buildRampMarks();
  }

  track_(geometry, material) {
    this.disposables.push(geometry, material);
    if (material.map) this.disposables.push(material.map);
    return new THREE.Mesh(geometry, material);
  }

  ribbon(offsetA, offsetB, heightA, heightB, uvAcross = [0, 1]) {
    const { samples } = this.track;
    const n = samples.length;
    const positions = new Float32Array((n + 1) * 2 * 3);
    const uvs = new Float32Array((n + 1) * 2 * 2);
    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const v = (i === n ? this.track.length : s.s) / ROAD_V_REPEAT;
      positions.set([s.x + s.nx * offsetA, s.y + heightA(s), s.z + s.nz * offsetA, s.x + s.nx * offsetB, s.y + heightB(s), s.z + s.nz * offsetB], i * 6);
      uvs.set([uvAcross[0], v, uvAcross[1], v], i * 4);
    }
    const indices = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  buildRoad() {
    const half = this.track.width / 2;
    const material = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.92, metalness: 0 });
    const road = this.track_(this.ribbon(half + BARRIER_INSET, -half - BARRIER_INSET, () => 0.02, () => 0.02), material);
    road.receiveShadow = true;
    this.group.add(road);
  }

  buildCurbs() {
    const { samples, width } = this.track;
    const n = samples.length;
    const geometry = new THREE.BoxGeometry(CURB_WIDTH, 0.12, this.track.spacing * 1.05);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const transforms = [];
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      if (Math.abs(s.curvature) < CURB_MIN_CURVATURE) continue;
      const inside = Math.sign(s.curvature);
      const lateral = inside * (width / 2 - CURB_WIDTH / 2 + 0.3);
      q.setFromAxisAngle(up, Math.atan2(s.tx, s.tz));
      matrix.compose(new THREE.Vector3(s.x + s.nx * lateral, s.y + 0.06, s.z + s.nz * lateral), q, new THREE.Vector3(1, 1, 1));
      transforms.push({ matrix: matrix.clone(), red: Math.floor(i / 2) % 2 === 0 });
    }
    if (transforms.length === 0) return;
    const curbs = new THREE.InstancedMesh(geometry, material, transforms.length);
    const red = new THREE.Color('#e5304a');
    const white = new THREE.Color('#f5f7fb');
    transforms.forEach(({ matrix: m, red: isRed }, index) => {
      curbs.setMatrixAt(index, m);
      curbs.setColorAt(index, isRed ? red : white);
    });
    curbs.receiveShadow = true;
    this.disposables.push(geometry, material);
    this.group.add(curbs);
  }

  buildBarrier(side, accent) {
    const half = this.track.width / 2 + BARRIER_INSET;
    const inner = side * half;
    const texture = barrierTexture(accent);
    const faceMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, side: THREE.DoubleSide });
    const face = this.track_(this.ribbon(inner, inner, () => 0, () => BARRIER_VISIBLE_HEIGHT, [0, 1]), faceMaterial);
    // Stretch the stripes along the road instead of across the wall.
    const uv = face.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 3, i % 2 === 0 ? 0 : 1);
    uv.needsUpdate = true;
    face.castShadow = true;
    face.receiveShadow = true;
    this.group.add(face);

    const topMaterial = new THREE.MeshStandardMaterial({ color: '#d9dee6', roughness: 0.8 });
    const outer = side * (half + BARRIER_THICKNESS);
    const top = this.track_(this.ribbon(inner, outer, () => BARRIER_VISIBLE_HEIGHT, () => BARRIER_VISIBLE_HEIGHT), topMaterial);
    top.castShadow = true;
    this.group.add(top);
    const back = this.track_(this.ribbon(outer, outer, () => BARRIER_VISIBLE_HEIGHT, (s) => -s.y - 0.1), topMaterial.clone());
    back.material.side = THREE.DoubleSide;
    this.group.add(back);

    this.buildPosts(side, half + BARRIER_THICKNESS / 2, accent);
  }

  buildPosts(side, lateral, accent) {
    const { samples } = this.track;
    const geometry = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8);
    const material = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9 });
    const count = Math.floor(samples.length / POST_SPACING_SAMPLES);
    const posts = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      const s = samples[k * POST_SPACING_SAMPLES];
      matrix.makeTranslation(s.x + s.nx * lateral * side, s.y + BARRIER_VISIBLE_HEIGHT + 0.3, s.z + s.nz * lateral * side);
      posts.setMatrixAt(k, matrix);
    }
    this.disposables.push(geometry, material);
    this.group.add(posts);
  }

  /** Grass embankment from the barrier down to the ground so raised sections look solid. */
  buildSlope(side) {
    const half = this.track.width / 2 + BARRIER_INSET + BARRIER_THICKNESS;
    const material = new THREE.MeshStandardMaterial({ color: '#7fb862', roughness: 1 });
    const slope = this.track_(this.ribbon(side * half, side * (half + SLOPE_WIDTH), () => -0.05, (s) => -s.y + 0.02), material);
    slope.material.side = THREE.DoubleSide;
    slope.receiveShadow = true;
    this.group.add(slope);
  }

  buildStart(accent) {
    const { samples, width, name } = this.track;
    const s = samples[0];
    const yaw = Math.atan2(s.tx, s.tz);
    const checker = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 });
    checker.map.repeat.set(width / 4, 1);
    const line = this.track_(new THREE.PlaneGeometry(width, 2.2), checker);
    // Lay the plane flat, then yaw it so its depth runs along the road.
    line.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
    line.position.set(s.x, s.y + 0.04, s.z);
    line.receiveShadow = true;
    this.group.add(line);

    const gantry = new THREE.Group();
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: '#1a1d26', roughness: 0.5, metalness: 0.3 });
    const pillarGeometry = new THREE.BoxGeometry(0.9, 8, 0.9);
    this.disposables.push(pillarMaterial, pillarGeometry);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
      pillar.position.set(side * (width / 2 + 1.6), 4, 0);
      pillar.castShadow = true;
      gantry.add(pillar);
    }
    const bannerMaterial = new THREE.MeshStandardMaterial({ map: bannerTexture(name.toUpperCase(), 'START  /  FINISH', accent), emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: null });
    bannerMaterial.emissiveMap = bannerMaterial.map;
    const banner = this.track_(new THREE.BoxGeometry(width + 4.2, 2.4, 0.5), bannerMaterial);
    banner.position.set(0, 7.6, 0);
    banner.castShadow = true;
    gantry.add(banner);
    gantry.position.set(s.x, s.y, s.z);
    gantry.rotation.y = yaw;
    this.group.add(gantry);

    const markMaterial = new THREE.MeshStandardMaterial({ color: '#f4f6fb', roughness: 0.7 });
    const markGeometry = new THREE.BoxGeometry(2.4, 0.03, 0.25);
    this.disposables.push(markMaterial, markGeometry);
    for (const slot of this.track.grid) {
      const mark = new THREE.Mesh(markGeometry, markMaterial);
      const sample = samples[slot.sample];
      mark.position.set(slot.x - sample.tx * 2.6, slot.y - 0.88, slot.z - sample.tz * 2.6);
      mark.rotation.y = Math.atan2(sample.tx, sample.tz);
      this.group.add(mark);
    }
  }

  /** Painted chevrons before the jump crest. */
  buildRampMarks() {
    const { ramp, samples } = this.track;
    if (!ramp) return;
    const material = new THREE.MeshStandardMaterial({ color: '#ffb02e', emissive: '#ff8a00', emissiveIntensity: 0.4 });
    const geometry = new THREE.BoxGeometry(2.6, 0.03, 0.7);
    this.disposables.push(material, geometry);
    for (let k = 0; k < 4; k++) {
      const s = samples[(ramp.start - 14 + k * 3 + samples.length) % samples.length];
      for (const lateral of [-5, 0, 5]) {
        for (const wing of [-1, 1]) {
          const chevron = new THREE.Mesh(geometry, material);
          chevron.position.set(s.x + s.nx * (lateral + wing * 0.9), s.y + 0.05, s.z + s.nz * (lateral + wing * 0.9));
          chevron.rotation.y = Math.atan2(s.tx, s.tz) + wing * 0.6;
          this.group.add(chevron);
        }
      }
    }
  }

  dispose() {
    for (const item of this.disposables) item.dispose?.();
  }
}
