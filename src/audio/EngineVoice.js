/** A small subtractive-synth engine: RPM sets pitch, load opens the filter and adds grit. */
export default class EngineVoice {
  constructor(ctx, destination, { pitch = 1, grit = 0.4, pan = false } = {}) {
    this.ctx = ctx;
    this.pitch = pitch;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 3;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = distortionCurve(grit * 40 + 5);

    this.oscillators = [
      { type: 'sawtooth', ratio: 1, gain: 0.5 },
      { type: 'square', ratio: 0.5, gain: 0.35 },
      { type: 'sawtooth', ratio: 2.01, gain: 0.12 }
    ].map(({ type, ratio, gain }) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(this.shaper);
      osc.start();
      return { osc, ratio };
    });

    // Cylinder-firing flutter: amplitude modulation on its own stage, so volume 0 is truly silent.
    this.modulated = ctx.createGain();
    this.modulated.gain.value = 1;
    this.flutter = ctx.createOscillator();
    this.flutterDepth = ctx.createGain();
    this.flutterDepth.gain.value = 0.25;
    this.flutter.connect(this.flutterDepth).connect(this.modulated.gain);
    this.flutter.start();

    this.shaper.connect(this.filter).connect(this.modulated).connect(this.out);
    if (pan && ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.out.connect(this.panner).connect(destination);
    } else {
      this.out.connect(destination);
    }
    this.update(0, 0, 0);
  }

  /**
   * @param {number} rpm 0..1 within the current gear
   * @param {number} load 0..1 throttle/drive effort
   * @param {number} volume 0..1 overall (distance attenuation for rivals)
   */
  update(rpm, load, volume, pan = 0) {
    const t = this.ctx.currentTime;
    const base = (42 + rpm * 135) * this.pitch;
    for (const { osc, ratio } of this.oscillators) osc.frequency.setTargetAtTime(base * ratio, t, 0.03);
    this.flutter.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    this.filter.frequency.setTargetAtTime(320 + (load * 0.7 + 0.3) * rpm * 3200, t, 0.05);
    this.out.gain.setTargetAtTime((0.05 + load * 0.08 + rpm * 0.05) * volume, t, 0.06);
    if (this.panner) this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
  }

  dispose() {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      for (const { osc } of this.oscillators) osc.stop();
      this.flutter.stop();
      this.out.disconnect();
    }, 300);
  }
}

function distortionCurve(amount) {
  const samples = 512;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
