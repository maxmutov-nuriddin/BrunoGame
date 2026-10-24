import * as THREE from 'three';
import { beamTexture, itemBadgeTexture } from '../textures.js';

const BOX_SIZE = 1.7;
const CORE_SIZE = 0.8;
const BEAM = { radius: 0.55, height: 9 };
const RING = { inner: 1.3, outer: 1.75 };
/** Boxes shift through these hues together so they read as "item" from far away, even without bloom. */
const HUE_SPEED = 0.12;
const BOX_SATURATION = 0.85;
const BOX_LIGHTNESS = 0.55;
const COLORS = { pulse: '#ff5577', missile: '#ffb020', mine: '#ff3b3b' };

/** Item boxes, projectiles and mines, pooled and keyed by server ids. */
export default class RaceProps {
  constructor(track) {
    this.group = new THREE.Group();
    this.time = 0;
    this.boxGeometry = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    this.edgeGeometry = new THREE.EdgesGeometry(this.boxGeometry);
    this.coreGeometry = new THREE.BoxGeometry(CORE_SIZE, CORE_SIZE, CORE_SIZE);
    this.beamGeometry = new THREE.CylinderGeometry(BEAM.radius * 0.6, BEAM.radius, BEAM.height, 16, 1, true);
    this.ringGeometry = new THREE.RingGeometry(RING.inner, RING.outer, 32).rotateX(-Math.PI / 2);
    this.badgeTexture = itemBadgeTexture();
    this.beamTexture = beamTexture();
    // Coloured glass shell, bright core, white edges and a "?" badge. toneMapped:false keeps them vivid
    // under the scene's low exposure, so they read on Low (no bloom) as well as High.
    const vivid = { toneMapped: false };
    this.boxMaterial = new THREE.MeshBasicMaterial({ ...vivid, color: '#8f6bff', transparent: true, opacity: 0.55, depthWrite: false });
    // The core writes no depth so the badge always draws over it (but still hides behind walls and hills).
    this.coreMaterial = new THREE.MeshBasicMaterial({ ...vivid, color: '#ffffff', depthWrite: false });
    this.edgeMaterial = new THREE.LineBasicMaterial({ ...vivid, color: '#ffffff' });
    this.badgeMaterial = new THREE.SpriteMaterial({ ...vivid, map: this.badgeTexture, depthWrite: false });
    const glow = { ...vivid, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
    this.beamMaterial = new THREE.MeshBasicMaterial({ ...glow, map: this.beamTexture, opacity: 0.22 });
    this.ringMaterial = new THREE.MeshBasicMaterial({ ...glow, opacity: 0.7 });
    this.hue = new THREE.Color();
    this.boxes = track.pickups.map((spot) => {
      const holder = new THREE.Group();
      const box = new THREE.Mesh(this.boxGeometry, this.boxMaterial);
      box.add(new THREE.LineSegments(this.edgeGeometry, this.edgeMaterial));
      const core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
      const badge = new THREE.Sprite(this.badgeMaterial);
      badge.scale.setScalar(1.3);
      badge.renderOrder = 3;
      holder.add(box, core, badge);
      holder.position.set(spot.x, spot.y + 0.3, spot.z);
      const beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      beam.position.set(spot.x, spot.y - 1 + BEAM.height / 2, spot.z);
      const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      ring.position.set(spot.x, spot.y - 0.95, spot.z);
      this.group.add(holder, beam, ring);
      return { holder, box, core, beam, ring, phase: spot.id * 0.7, baseY: spot.y + 0.3 };
    });

    this.shotGeometry = new THREE.CapsuleGeometry(0.22, 1.2, 4, 8);
    this.shotMaterials = Object.fromEntries(Object.entries(COLORS).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c })]));
    this.mineGeometry = new THREE.CylinderGeometry(0.55, 0.65, 0.25, 12);
    this.mineArmedMaterial = new THREE.MeshStandardMaterial({ color: '#2a2d36', emissive: '#ff2b2b', emissiveIntensity: 1.2 });
    this.mineIdleMaterial = new THREE.MeshStandardMaterial({ color: '#2a2d36', emissive: '#ffb020', emissiveIntensity: 0.5 });
    this.shots = new Map();
    this.mines = new Map();
  }

  update(dt, { taken, projectiles, mines }) {
    this.time += dt;
    this.hue.setHSL((this.time * HUE_SPEED) % 1, BOX_SATURATION, BOX_LIGHTNESS);
    this.boxMaterial.color.copy(this.hue);
    this.beamMaterial.color.copy(this.hue);
    this.ringMaterial.color.copy(this.hue);
    this.ringMaterial.opacity = 0.5 + Math.sin(this.time * 4) * 0.2;
    for (const [i, box] of this.boxes.entries()) {
      const visible = !taken.has(i);
      box.holder.visible = visible;
      box.beam.visible = visible;
      box.ring.visible = visible;
      if (!visible) continue;
      box.box.rotation.set(this.time * 0.9 + box.phase, this.time * 1.3 + box.phase, 0);
      box.core.rotation.set(-this.time * 1.4 + box.phase, this.time * 0.7, this.time * 1.1);
      box.holder.position.y = box.baseY + Math.sin(this.time * 2.4 + box.phase) * 0.25;
    }
    this.sync(this.shots, projectiles, (shot) => {
      const mesh = new THREE.Mesh(this.shotGeometry, this.shotMaterials[shot.kind] ?? this.shotMaterials.pulse);
      return mesh;
    }, (mesh, shot) => {
      mesh.position.set(shot.x, shot.y, shot.z);
      // Capsule points along +Y; tip it forward, then yaw it along the velocity.
      mesh.rotation.set(Math.PI / 2, Math.atan2(shot.vx, shot.vz), 0, 'YXZ');
    });
    this.sync(this.mines, mines, () => new THREE.Mesh(this.mineGeometry, this.mineIdleMaterial), (mesh, mine) => {
      mesh.position.set(mine.x, mine.y, mine.z);
      mesh.material = mine.armed && Math.floor(this.time * 4) % 2 === 0 ? this.mineArmedMaterial : this.mineIdleMaterial;
    });
  }

  sync(pool, items, create, apply) {
    const seen = new Set();
    for (const item of items) {
      seen.add(item.id);
      let mesh = pool.get(item.id);
      if (!mesh) {
        mesh = create(item);
        pool.set(item.id, mesh);
        this.group.add(mesh);
      }
      apply(mesh, item);
    }
    for (const [id, mesh] of pool) {
      if (seen.has(id)) continue;
      this.group.remove(mesh);
      pool.delete(id);
    }
  }

  dispose() {
    for (const resource of [this.boxGeometry, this.edgeGeometry, this.coreGeometry, this.beamGeometry, this.ringGeometry, this.badgeTexture, this.beamTexture,
      this.boxMaterial, this.coreMaterial, this.edgeMaterial, this.badgeMaterial, this.beamMaterial, this.ringMaterial]) resource.dispose();
    this.shotGeometry.dispose();
    Object.values(this.shotMaterials).forEach((m) => m.dispose());
    this.mineGeometry.dispose();
    this.mineArmedMaterial.dispose();
    this.mineIdleMaterial.dispose();
  }
}
