import * as THREE from 'three';

export default class Camera {
  constructor(application) {
    this.application = application;
    this.instance = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.6, 320);
    this.instance.position.set(0, 6.6, 13.4);
    this.followPosition = new THREE.Vector3(0, 3.6, 9.4);
    this.lookAtPosition = new THREE.Vector3();
    this.offset = new THREE.Vector3(0, 5.5, 11.4);
    this.application.scene.add(this.instance);
  }

  update(delta) {
    if (!this.application.car) {
      return;
    }

    const forward = this.application.car.forward.clone();
    const desiredPosition = this.application.car.position
      .clone()
      .add(new THREE.Vector3(0, this.offset.y, 0))
      .add(forward.multiplyScalar(-this.offset.z));

    this.followPosition.lerp(desiredPosition, 1 - Math.exp(-delta * 4.5));
    this.lookAtPosition.lerp(
      this.application.car.position.clone().add(new THREE.Vector3(0, 1.7, 0)),
      1 - Math.exp(-delta * 6.5)
    );

    this.instance.position.copy(this.followPosition);
    this.instance.lookAt(this.lookAtPosition);
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight;
    this.instance.updateProjectionMatrix();
  }
}
