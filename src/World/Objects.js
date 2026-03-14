import * as THREE from 'three';
import { gsap } from 'gsap';
import ProjectsSection from './Sections/ProjectsSection.js';
import SkillsSection from './Sections/SkillsSection.js';
import AboutSection from './Sections/AboutSection.js';
import ContactSection from './Sections/ContactSection.js';

export default class Objects {
  constructor(application) {
    this.application = application;
    this.group = new THREE.Group();
    this.sections = [];
    this.scaleTarget = new THREE.Vector3(1, 1, 1);

    this.application.scene.add(this.group);

    this.createBuildings();
    this.createRamps();
    this.createChallenges();
    this.createObstacles();
    this.createDecor();
    this.createSections();
  }

  createBuildings() {
    const matcap = this.application.resources.items.matcap;
    const colors = ['#ffb347', '#6de0b4', '#ffa2a2', '#7bb8ff', '#f7f8ff'];
    const footprints = [
      [-110, 3.4, -70, 18, 6.8, 18],
      [110, 4.6, 70, 20, 9.2, 16],
      [-110, 5.4, 70, 18, 10.8, 16],
      [110, 6, -70, 18, 12, 18],
      [-122, 3, 0, 12, 6, 22],
      [122, 3.8, 0, 12, 7.6, 22],
      [0, 2.8, -128, 26, 5.6, 14],
      [0, 3.8, 128, 24, 7.6, 14],
      [-132, 3.6, -260, 16, 7.2, 20],
      [132, 4.4, 260, 18, 8.8, 18],
      [-132, 5.2, 260, 18, 10.4, 18],
      [132, 5.8, -260, 18, 11.6, 20],
      [-146, 3.8, -420, 18, 7.6, 20],
      [146, 4.8, 420, 20, 9.6, 20],
      [-146, 4.6, 540, 18, 9.2, 18],
      [146, 3.8, -540, 18, 7.6, 18],
      [0, 3.6, -620, 28, 7.2, 18],
      [0, 3.2, 620, 26, 6.4, 18]
    ];

    footprints.forEach(([x, y, z, width, height, depth], index) => {
      const material = new THREE.MeshMatcapMaterial({
        matcap,
        color: colors[index % colors.length]
      });
      const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      building.position.set(x, y * 0.5, z);
      building.castShadow = true;
      building.receiveShadow = true;
      building.frustumCulled = true;
      this.group.add(building);

      this.application.physics.createBox({
        position: new THREE.Vector3(x, y * 0.5, z),
        size: new THREE.Vector3(width, height, depth),
        type: 'fixed',
        friction: 1.7
      });
    });
  }

  createRamps() {
    this.createJumpSet({
      centerZ: -300,
      title: 'JUMP 01',
      subtitle: 'tabletop takeoff',
      accent: '#ffb347'
    });
    this.createJumpSet({
      centerZ: 300,
      title: 'JUMP 02',
      subtitle: 'big air runway',
      accent: '#ff7b68'
    });
  }

  createObstacles() {
    const matcap = this.application.resources.items.matcap;
    const barrelMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#ff7b68' });
    const crateMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#ffc35a' });

    const obstacles = [
      { type: 'barrel', position: [-64, 0.55, 24] },
      { type: 'barrel', position: [64, 0.55, -24] },
      { type: 'crate', position: [72, 0.65, 56] },
      { type: 'crate', position: [-72, 0.65, -56] },
      { type: 'crate', position: [86, 0.65, -92] }
    ];

    obstacles.forEach(({ type, position }) => {
      let mesh;

      if (type === 'barrel') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.1, 10), barrelMaterial);
        mesh.position.set(...position);

        this.application.physics.createCylinder({
          position: new THREE.Vector3(...position),
          radius: 0.58,
          height: 1.1,
          type: 'fixed',
          friction: 1.4
        });
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMaterial);
        mesh.position.set(...position);

