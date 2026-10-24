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

    this.createChallenges();
    this.createSections();
  }

  createChallenges() {
    this.createSlalomChallenge();
    this.createGateChallenge();
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
