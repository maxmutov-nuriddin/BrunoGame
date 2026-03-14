import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default class Resources extends EventTarget {
  constructor() {
    super();

    this.items = {};
    this.loadingManager = new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
    this.gltfLoader = new GLTFLoader(this.loadingManager);
  }

  async load() {
    const sources = [
      { name: 'matcap', type: 'texture', path: this.createMatcapDataUrl(), label: 'Loading matcap materials...' },
      { name: 'atlas', type: 'texture', path: this.createAtlasDataUrl(), label: 'Building texture atlas...' },
      { name: 'prop', type: 'gltf', path: '/models/lowpoly-prop.gltf', label: 'Importing low-poly props...' }
    ];

    this.items.audio = {
      engine: this.createWavDataUrl(1.2, (t) => {
        const ramp = 0.7 + 0.3 * Math.sin(t * Math.PI * 2 * 0.5);
        return (
          Math.sin(t * Math.PI * 2 * 78) * 0.28 * ramp +
          Math.sin(t * Math.PI * 2 * 156) * 0.12 * ramp
        );
      }),
      ambient: this.createWavDataUrl(2.6, (t) => {
        const swell = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.18);
        return (
          Math.sin(t * Math.PI * 2 * 220) * 0.08 * swell +
          Math.sin(t * Math.PI * 2 * 330) * 0.04 +
          Math.sin(t * Math.PI * 2 * 110) * 0.05
        );
      }),
      crash: this.createWavDataUrl(0.38, (t) => {
        const fade = Math.max(0, 1 - t / 0.38);
        const noise = (Math.random() * 2 - 1) * fade;
        return noise * 0.75 + Math.sin(t * Math.PI * 2 * 80) * 0.2 * fade;
      })
    };

    this.loadingManager.onProgress = (_url, loaded, total) => {
      const progress = Math.round((loaded / total) * 100);
      const currentSource = sources[Math.max(0, loaded - 1)];
      this.dispatchEvent(
        new CustomEvent('progress', {
          detail: {
            progress,
            label: currentSource?.label ?? 'Loading world...'
          }
        })
      );
    };

    this.loadingManager.onLoad = () => {
      this.prepareLoadedAssets();
      this.dispatchEvent(
        new CustomEvent('progress', {
          detail: {
            progress: 100,
            label: 'Loading complete. Start the engine.'
          }
        })
      );
      this.dispatchEvent(new Event('ready'));
    };

    await Promise.all(
      sources.map((source) => {
        return new Promise((resolve, reject) => {
          if (source.type === 'texture') {
            this.textureLoader.load(
              source.path,
              (texture) => {
                this.items[source.name] = texture;
                resolve(texture);
              },
              undefined,
              reject
            );
          } else {
            this.gltfLoader.load(
              source.path,
              (gltf) => {
                this.items[source.name] = gltf;
                resolve(gltf);
              },
              undefined,
              reject
            );
          }
        });
      })
    );
  }

  prepareLoadedAssets() {
    this.items.matcap.colorSpace = THREE.SRGBColorSpace;
    this.items.atlas.colorSpace = THREE.SRGBColorSpace;
    this.items.atlas.wrapS = THREE.RepeatWrapping;
    this.items.atlas.wrapT = THREE.RepeatWrapping;

    this.items.prop.scene.traverse((child) => {
      if (child.isMesh) {
        child.geometry.computeVertexNormals();
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = true;
      }
    });
  }

  createAtlasTile(tileX, tileY) {
    const texture = this.items.atlas.clone();
    texture.needsUpdate = true;
    texture.repeat.set(0.25, 0.25);
    texture.offset.set(tileX * 0.25, tileY * 0.25);
    return texture;
  }

  createMatcapDataUrl() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');

    context.fillStyle = '#20263d';
    context.fillRect(0, 0, 256, 256);

    const gradient = context.createRadialGradient(104, 92, 24, 128, 128, 132);
    gradient.addColorStop(0, '#fff4c4');
    gradient.addColorStop(0.4, '#ffca66');
    gradient.addColorStop(0.72, '#d56652');
    gradient.addColorStop(1, '#101726');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);

    return canvas.toDataURL('image/png');
  }

  createAtlasDataUrl() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const palette = [
      ['#525b6d', '#2f3644'],
      ['#5ad7a1', '#2a8f70'],
      ['#ffc35a', '#e58736'],
      ['#ff7b68', '#cb4c4c'],
      ['#7ac7ff', '#4b8bc3'],
      ['#f3f5ff', '#d2d7ee'],
      ['#729c5f', '#45663a'],
      ['#f8a8d6', '#dd6ea8'],
      ['#1e2432', '#2c3344'],
      ['#ffeb99', '#ffc14f'],
      ['#b6a3ff', '#7260d2'],
      ['#f4d6b0', '#c79657'],
      ['#6be5ff', '#267cb0'],
      ['#fd8e72', '#c14a3b'],
      ['#93ffdd', '#4eb79c'],
      ['#ffffff', '#b8c4d8']
    ];

    let index = 0;

    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const left = x * 128;
        const top = y * 128;
        const [base, shade] = palette[index];

        context.fillStyle = base;
        context.fillRect(left, top, 128, 128);
        context.fillStyle = shade;

        for (let stripe = 0; stripe < 8; stripe += 1) {
          context.fillRect(left, top + stripe * 16, 128, 6);
        }

        context.globalAlpha = 0.22;
        context.fillStyle = '#ffffff';
        context.fillRect(left + 12, top + 12, 104, 24);
        context.globalAlpha = 1;
        index += 1;
      }
    }

    return canvas.toDataURL('image/png');
  }

  createWavDataUrl(duration, generator) {
    const sampleRate = 22050;
    const frameCount = Math.floor(sampleRate * duration);
    const samples = new Int16Array(frameCount);

    for (let i = 0; i < frameCount; i += 1) {
      const t = i / sampleRate;
      const sample = Math.max(-1, Math.min(1, generator(t)));
      samples[i] = sample * 32767;
    }

    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    const writeString = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i += 1) {
      view.setInt16(44 + i * 2, samples[i], true);
    }

    let binary = '';
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const slice = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...slice);
    }

    return `data:audio/wav;base64,${btoa(binary)}`;
  }
}