        this.application.physics.createBox({
          position: new THREE.Vector3(...position),
          size: new THREE.Vector3(1.2, 1.2, 1.2),
          type: 'fixed',
          friction: 1.6
        });
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.group.add(mesh);
    });
  }

  createChallenges() {
    this.createSlalomChallenge();
    this.createGateChallenge();
  }

  createJumpSet({ centerZ, title, subtitle, accent }) {
    const atlasTile = this.application.resources.createAtlasTile(2, 2);
    atlasTile.repeat.set(1.75, 1.75);
    atlasTile.needsUpdate = true;

    const matcap = this.application.resources.items.matcap;
    const rampMaterial = new THREE.MeshStandardMaterial({
      color: '#f4d6b0',
      roughness: 0.94,
      map: atlasTile
    });
    const stripeMaterial = new THREE.MeshMatcapMaterial({ matcap, color: accent });
    const beaconMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#f7f8ff' });

    const width = 22;
    const slopeDepth = 12;
    const deckDepth = 8;
    const angle = Math.PI / 28;
    const roadTop = 0.12;
    const rampHeight = slopeDepth * Math.sin(angle);
    const totalHalfDepth = deckDepth * 0.5 + slopeDepth;

    this.createChallengeBanner({
      z: centerZ,
      title,
      subtitle,
      color: accent
    });

    [
      centerZ + totalHalfDepth + 2,
      centerZ + totalHalfDepth + 6,
      centerZ - totalHalfDepth - 2,
      centerZ - totalHalfDepth - 6
    ].forEach((stripeZ) => {
      for (let x = -10; x <= 10; x += 5) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.9), stripeMaterial);
        stripe.position.set(x, 0.14, stripeZ);
        stripe.castShadow = true;
        stripe.receiveShadow = true;
        stripe.frustumCulled = true;
        this.group.add(stripe);
      }
    });

    const jump = new THREE.Mesh(
      this.createTabletopGeometry(width, rampHeight, deckDepth, slopeDepth),
      rampMaterial
    );
    jump.position.set(0, roadTop, centerZ);
    jump.castShadow = true;
    jump.receiveShadow = true;
    jump.frustumCulled = true;
    this.group.add(jump);

    this.application.physics.createConvexHull({
      position: new THREE.Vector3(0, roadTop, centerZ),
      points: this.createTabletopHullPoints(width, rampHeight, deckDepth, slopeDepth),
      type: 'fixed',
      friction: 2.35,
      contactSkin: 0.02
    });

    [
      [-13, centerZ + totalHalfDepth],
      [13, centerZ + totalHalfDepth],
      [-13, centerZ - totalHalfDepth],
      [13, centerZ - totalHalfDepth]
    ].forEach(([x, z]) => {
      const beacon = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.1, 8), beaconMaterial);
      beacon.position.set(x, 1.08, z);
      beacon.castShadow = true;
      beacon.receiveShadow = true;
      beacon.frustumCulled = true;
      this.group.add(beacon);
    });
  }

  createTabletopGeometry(width, height, deckDepth, slopeDepth) {
    const halfWidth = width * 0.5;
    const deckHalfDepth = deckDepth * 0.5;
    const totalHalfDepth = deckHalfDepth + slopeDepth;
    const vertices = new Float32Array([
      -halfWidth, 0, totalHalfDepth,
      halfWidth, 0, totalHalfDepth,
      -halfWidth, 0, -totalHalfDepth,
      halfWidth, 0, -totalHalfDepth,
      -halfWidth, height, deckHalfDepth,
      halfWidth, height, deckHalfDepth,
      -halfWidth, height, -deckHalfDepth,
      halfWidth, height, -deckHalfDepth
    ]);
    const indices = [
      0, 2, 1,
      1, 2, 3,
      0, 1, 4,
      1, 5, 4,
      4, 5, 6,
      5, 7, 6,
      6, 7, 2,
      7, 3, 2,
      0, 4, 6,
      0, 6, 2,
      1, 3, 7,
      1, 7, 5
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  createTabletopHullPoints(width, height, deckDepth, slopeDepth) {
    const halfWidth = width * 0.5;
    const deckHalfDepth = deckDepth * 0.5;
    const totalHalfDepth = deckHalfDepth + slopeDepth;

    return new Float32Array([
      -halfWidth, 0, totalHalfDepth,
      halfWidth, 0, totalHalfDepth,
      -halfWidth, 0, -totalHalfDepth,
      halfWidth, 0, -totalHalfDepth,
      -halfWidth, height, deckHalfDepth,
      halfWidth, height, deckHalfDepth,
      -halfWidth, height, -deckHalfDepth,
      halfWidth, height, -deckHalfDepth
    ]);
  }

  createSlalomChallenge() {
    const matcap = this.application.resources.items.matcap;
    const coneMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#ff9e57' });
    const baseMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#1f2430' });
    const coneGeometry = new THREE.ConeGeometry(0.36, 0.92, 9);
    const baseGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 9);
    const positions = [
      [-8, -242],
      [8, -216],
      [-8, -190],
      [8, -164],
      [-8, -138]
    ];

    this.createChallengeBanner({
      z: -190,
      title: 'SLALOM',
      subtitle: 'weave the cones',
      color: '#7af7d0'
    });

    positions.forEach(([x, z]) => {
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.set(x, 0.52, z);
      cone.castShadow = true;
      cone.receiveShadow = true;
      cone.frustumCulled = true;
      this.group.add(cone);

      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.set(x, 0.07, z);
      base.castShadow = true;
      base.receiveShadow = true;
      base.frustumCulled = true;
      this.group.add(base);

      this.application.physics.createCylinder({
        position: new THREE.Vector3(x, 0.4, z),
        radius: 0.26,
        height: 0.8,
        type: 'fixed',
        friction: 1.4
      });
    });
  }

  createGateChallenge() {
    const matcap = this.application.resources.items.matcap;
    const barrelMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#7ac7ff' });
    const gateRows = [
      { z: 154, gapX: 7.4 },
      { z: 188, gapX: 6.2 },
      { z: 222, gapX: 5.6 },
      { z: 256, gapX: 6.8 }
    ];

    this.createChallengeBanner({
      z: 206,
      title: 'GATES',
      subtitle: 'precision squeeze',
      color: '#7ac7ff'
    });

    gateRows.forEach(({ z, gapX }) => {
      [-gapX, gapX].forEach((x) => {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.62, 1.1, 10),
          barrelMaterial
        );
        barrel.position.set(x, 0.55, z);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        barrel.frustumCulled = true;
        this.group.add(barrel);

        this.application.physics.createCylinder({
          position: new THREE.Vector3(x, 0.55, z),
          radius: 0.58,
          height: 1.1,
          type: 'fixed',
          friction: 1.4
        });
      });
    });
  }

  createDecor() {
    const treeTrunkMaterial = new THREE.MeshMatcapMaterial({
      matcap: this.application.resources.items.matcap,
      color: '#8f6b4f'
    });
    const treeTopMaterial = new THREE.MeshMatcapMaterial({
      matcap: this.application.resources.items.matcap,
      color: '#6de0b4'
    });

    const treeSpots = [
      [-150, 0, -120],
      [-150, 0, 120],
      [150, 0, 120],
      [150, 0, -120],
      [-90, 0, 150],
      [90, 0, -150],
      [-150, 0, 24],
      [150, 0, -24],
      [-180, 0, -340],
      [180, 0, 340],
      [-180, 0, 520],
      [180, 0, -520]
    ];

    treeSpots.forEach(([x, y, z]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.8, 7), treeTrunkMaterial);
      trunk.position.y = 0.9;
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 7), treeTopMaterial);
      top.position.y = 2.6;
      tree.add(trunk, top);
      tree.position.set(x, y, z);
      tree.traverse((child) => {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = true;
      });
      this.group.add(tree);
    });

    const gltfProp = this.application.resources.items.prop.scene;
    const propPositions = [
      [-138, 0.5, -18],
      [138, 0.5, 18],
      [-18, 0.5, -138],
      [18, 0.5, 138],
      [-30, 0.5, -340],
      [30, 0.5, 340]
    ];

    propPositions.forEach(([x, y, z], index) => {
      const clone = gltfProp.clone(true);
      clone.position.set(x, y, z);
      clone.scale.setScalar(1.3 + (index % 2) * 0.4);
      clone.rotation.y = index * Math.PI * 0.5;
      clone.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshMatcapMaterial({
            matcap: this.application.resources.items.matcap,
            color: ['#7ac7ff', '#ffc35a', '#f8a8d6', '#93ffdd'][index % 4]
          });
        }
      });
      this.group.add(clone);
    });
  }

  createSections() {
    [ProjectsSection, SkillsSection, AboutSection, ContactSection].forEach((definition) => {
      this.sections.push(this.createSectionSign(definition));
    });
  }

  createSectionSign(definition) {
    const sign = new THREE.Group();
    sign.position.copy(definition.position);
    sign.userData.definition = definition;

    const poleMaterial = new THREE.MeshMatcapMaterial({
      matcap: this.application.resources.items.matcap,
      color: '#f3f5ff'
    });
    const boardMaterial = new THREE.MeshMatcapMaterial({
      matcap: this.application.resources.items.matcap,
      color: definition.accent
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.4, 10), poleMaterial);
    pole.position.y = 1.2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.45, 0.22), boardMaterial);
    board.position.set(0, 2.2, 0);

    const labelTexture = this.createLabelTexture(definition);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 0.92),
      new THREE.MeshBasicMaterial({
        map: labelTexture,
        transparent: true
      })
    );
    label.position.set(0, 2.2, 0.13);

    sign.add(pole, board, label);
    sign.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    });
    this.group.add(sign);

    gsap.to(sign.position, {
      y: definition.position.y + 0.35,
      duration: 1.8 + Math.random() * 0.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });

    gsap.to(sign.rotation, {
      y: 0.12,
      duration: 2.4,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });

    return {
      ...definition,
      group: sign,
      label
    };
  }

  createLabelTexture(definition) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 196;
    const context = canvas.getContext('2d');

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(7, 14, 24, 0.9)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = definition.accent;
    context.fillRect(0, 0, canvas.width, 18);

    context.fillStyle = '#f5f7ff';
    context.font = '700 70px "Avenir Next", "Trebuchet MS", sans-serif';
    context.fillText(definition.title, 30, 92);

    context.fillStyle = 'rgba(245, 247, 255, 0.72)';
    context.font = '400 28px "Avenir Next", "Trebuchet MS", sans-serif';
    context.fillText(definition.signline, 30, 142);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createChallengeBanner({ z, title, subtitle, color }) {
    const matcap = this.application.resources.items.matcap;
    const postMaterial = new THREE.MeshMatcapMaterial({ matcap, color: '#f3f5ff' });
    const boardMaterial = new THREE.MeshMatcapMaterial({ matcap, color });
    const texture = this.createBannerTexture({ title, subtitle, color });
    const banner = new THREE.Group();
    const postHeight = 4.9;

    banner.position.set(0, 0, z);

    [-13, 13].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, postHeight, 0.45), postMaterial);
      post.position.set(x, postHeight * 0.5, 0);
      post.castShadow = true;
      post.receiveShadow = true;
      banner.add(post);
    });

    const board = new THREE.Mesh(new THREE.BoxGeometry(12.8, 1.9, 0.45), boardMaterial);
    board.position.set(0, 4.7, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    banner.add(board);

    [-0.24, 0.24].forEach((offsetZ, index) => {
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(11.5, 1.3),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true
        })
      );
      label.position.set(0, 4.7, offsetZ);

      if (index === 1) {
        label.rotation.y = Math.PI;
      }

      banner.add(label);
    });

    banner.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    });

    this.group.add(banner);
  }

  createBannerTexture({ title, subtitle, color }) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(7, 14, 24, 0.94)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, 26);

    context.fillStyle = '#f5f7ff';
    context.font = '700 110px "Avenir Next", "Trebuchet MS", sans-serif';
    context.textAlign = 'center';
    context.fillText(title, canvas.width * 0.5, 138);

    context.fillStyle = 'rgba(245, 247, 255, 0.72)';
    context.font = '400 38px "Avenir Next", "Trebuchet MS", sans-serif';
    context.fillText(subtitle, canvas.width * 0.5, 196);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  update(delta, carPosition) {
    const pulse = 1 + Math.sin(performance.now() * 0.0024) * 0.02;

    this.sections.forEach((section) => {
      const distance = section.group.position.distanceTo(carPosition);
      const active = distance < section.radius;
      const targetScale = active ? 1.1 : pulse;
      this.scaleTarget.setScalar(targetScale);
      section.group.scale.lerp(this.scaleTarget, 1 - Math.exp(-delta * 5));
      section.label.material.opacity = active ? 1 : 0.86;
    });
  }

  getNearestSection(position) {
    let nearest = null;
    let distance = Infinity;

    this.sections.forEach((section) => {
      const currentDistance = section.group.position.distanceTo(position);

      if (currentDistance < section.radius && currentDistance < distance) {
        nearest = section;
        distance = currentDistance;
      }
    });

    return nearest;
  }
}
