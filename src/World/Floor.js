import * as THREE from 'three';

export default class Floor {
  constructor(application) {
    this.application = application;
    this.group = new THREE.Group();
    this.group.name = 'Floor';
    this.world = {
      width: 640,
      depth: 12000,
      roadWidth: 40,
      shoulderWidth: 56,
      roadLength: 9600,
      shoulderLength: 9640
    };

    this.materials = {
      grass: new THREE.MeshStandardMaterial({ color: '#93d56f', roughness: 1 }),
      grassAlt: new THREE.MeshStandardMaterial({ color: '#a6df84', roughness: 1 }),
      road: new THREE.MeshStandardMaterial({ color: '#2f3745', roughness: 0.98 }),
      shoulder: new THREE.MeshStandardMaterial({ color: '#596172', roughness: 1 }),
      lane: new THREE.MeshStandardMaterial({
        color: '#ffe29a',
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
      }),
      edgeLine: new THREE.MeshStandardMaterial({
        color: '#f8fbff',
        roughness: 0.66,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
      }),
      warning: new THREE.MeshStandardMaterial({
        color: '#ffae58',
        roughness: 0.72,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
      }),
      curb: new THREE.MeshStandardMaterial({ color: '#d8d0c5', roughness: 1 }),
      plaza: new THREE.MeshStandardMaterial({ color: '#efe7db', roughness: 1 }),
      accent: new THREE.MeshStandardMaterial({ color: '#c3dcb1', roughness: 1 })
    };

    this.createGround();
    this.createRoad();
    this.createSidePads();
    this.createRoadDetails();
    this.createBoundaries();

    this.application.scene.add(this.group);
  }

  addMesh(size, position, material, castShadow = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    this.group.add(mesh);
    return mesh;
  }

  createGround() {
    this.addMesh([this.world.width, 1.2, this.world.depth], [0, -0.6, 0], this.materials.grass);

    this.application.physics.createBox({
      position: new THREE.Vector3(0, -0.6, 0),
      size: new THREE.Vector3(this.world.width, 1.2, this.world.depth),
      type: 'fixed',
      friction: 1.8
    });

    const patches = [
      { size: [52, 0.12, 52], position: [-150, 0.06, -140], material: this.materials.grassAlt },
      { size: [52, 0.12, 52], position: [150, 0.06, 140], material: this.materials.grassAlt },
      { size: [44, 0.12, 44], position: [-150, 0.06, 140], material: this.materials.accent },
      { size: [44, 0.12, 44], position: [150, 0.06, -140], material: this.materials.accent },
      { size: [72, 0.12, 72], position: [-170, 0.06, -380], material: this.materials.grassAlt },
      { size: [72, 0.12, 72], position: [170, 0.06, 380], material: this.materials.grassAlt },
      { size: [84, 0.12, 84], position: [-170, 0.06, 560], material: this.materials.accent },
      { size: [84, 0.12, 84], position: [170, 0.06, -560], material: this.materials.accent }
    ];

    patches.forEach(({ size, position, material }) => {
      this.addMesh(size, position, material);
    });
  }

  createRoad() {
    this.addMesh(
      [this.world.roadWidth, 0.12, this.world.roadLength],
      [0, 0.06, 0],
      this.materials.road
    );
    this.addMesh(
      [this.world.shoulderWidth, 0.06, this.world.shoulderLength],
      [0, 0.03, 0],
      this.materials.shoulder
    );

    this.application.physics.createBox({
      position: new THREE.Vector3(0, 0.03, 0),
      size: new THREE.Vector3(this.world.shoulderWidth, 0.06, this.world.shoulderLength),
      type: 'fixed',
      friction: 1.55
    });

    this.application.physics.createBox({
      position: new THREE.Vector3(0, 0.06, 0),
      size: new THREE.Vector3(this.world.roadWidth, 0.12, this.world.roadLength),
      type: 'fixed',
      friction: 1.85
    });

    const jumpRunways = [
      { size: [74, 0.08, 102], position: [0, 0.04, -300] },
      { size: [74, 0.08, 102], position: [0, 0.04, 300] }
    ];

    jumpRunways.forEach(({ size, position }) => {
      this.addMesh(size, position, this.materials.shoulder);

      this.application.physics.createBox({
        position: new THREE.Vector3(...position),
        size: new THREE.Vector3(...size),
        type: 'fixed',
        friction: 1.7
      });
    });

    const shoulders = [
      { size: [28, 0.12, 48], position: [-52, 0.06, -88] },
      { size: [28, 0.12, 48], position: [52, 0.06, 88] },
      { size: [28, 0.12, 48], position: [-52, 0.06, 88] },
      { size: [28, 0.12, 48], position: [52, 0.06, -88] }
    ];

    shoulders.forEach(({ size, position }) => {
      this.addMesh(size, position, this.materials.road);
    });
  }

  createSidePads() {
    const curbs = [
      { size: [30, 0.22, 30], position: [-52, 0.11, 88] },
      { size: [30, 0.22, 30], position: [52, 0.11, 88] },
      { size: [30, 0.22, 30], position: [-52, 0.11, -88] },
      { size: [30, 0.22, 30], position: [52, 0.11, -88] }
    ];

    curbs.forEach(({ size, position }) => {
      this.addMesh(size, position, this.materials.curb);
    });

    const pads = [
      { size: [26, 0.12, 26], position: [-52, 0.18, 88] },
      { size: [26, 0.12, 26], position: [52, 0.18, 88] },
      { size: [26, 0.12, 26], position: [-52, 0.18, -88] },
      { size: [26, 0.12, 26], position: [52, 0.18, -88] }
    ];

    pads.forEach(({ size, position }) => {
      this.addMesh(size, position, this.materials.plaza);
    });
  }

  createRoadDetails() {
    const halfRoad = this.world.roadLength * 0.5;

    for (let z = -halfRoad + 26; z <= halfRoad - 26; z += 18) {
      this.addMesh([0.9, 0.04, 7], [0, 0.13, z], this.materials.lane);
    }

    this.addMesh(
      [0.45, 0.04, this.world.roadLength - 48],
      [-this.world.roadWidth * 0.5 + 3.25, 0.13, 0],
      this.materials.edgeLine
    );
    this.addMesh(
      [0.45, 0.04, this.world.roadLength - 48],
      [this.world.roadWidth * 0.5 - 3.25, 0.13, 0],
      this.materials.edgeLine
    );

    [-334, -286, 286, 334].forEach((rowZ) => {
      for (let x = -10.5; x <= 10.5; x += 5.25) {
        this.addMesh([3, 0.05, 1], [x, 0.14, rowZ], this.materials.warning);
      }
    });
  }

  createBoundaries() {
    const halfWidth = this.world.width * 0.5 - 2;
    const halfDepth = this.world.depth * 0.5 - 2;
    const walls = [
      { position: [0, 4, -halfDepth], size: [this.world.width, 8, 2] },
      { position: [0, 4, halfDepth], size: [this.world.width, 8, 2] },
      { position: [-halfWidth, 4, 0], size: [2, 8, this.world.depth] },
      { position: [halfWidth, 4, 0], size: [2, 8, this.world.depth] }
    ];

    walls.forEach(({ position, size }) => {
      this.application.physics.createBox({
        position: new THREE.Vector3(...position),
        size: new THREE.Vector3(...size),
        type: 'fixed',
        friction: 1.8
      });
    });
  }
}
