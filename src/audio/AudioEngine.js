import EngineVoice from './EngineVoice.js';
import MusicPlayer from './MusicPlayer.js';
import { playSfx } from './sfx.js';

const NOISE_SECONDS = 2;

/**
 * All audio is synthesised with the Web Audio API (no copyrighted samples, nothing to download).
 * The context is only created after a user gesture, as browsers require.
 */
export default class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.engines = new Set();
    settings.addEventListener('change', (event) => {
      if (event.detail.key === 'volume') this.applyVolumes();
    });
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Call from a click/touch/key handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context();
      this.master = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(compressor).connect(this.ctx.destination);
      this.noise = this.createNoise();
      this.musicPlayer = new MusicPlayer(this.ctx, this.music, this.noise);
      this.createLoops();
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  applyVolumes() {
    if (!this.ctx) return;
    const { master, music, sfx } = this.settings.get('volume');
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.music.gain.setTargetAtTime(music * 0.55, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
  }

  createNoise() {
    const length = this.ctx.sampleRate * NOISE_SECONDS;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    return buffer;
  }

  /** Continuous layers driven every frame: tyre squeal, wind and nitro roar. */
  createLoops() {
    const loop = (filterType, frequency, q) => {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.sfx);
      source.start();
      return { filter, gain };
    };
    this.squeal = loop('bandpass', 1300, 6);
    this.wind = loop('lowpass', 500, 0.7);
    this.roar = loop('bandpass', 260, 1.2);
  }

  /** Per-frame race layers. All values 0..1. */
  setDriving({ skid = 0, speed = 0, nitro = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.squeal.gain.gain.setTargetAtTime(skid * 0.22, t, 0.05);
    this.squeal.filter.frequency.setTargetAtTime(1100 + skid * 600, t, 0.08);
    this.wind.gain.gain.setTargetAtTime(speed * speed * 0.16, t, 0.2);
    this.wind.filter.frequency.setTargetAtTime(300 + speed * 1400, t, 0.2);
    this.roar.gain.gain.setTargetAtTime(nitro * 0.3, t, 0.08);
  }

  silenceDriving() {
    this.setDriving({ skid: 0, speed: 0, nitro: 0 });
  }

  createEngine(character) {
    if (!this.ctx) return null;
    const voice = new EngineVoice(this.ctx, this.sfx, character);
    this.engines.add(voice);
    return voice;
  }

  releaseEngine(voice) {
    if (!voice) return;
    voice.dispose();
    this.engines.delete(voice);
  }

  play(name, options = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    playSfx(this.ctx, this.sfx, this.noise, name, options);
  }

  playMusic(track) {
    if (!this.musicPlayer) return;
    this.musicPlayer.play(track);
  }
}
