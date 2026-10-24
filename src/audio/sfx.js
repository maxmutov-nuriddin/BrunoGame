/** One-shot synthesised effects. Every sound here is generated, none are sampled. */
export function playSfx(ctx, out, noise, name, { intensity = 1, pan = 0 } = {}) {
  const t = ctx.currentTime;
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panner) {
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(out);
  }
  const dest = panner ?? out;

  const tone = (type, from, to, duration, volume, delay = 0) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t + delay);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + delay + duration);
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(volume, t + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + duration);
    osc.connect(gain).connect(dest);
    osc.start(t + delay);
    osc.stop(t + delay + duration + 0.05);
  };
  const burst = (filterType, frequency, duration, volume, q = 1, delay = 0) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + duration);
    source.connect(filter).connect(gain).connect(dest);
    source.start(t + delay, Math.random());
    source.stop(t + delay + duration + 0.05);
  };

  switch (name) {
    case 'ui':
      tone('triangle', 660, 880, 0.08, 0.12);
      break;
    case 'uiBack':
      tone('triangle', 520, 330, 0.1, 0.12);
      break;
    case 'countdown':
      tone('square', 440, 440, 0.22, 0.18);
      break;
    case 'go':
      tone('square', 880, 880, 0.5, 0.22);
      tone('square', 1320, 1320, 0.5, 0.08);
      break;
    case 'launch':
      burst('bandpass', 900, 0.5, 0.35, 0.8);
      tone('sawtooth', 120, 400, 0.4, 0.12);
      break;
    case 'pickup':
      [0, 0.06, 0.12].forEach((delay, i) => tone('triangle', 660 * (1 + i * 0.25), 660 * (1 + i * 0.25), 0.1, 0.16, delay));
      break;
    case 'pulse':
      tone('square', 1400, 220, 0.18, 0.2);
      burst('highpass', 3000, 0.1, 0.15);
      break;
    case 'missile':
      burst('bandpass', 700, 0.7, 0.3, 0.6);
      tone('sawtooth', 200, 900, 0.5, 0.08);
      break;
    case 'explosion':
      burst('lowpass', 900, 0.9 * intensity + 0.2, 0.6 * intensity + 0.2, 0.7);
      tone('sine', 120, 35, 0.6, 0.5 * intensity);
      break;
    case 'shock':
      tone('sine', 900, 60, 0.6, 0.35);
      burst('bandpass', 400, 0.5, 0.35, 0.5);
      break;
    case 'mine':
      tone('square', 880, 880, 0.06, 0.12);
      tone('square', 660, 660, 0.06, 0.12, 0.09);
      break;
    case 'shield':
      tone('sine', 300, 600, 0.5, 0.18);
      tone('triangle', 450, 900, 0.5, 0.08);
      break;
    case 'shieldBlock':
      tone('triangle', 1200, 700, 0.25, 0.2);
      break;
    case 'repair':
      [0, 0.08, 0.16, 0.24].forEach((delay, i) => tone('sine', 520 + i * 130, 520 + i * 130, 0.14, 0.14, delay));
      break;
    case 'nitroCell':
      burst('bandpass', 1500, 0.4, 0.25, 2);
      tone('triangle', 400, 1200, 0.3, 0.1);
      break;
    case 'hit':
      burst('lowpass', 1200, 0.25, 0.4 * intensity + 0.1, 1);
      tone('square', 180, 80, 0.15, 0.15);
      break;
    case 'crash': {
      const v = Math.min(1, intensity);
      burst('lowpass', 500 + v * 1500, 0.15 + v * 0.35, 0.15 + v * 0.45, 0.8);
      tone('sine', 90, 40, 0.2 + v * 0.2, 0.2 + v * 0.3);
      break;
    }
    case 'wreck':
      burst('lowpass', 700, 1.4, 0.7, 0.6);
      tone('sine', 90, 25, 1.2, 0.6);
      break;
    case 'lap':
      tone('triangle', 880, 880, 0.12, 0.15);
      tone('triangle', 1175, 1175, 0.2, 0.15, 0.12);
      break;
    case 'finish':
      [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.25, 0.14, i * 0.12));
      break;
    case 'wrongWay':
      tone('sawtooth', 300, 200, 0.3, 0.12);
      break;
    case 'driftBoost':
      burst('bandpass', 1800, 0.35, 0.2, 3);
      break;
    case 'land':
      tone('sine', 80, 40, 0.25, 0.25 * intensity);
      burst('lowpass', 400, 0.2, 0.2 * intensity);
      break;
    case 'gear':
      burst('highpass', 2500, 0.05, 0.05);
      break;
    default:
      break;
  }
}
