import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import SpeedBlurPass from '../Effects/SpeedBlurPass.js';

// Pixel ratio dominates GPU cost (2.0 is 4x the pixels of 1.0), so even High stays at 1.5.
const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, depthOfField: false },
  medium: { pixelRatio: 1.25, shadows: true, shadowMap: 1024, bloom: true, depthOfField: false },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 2048, bloom: true, depthOfField: true }
};
const EXPOSURE = 0.5;
// Lit values are HDR before OutputPass, so only real highlights should glow.
const BLOOM = { strength: 0.3, radius: 0.6, threshold: 1.8 };
/** Strength of the radial speed effect at full speed (a stylised zoom blur, not true motion blur). */
const MAX_SPEED_BLUR = 0.11;
const EFFECT_SMOOTHING = 6;
/** Below this the speed blur is invisible, so its full-screen pass is skipped. */
const SPEED_BLUR_EPSILON = 0.002;

/** One WebGL renderer + post chain shared by every scene (menu, garage, race). */
export default class Renderer {
  constructor(container, quality = 'high') {
    // The composer draws offscreen, so canvas MSAA would cost memory and bandwidth for nothing.
    // 'default' power preference lets laptops stay on the integrated GPU instead of the hot discrete one.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'default' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();

    this.placeholderScene = new THREE.Scene();
    this.placeholderCamera = new THREE.PerspectiveCamera();
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.placeholderScene, this.placeholderCamera);
    this.bokehPass = new BokehPass(this.placeholderScene, this.placeholderCamera, { focus: 10, aperture: 0.0004, maxblur: 0.006 });
    this.bokehPass.enabled = false;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.speedBlurPass = new SpeedBlurPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.speedBlurPass);
    this.composer.addPass(new OutputPass());

    this.speedTarget = 0;
    this.speedAmount = 0;
    this.reducedMotion = false;
    this.setQuality(quality);
    this.resize();
  }

  setView(scene, camera) {
    if (!scene.environment) scene.environment = this.environment;
    this.scene = scene;
    this.camera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.bokehPass.scene = scene;
    this.bokehPass.camera = camera;
    this.resize();
  }

  /** Depth of field for showroom and cinematic shots. Racing keeps it off so the road stays sharp. */
  setDepthOfField(options) {
    if (!options || options.enabled === false || !this.preset.depthOfField) {
      this.bokehPass.enabled = false;
      return;
    }
    this.bokehPass.enabled = true;
    this.bokehPass.uniforms.focus.value = options.focus ?? 10;
    this.bokehPass.uniforms.aperture.value = options.aperture ?? 0.0004;
    this.bokehPass.uniforms.maxblur.value = options.maxblur ?? 0.006;
  }

  /** 0..1 speed sensation for the radial blur; disabled in Reduced Motion. */
  setSpeedEffect(amount) {
    this.speedTarget = this.reducedMotion ? 0 : Math.max(0, Math.min(1, amount));
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
    if (enabled) this.speedTarget = 0;
  }

  setQuality(level) {
    const preset = QUALITY[level] ?? QUALITY.high;
    this.quality = level;
    this.preset = preset;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.bloomPass.enabled = preset.bloom;
    if (!preset.depthOfField) this.bokehPass.enabled = false;
    this.resize();
  }

  get shadowMapSize() {
    return this.preset.shadowMap;
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.preset?.pixelRatio ?? 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    if (this.camera?.isPerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  render(delta) {
    if (!this.scene || !this.camera) return;
    this.speedAmount += (this.speedTarget - this.speedAmount) * (1 - Math.exp(-delta * EFFECT_SMOOTHING));
    const blur = this.speedAmount * MAX_SPEED_BLUR;
    this.speedBlurPass.enabled = blur > SPEED_BLUR_EPSILON;
    this.speedBlurPass.setStrength(blur);
    this.composer.render(delta);
  }

  get stats() {
    const info = this.renderer.info;
    return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
  }
}
