import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export default class Renderer {
  constructor(application) {
    this.application = application;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.application.canvasWrap.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.application.scene, this.application.camera.instance);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35,
      0.65,
      0.9
    );
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);

    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(pixelRatio);
  }

  render() {
    this.composer.render();
  }
}
