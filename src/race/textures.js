import * as THREE from 'three';

function canvasTexture(width, height, draw, { repeat = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.anisotropy = 8;
  return texture;
}

/** Asphalt with edge lines and a dashed centre line; V repeats every 12 m of road. */
export function roadTexture() {
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#2d3440';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const shade = 40 + Math.random() * 30;
      c.fillStyle = `rgba(${shade},${shade + 4},${shade + 12},${Math.random() * 0.35})`;
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    c.fillStyle = '#f2f5fa';
    c.fillRect(w * 0.035, 0, w * 0.018, h);
    c.fillRect(w * 0.947, 0, w * 0.018, h);
    c.fillStyle = '#ffd25a';
    c.fillRect(w * 0.49, 0, w * 0.02, h * 0.45);
  });
}

export function barrierTexture(accent) {
  return canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#e9edf3';
    c.fillRect(0, 0, w, h);
    c.fillStyle = accent;
    for (let x = -h; x < w; x += 64) {
      c.beginPath();
      c.moveTo(x, h);
      c.lineTo(x + 32, h);
      c.lineTo(x + 32 + h, 0);
      c.lineTo(x + h, 0);
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(0, h - 8, w, 8);
  });
}

export function checkerTexture() {
  return canvasTexture(128, 32, (c, w, h) => {
    const size = 16;
    for (let x = 0; x < w; x += size) {
      for (let y = 0; y < h; y += size) {
        c.fillStyle = ((x + y) / size) % 2 === 0 ? '#ffffff' : '#111318';
        c.fillRect(x, y, size, size);
      }
    }
  });
}

export function bannerTexture(title, subtitle, accent) {
  return canvasTexture(1024, 256, (c, w, h) => {
    const gradient = c.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#11131b');
    gradient.addColorStop(1, '#1f2230');
    c.fillStyle = gradient;
    c.fillRect(0, 0, w, h);
    c.fillStyle = accent;
    c.fillRect(0, 0, w, 18);
    c.fillRect(0, h - 18, w, 18);
    c.fillStyle = '#ffffff';
    c.font = 'italic 900 112px "Avenir Next", "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.fillText(title, w / 2, 138);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = '600 40px "Avenir Next", "Trebuchet MS", sans-serif';
    c.fillText(subtitle, w / 2, 204);
  }, { repeat: false });
}

export function nameTagTexture(text, color) {
  return canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = 'rgba(10,12,18,0.72)';
    c.beginPath();
    c.roundRect(4, 8, w - 8, h - 16, 18);
    c.fill();
    c.fillStyle = color;
    c.fillRect(14, 20, 8, h - 40);
    c.fillStyle = '#ffffff';
    c.font = '700 30px "Avenir Next", "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2 + 6, h / 2 + 1);
  }, { repeat: false });
}

/** "?" badge for item boxes: white glyph on a soft glowing disc, transparent around it. */
export function itemBadgeTexture() {
  return canvasTexture(128, 128, (c, w, h) => {
    const glow = c.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.45, 'rgba(255,220,120,0.55)');
    glow.addColorStop(1, 'rgba(255,200,80,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    c.font = '900 84px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 10;
    c.strokeStyle = '#3a1f8f';
    c.strokeText('?', w / 2, h / 2 + 4);
    c.fillStyle = '#ffffff';
    c.fillText('?', w / 2, h / 2 + 4);
  }, { repeat: false });
}

/** Vertical fade for light beams: opaque at the bottom, gone at the top. */
export function beamTexture() {
  return canvasTexture(4, 128, (c, w, h) => {
    const fade = c.createLinearGradient(0, h, 0, 0);
    fade.addColorStop(0, 'rgba(255,255,255,0.9)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = fade;
    c.fillRect(0, 0, w, h);
  }, { repeat: false });
}
