import * as THREE from 'three';

/** Analogue dial sweep: needle angle at 0 and at full scale (radians, 0 = pointing up, positive = left). */
const SWEEP_START = (3 * Math.PI) / 4;
const SWEEP_END = -(3 * Math.PI) / 4;
const DIAL_TEXTURE_SIZE = 256;
const SCREEN_SIZE = [512, 256];
/** A digital screen redraws at most this often (it only uploads when the shown numbers change). */
const SCREEN_MIN_INTERVAL = 1 / 20;
const NEEDLE_RESPONSE = 12;
const KMH_PER_MS = 3.6;

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

/** Static dial face: ring, ticks every `step`, numbers every `labelEvery` ticks, optional red zone. */
function dialTexture({ max, step, labelEvery, face, ink, accent, label, redFrom = null }) {
  const c = canvas(DIAL_TEXTURE_SIZE, DIAL_TEXTURE_SIZE);
  const g = c.getContext('2d');
  const r = DIAL_TEXTURE_SIZE / 2;
  g.fillStyle = face;
  g.beginPath();
  g.arc(r, r, r - 2, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = accent;
  g.stroke();
  const angleFor = (value) => SWEEP_START + (SWEEP_END - SWEEP_START) * (value / max);
  const point = (angle, radius) => [r - Math.sin(angle) * radius, r - Math.cos(angle) * radius];
  if (redFrom !== null) {
    g.strokeStyle = '#ff3344';
    g.lineWidth = 10;
    g.beginPath();
    // Canvas angles run clockwise from +x; dial angles run counter-clockwise from straight up.
    g.arc(r, r, r - 22, -Math.PI / 2 - angleFor(redFrom), -Math.PI / 2 - angleFor(max));
    g.stroke();
  }
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 26px system-ui, sans-serif';
  for (let i = 0, value = 0; value <= max + 1e-6; i++, value += step) {
    const angle = angleFor(value);
    const major = i % labelEvery === 0;
    const [x0, y0] = point(angle, r - 14);
    const [x1, y1] = point(angle, r - (major ? 36 : 26));
    g.lineWidth = major ? 5 : 2;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    if (major) {
      const [tx, ty] = point(angle, r - 60);
      g.fillText(String(Math.round(value)), tx, ty);
    }
  }
  g.font = 'bold 22px system-ui, sans-serif';
  g.fillStyle = accent;
  g.fillText(label, r, r + 52);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Round analogue gauge facing the driver (+Z): textured face, bezel and a needle on a pivot.
 * `read(state)` returns the value to show; `update` turns the needle.
 */
export class Dial {
  constructor({ radius, max, step, labelEvery, label, read, colors, redFrom = null }) {
    this.group = new THREE.Group();
    this.max = max;
    this.read = read;
    this.texture = dialTexture({ max, step, labelEvery, label, redFrom, ...colors });
    this.faceMaterial = new THREE.MeshBasicMaterial({ map: this.texture });
    this.faceGeometry = new THREE.CircleGeometry(radius, 40);
    this.group.add(new THREE.Mesh(this.faceGeometry, this.faceMaterial));
    this.bezelGeometry = new THREE.TorusGeometry(radius, radius * 0.07, 6, 40);
    this.bezelMaterial = new THREE.MeshStandardMaterial({ color: colors.bezel, metalness: 0.8, roughness: 0.3 });
    this.group.add(new THREE.Mesh(this.bezelGeometry, this.bezelMaterial));
    this.needle = new THREE.Group();
    this.needle.position.z = 0.004;
    this.needleGeometry = new THREE.BoxGeometry(radius * 0.06, radius * 0.82, 0.003).translate(0, radius * 0.33, 0);
    this.needleMaterial = new THREE.MeshBasicMaterial({ color: colors.needle });
    this.needle.add(new THREE.Mesh(this.needleGeometry, this.needleMaterial));
    this.group.add(this.needle);
    this.value = 0;
  }

  update(state, dt) {
    const target = THREE.MathUtils.clamp(this.read(state), 0, this.max);
    // A little inertia, like a real needle.
    this.value += (target - this.value) * (1 - Math.exp(-dt * NEEDLE_RESPONSE));
    this.needle.rotation.z = SWEEP_START + (SWEEP_END - SWEEP_START) * (this.value / this.max);
  }

  dispose() {
    for (const item of [this.texture, this.faceMaterial, this.faceGeometry, this.bezelGeometry, this.bezelMaterial, this.needleGeometry, this.needleMaterial]) item.dispose();
  }
}

/** Digital display: big speed, rev bar and nitro bar; redrawn only when what it shows changes. */
export class Screen {
  constructor({ width, height, colors, showRevs = true }) {
    this.canvas = canvas(...SCREEN_SIZE);
    this.context = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.geometry = new THREE.PlaneGeometry(width, height);
    this.group = new THREE.Group();
    this.group.add(new THREE.Mesh(this.geometry, this.material));
    this.colors = colors;
    this.showRevs = showRevs;
    this.shown = '';
    this.since = SCREEN_MIN_INTERVAL;
  }

  update(state, dt) {
    this.since += dt;
    const speed = Math.round(state.kmh);
    const revs = Math.round(state.revs * 20);
    const nitro = Math.round(state.nitro * 20);
    const key = `${speed}|${revs}|${nitro}|${state.boosting}`;
    if (key === this.shown || this.since < SCREEN_MIN_INTERVAL) return;
    this.shown = key;
    this.since = 0;
    this.draw(speed, revs / 20, nitro / 20, state.boosting);
  }

  draw(speed, revs, nitro, boosting) {
    const g = this.context;
    const [w, h] = SCREEN_SIZE;
    const { face, ink, accent } = this.colors;
    g.fillStyle = face;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.font = 'bold 150px system-ui, sans-serif';
    g.fillText(String(speed), w * 0.66, h * 0.72);
    g.textAlign = 'left';
    g.font = 'bold 40px system-ui, sans-serif';
    g.fillStyle = accent;
    g.fillText('km/h', w * 0.69, h * 0.72);
    if (this.showRevs) {
      for (let i = 0; i < 20; i++) {
        g.fillStyle = i / 20 < revs ? (i >= 16 ? '#ff3344' : accent) : 'rgba(255,255,255,0.12)';
        g.fillRect(24 + i * 23.4, 14, 18, 22);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(24, h - 34, w - 48, 16);
    g.fillStyle = boosting ? '#7fe8ff' : '#2fa7ff';
    g.fillRect(24, h - 34, (w - 48) * nitro, 16);
    g.font = 'bold 22px system-ui, sans-serif';
    g.fillStyle = ink;
    g.fillText('NITRO', 24, h - 44);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}

/**
 * What every instrument reads. Revs imitate a gearbox: they climb through each gear's speed band and drop
 * on the shift, and idle when standing still.
 */
export function instrumentState(frame, gearKmh) {
  const kmh = frame.speed * KMH_PER_MS;
  const band = (kmh % gearKmh) / gearKmh;
  const revs = kmh < 3 ? 0.12 : 0.28 + 0.68 * band;
  return { kmh, revs, nitro: (frame.nitro ?? 0) / 100, boosting: Boolean(frame.flags?.nitro) };
}
