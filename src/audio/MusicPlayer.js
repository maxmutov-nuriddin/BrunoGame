const LOOKAHEAD = 0.12;
const INTERVAL_MS = 25;
const A = 220;
const semitone = (n) => A * 2 ** (n / 12);

/** Chord roots (semitones from A) and the 4-bar loops for each mood. All original, generated live. */
const SONGS = {
  menu: { bpm: 92, chords: [0, -4, 3, -2], steps: 16, swing: 0.0, drums: 'soft' },
  race: { bpm: 128, chords: [0, -4, -9, -2], steps: 16, swing: 0.0, drums: 'drive' }
};

/** Tiny step sequencer with a look-ahead scheduler. */
export default class MusicPlayer {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.song = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  play(name) {
    const song = name ? SONGS[name] : null;
    if (song === this.song) return;
    this.song = song;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!song) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), INTERVAL_MS);
  }

  schedule() {
    const song = this.song;
    if (!song) return;
    const stepTime = 60 / song.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(song, this.step, this.nextTime, stepTime);
      this.nextTime += stepTime;
      this.step = (this.step + 1) % (song.steps * song.chords.length);
    }
  }

  playStep(song, step, time, stepTime) {
    const bar = Math.floor(step / song.steps);
    const beat = step % song.steps;
    const root = song.chords[bar % song.chords.length];

    if (song.drums === 'drive') {
      if (beat % 4 === 0) this.kick(time, 0.5);
      if (beat === 4 || beat === 12) this.snare(time, 0.22);
      if (beat % 2 === 1) this.hat(time, 0.06);
      this.bass(time, semitone(root - 24) , stepTime * 0.9, beat % 2 === 0 ? 0.2 : 0.12);
      const arp = [0, 7, 12, 15, 12, 7, 3, 7];
      if (beat % 2 === 0) this.lead(time, semitone(root + arp[Math.floor(beat / 2) % arp.length]), stepTime * 1.6, 0.05);
    } else {
      if (beat === 0) this.kick(time, 0.25);
      if (beat === 8) this.snare(time, 0.06);
      if (beat === 0) this.pad(time, root, stepTime * song.steps, 0.06);
      const arp = [0, 7, 12, 7];
      if (beat % 4 === 2) this.lead(time, semitone(root + 12 + arp[Math.floor(beat / 4) % arp.length]), stepTime * 3, 0.035);
    }
  }

  voice(type, frequency, time, duration, volume, filterFrequency = 4000) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter).connect(gain).connect(this.out);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  kick(time, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    osc.connect(gain).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  noiseHit(time, type, frequency, duration, volume) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.out);
    source.start(time, Math.random());
    source.stop(time + duration + 0.02);
  }

  snare(time, volume) {
    this.noiseHit(time, 'bandpass', 1800, 0.18, volume);
  }

  hat(time, volume) {
    this.noiseHit(time, 'highpass', 7000, 0.05, volume);
  }

  bass(time, frequency, duration, volume) {
    this.voice('sawtooth', frequency, time, duration, volume, 600);
  }

  lead(time, frequency, duration, volume) {
    this.voice('square', frequency, time, duration, volume, 2600);
  }

  pad(time, root, duration, volume) {
    for (const interval of [0, 3, 7, 10]) {
      for (const detune of [-0.003, 0.003]) {
        this.voice('sawtooth', semitone(root + interval) * (1 + detune), time, duration, volume / 3, 900);
      }
    }
  }
}
