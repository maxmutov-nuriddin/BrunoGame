import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const SpeedBlurShader = {
  name: 'SpeedBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
    vignette: { value: 0.28 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float vignette;
    varying vec2 vUv;

    const int SAMPLES = 10;

    void main() {
      vec2 center = vec2(0.5, 0.46);
      vec2 dir = vUv - center;
      float edge = smoothstep(0.08, 0.75, length(dir));
      vec2 step = dir * strength * edge / float(SAMPLES);

      vec4 color = vec4(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        color += texture2D(tDiffuse, vUv - step * float(i));
      }
      color /= float(SAMPLES);

      float shade = 1.0 - vignette * smoothstep(0.35, 0.95, length(dir) * 1.25);
      gl_FragColor = vec4(color.rgb * shade, color.a);
    }
  `
};

export default class SpeedBlurPass extends ShaderPass {
  constructor() {
    super(SpeedBlurShader);
  }

  setStrength(value) {
    this.uniforms.strength.value = value;
  }
}
