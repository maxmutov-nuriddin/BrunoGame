import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import SpeedBlurPass from './Effects/SpeedBlurPass.js';

const BASE_FOCUS = 12.5;
const BASE_APERTURE = 0.00035;
const MAX_BLUR = 0.006;
const MAX_SPEED_BLUR = 0.16;
const BLUR_SMOOTHING = 6;
// Lit values are HDR before OutputPass, so only real highlights should glow.
const BLOOM_STRENGTH = 0.3;
const BLOOM_RADIUS = 0.6;
const BLOOM_THRESHOLD = 1.8;

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
    this.renderer.toneMappingExposure = 0.5;

    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromScene(environment, 0.04);
    this.application.scene.environment = this.environmentTarget.texture;
    this.application.scene.environmentIntensity = 0.65;
    environment.dispose();
    pmrem.dispose();

    this.application.canvasWrap.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.application.scene, this.application.camera.instance);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD
    );
    this.bokehPass = new BokehPass(this.application.scene, this.application.camera.instance, {
      focus: BASE_FOCUS,
      aperture: BASE_APERTURE,
      maxblur: MAX_BLUR
    });
    this.speedBlurPass = new SpeedBlurPass();
    this.blurAmount = 0;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.speedBlurPass);
    this.composer.addPass(new OutputPass());

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

  updateEffects(delta) {
    const { car, camera } = this.application;
    const target = car.speedNormalized;
    this.blurAmount += (target - this.blurAmount) * (1 - Math.exp(-delta * BLUR_SMOOTHING));

    const focusDistance = camera.instance.position.distanceTo(car.position);
    this.bokehPass.uniforms.focus.value = focusDistance;
    this.bokehPass.uniforms.aperture.value = BASE_APERTURE * (1 + this.blurAmount * 1.5);
    this.speedBlurPass.setStrength(this.blurAmount * MAX_SPEED_BLUR);
  }

  render(delta = 0.016) {
    this.updateEffects(delta);
    this.composer.render();
  }
}
