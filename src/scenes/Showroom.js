import * as THREE from 'three';
import CarView from '../race/CarView.js';

const ORBIT_RADIUS = 10.5;
/** Shift the projection so the car sits right of the menu column on wide screens. */
const VIEW_SHIFT = 0.2;
const ORBIT_SPEED = 0.12;
const TURNTABLE_SPEED = 0.35;

/** Studio backdrop for menus: the selected car on a turntable with soft light and depth of field. */
export default class Showroom {
  constructor(resources) {
    this.resources = resources;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#151823');
    this.scene.fog = new THREE.Fog('#151823', 14, 42);
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
    this.time = 0;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({ color: '#1d2130', roughness: 0.35, metalness: 0.4 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = true;
    this.turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.8, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: '#262b3d', roughness: 0.3, metalness: 0.6, emissive: '#3b2bff', emissiveIntensity: 0.12 })
    );
    this.turntable.position.y = -0.58;
    this.turntable.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.75, 0.035, 8, 96),
      new THREE.MeshBasicMaterial({ color: '#ff4f6d' })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.5;
    this.scene.add(floor, this.turntable, ring);

    const key = new THREE.SpotLight('#fff1e0', 160, 40, 0.6, 0.6);
    key.position.set(6, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.SpotLight('#5ad7ff', 90, 40, 0.7, 0.8);
    rim.position.set(-7, 5, -6);
    const fill = new THREE.HemisphereLight('#c9d6ff', '#1a1420', 0.8);
    this.scene.add(key, key.target, rim, rim.target, fill);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.carView = null;
    this.vehicleId = null;
    this.resize();
  }

  showVehicle(vehicleId) {
    if (vehicleId === this.vehicleId) return;
    this.vehicleId = vehicleId;
    if (this.carView) {
      this.holder.remove(this.carView.group);
      this.carView.dispose();
    }
    this.carView = new CarView(this.resources, { vehicleId, name: '' });
    this.holder.add(this.carView.group);
    this.carView.group.position.y = 0.08;
    this.pop = 0;
  }

  update(dt, reducedMotion = false) {
    this.time += dt;
    this.holder.rotation.y += dt * (reducedMotion ? 0.08 : TURNTABLE_SPEED);
    this.turntable.rotation.y = this.holder.rotation.y;
    if (this.carView) {
      this.pop = Math.min(1, (this.pop ?? 1) + dt * 3);
      const scale = 0.85 + 0.15 * (1 - Math.pow(1 - this.pop, 3));
      this.carView.group.scale.setScalar(scale);
    }
    const angle = reducedMotion ? 0.6 : 0.6 + Math.sin(this.time * ORBIT_SPEED) * 0.5;
    this.camera.position.set(Math.sin(angle) * ORBIT_RADIUS, 2.1 + Math.sin(this.time * 0.3) * (reducedMotion ? 0 : 0.15), Math.cos(angle) * ORBIT_RADIUS);
    this.camera.lookAt(0, 0.3, 0);
  }

  focusDistance() {
    return this.camera.position.length();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    if (width > 820) this.camera.setViewOffset(width, height, -width * VIEW_SHIFT, 0, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.carView?.dispose();
  }
}
