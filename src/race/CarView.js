import * as THREE from 'three';
import { findVehicle } from '../../shared/vehicles.ts';
import { WHEEL_CONNECTIONS, WHEEL_RADIUS } from '../../shared/physics/VehiclePhysics.ts';
import { nameTagTexture } from './textures.js';

const GHOST_OPACITY = 0.42;
/** Wheel tread lugs are most of a car's triangles but only a few pixels beyond this distance. */
export const TREAD_DETAIL_DISTANCE = 12;
const TREAD_NAME = /^Tread/;
/** Fallback nitro flame origins for models without Exhaust_L / Exhaust_R nodes. */
const EXHAUST = [
  [-0.45, 0.12, 2.15],
  [0.45, 0.12, 2.15]
];

/** Visual for one car: GLB body, animated wheels, lights, nitro flames, shield and ghost states. */
export default class CarView {
  constructor(resources, { vehicleId, name, accent = '#ff4f6d', showTag = false }) {
    this.vehicle = findVehicle(vehicleId);
    this.group = new THREE.Group();
    this.group.name = `Car:${name}`;
    this.root = resources.items[this.vehicle.resource].scene.clone(true);
    this.group.add(this.root);
    this.materials = [];
    this.brakeMaterials = [];
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      // Own material copies so ghosting one car never fades another.
      node.material = node.material.clone();
      this.materials.push(node.material);
      if (node.material.name === 'BrakeLights') this.brakeMaterials.push(node.material);
    });
    this.wheels = [0, 1, 2, 3].map((index) => {
      const wheel = this.root.getObjectByName(`Wheel_${index}`);
      const holder = new THREE.Group();
      if (wheel) {
        holder.position.copy(wheel.position);
        wheel.position.set(0, 0, 0);
        holder.add(wheel);
      } else {
        holder.position.set(WHEEL_CONNECTIONS[index].x, -0.28, WHEEL_CONNECTIONS[index].z);
      }
      this.root.add(holder);
      return { holder, wheel, spin: 0 };
    });
    this.treads = [];
    for (const { wheel } of this.wheels) wheel?.traverse((node) => node.isMesh && TREAD_NAME.test(node.name) && this.treads.push(node));
    this.treadVisible = true;

    this.exhaust = ['Exhaust_L', 'Exhaust_R'].map((nodeName, i) => {
      const node = this.root.getObjectByName(nodeName);
      return node ? [node.position.x, node.position.y, node.position.z] : EXHAUST[i];
    });
    this.flames = this.exhaust.map(([x, y, z]) => {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 1.1, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: '#7fe6ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      flame.rotation.x = Math.PI / 2;
      flame.position.set(x, y, z + 0.5);
      flame.visible = false;
      this.group.add(flame);
      return flame;
    });

    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(2.9, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#59d7ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.shield.scale.set(1, 0.55, 1.15);
    this.shield.position.y = 0.4;
    this.shield.visible = false;
    this.group.add(this.shield);

    if (showTag) {
      this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(name, accent), depthTest: false, transparent: true }));
      this.tag.scale.set(3.2, 0.8, 1);
      this.tag.position.y = 2.6;
      this.tag.renderOrder = 10;
      this.group.add(this.tag);
    }
    this.ghost = false;
    this.time = 0;
  }

  setGhost(ghost) {
    if (ghost === this.ghost) return;
    this.ghost = ghost;
    for (const material of this.materials) {
      material.transparent = ghost;
      material.opacity = ghost ? GHOST_OPACITY : 1;
      material.depthWrite = !ghost;
    }
  }

  /** Apply a frame of car state. `wheels` comes from local physics; remote cars approximate it. */
  update(frame, dt) {
    this.time += dt;
    this.group.position.copy(frame.position);
    this.group.quaternion.copy(frame.quaternion);
    const wrecked = frame.flags.wrecked;
    this.root.visible = !wrecked || Math.floor(this.time * 12) % 2 === 0;
    this.setGhost(frame.flags.ghost && !wrecked);

    for (const material of this.brakeMaterials) material.emissiveIntensity = frame.flags.braking ? 3 : 0.7;
    const flicker = 0.75 + Math.sin(this.time * 60) * 0.25;
    for (const flame of this.flames) {
      flame.visible = frame.flags.nitro;
      flame.scale.set(1, 0.7 + flicker * 0.6, 1);
    }
    this.shield.visible = frame.flags.shield;
    if (this.shield.visible) this.shield.material.opacity = 0.14 + Math.sin(this.time * 8) * 0.05;

    this.wheels.forEach(({ holder, wheel }, i) => {
      if (frame.wheels) {
        const pose = frame.wheels[i];
        holder.position.y = pose.drop;
        holder.rotation.y = pose.steering;
        if (wheel) wheel.rotation.x = pose.rotation;
        return;
      }
      const rest = WHEEL_CONNECTIONS[i].y - 0.3;
      holder.position.y = rest;
      holder.rotation.y = i < 2 ? frame.steer : 0;
      this.wheels[i].spin -= (frame.forwardSpeed / WHEEL_RADIUS) * dt;
      if (wheel) wheel.rotation.x = this.wheels[i].spin;
    });
  }

  /** Level of detail: drop the tread meshes when the car is far from the camera (the tyre stays). */
  updateDetail(cameraPosition, maxDistance = TREAD_DETAIL_DISTANCE) {
    const visible = this.group.position.distanceTo(cameraPosition) < maxDistance;
    if (visible === this.treadVisible) return;
    this.treadVisible = visible;
    for (const tread of this.treads) tread.visible = visible;
  }

  /** Exhaust positions in world space for nitro trails. */
  exhaustPoints() {
    return this.exhaust.map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(this.group.matrixWorld));
  }

  dispose() {
    for (const material of this.materials) material.dispose();
    for (const flame of this.flames) {
      flame.geometry.dispose();
      flame.material.dispose();
    }
    this.shield.geometry.dispose();
    this.shield.material.dispose();
    if (this.tag) {
      this.tag.material.map.dispose();
      this.tag.material.dispose();
    }
  }
}
