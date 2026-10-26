import { THEMES } from '../race/themes.js';

/** Ground colour of each theme seen from above (grass tiles are drawn as their average green). */
const GROUND = { meadow: '#7fb862', dusk: '#41604a' };
const ROAD = '#2b313b';
const ROAD_EDGE = '#f2f5fa';
const DECK_SHADOW = 'rgba(0, 0, 0, 0.45)';
const PADDING = 0.08;
const ISLET_STEP = 14;
const ISLET_RADIUS = 46;
const ISLET_BRIDGE_GAP = 22;

export const LAYOUT_LABELS = Object.freeze({ loop: 'Circuit', figure8: 'Figure 8 · overpass', island: 'Islands · bridges' });
export const THEME_LABELS = Object.freeze({ meadow: 'Meadow', desert: 'Desert', snow: 'Snow', dusk: 'Dusk city', island: 'Islands' });

/** Short facts for a card: "2.6 km · 3 hairpins · jump". */
export function trackFacts(track) {
  const hairpins = track.hairpins.length;
  return `${(track.length / 1000).toFixed(1)} km · ${hairpins} hairpin${hairpins === 1 ? '' : 's'}${track.ramp ? ' · jump' : ''}`;
}

/**
 * Top-down picture of a track in its theme's colours: ground or sea with islets, the road with white edges,
 * bridges drawn last with a drop shadow so an overpass visibly crosses over, and a chequered start line.
 */
export function drawTrackPreview(canvas, track) {
  const theme = THEMES[track.theme] ?? THEMES.meadow;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const g = canvas.getContext('2d');
  g.setTransform(ratio, 0, 0, ratio, 0, 0);

  const xs = track.samples.map((s) => s.x);
  const zs = track.samples.map((s) => s.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = Math.min((width * (1 - 2 * PADDING)) / (maxX - minX), (height * (1 - 2 * PADDING)) / (maxZ - minZ));
  const ox = (width - (maxX - minX) * scale) / 2;
  const oz = (height - (maxZ - minZ) * scale) / 2;
  const map = (x, z) => [ox + (x - minX) * scale, oz + (z - minZ) * scale];
  const roadWidth = Math.max(3, track.width * scale);

  if (theme.ground === 'island') {
    g.fillStyle = theme.water;
    g.fillRect(0, 0, width, height);
    drawIslets(g, track, map, scale, theme);
  } else {
    g.fillStyle = GROUND[track.theme] ?? theme.ground;
    g.fillRect(0, 0, width, height);
  }

  const stroke = (indices, color, lineWidth) => {
    g.beginPath();
    indices.forEach((i, k) => {
      const [x, y] = map(track.samples[i].x, track.samples[i].z);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokeStyle = color;
    g.lineWidth = lineWidth;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  };
  const loop = [...track.samples.keys(), 0];
  stroke(loop, ROAD_EDGE, roadWidth + 3);
  stroke(loop, ROAD, roadWidth);

  for (const { start, end } of track.bridges) {
    const span = Array.from({ length: end - start + 1 }, (_, k) => start + k);
    g.save();
    g.shadowColor = DECK_SHADOW;
    g.shadowBlur = 6;
    g.shadowOffsetY = 3;
    stroke(span, ROAD_EDGE, roadWidth + 4);
    g.restore();
    stroke(span, ROAD, roadWidth);
    stroke(span, theme.accent, Math.max(1, roadWidth * 0.18));
  }

  const s = track.samples[0];
  const [sx, sy] = map(s.x, s.z);
  g.save();
  g.translate(sx, sy);
  g.rotate(Math.atan2(s.tz, s.tx) + Math.PI / 2);
  const cell = Math.max(2, roadWidth / 4);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 === 0 ? '#ffffff' : '#111111';
      g.fillRect(-roadWidth / 2 + i * cell, -cell + j * cell, cell, cell);
    }
  }
  g.restore();
}

/** Sand discs with grass tops along the road, none where a bridge crosses open water. */
function drawIslets(g, track, map, scale, theme) {
  const nearBridge = (i) => track.bridges.some(({ start, end }) => i > start - ISLET_BRIDGE_GAP && i < end + ISLET_BRIDGE_GAP);
  const islets = [];
  for (let i = 0; i < track.samples.length; i += ISLET_STEP) {
    if (nearBridge(i)) continue;
    islets.push(map(track.samples[i].x, track.samples[i].z));
  }
  const radius = ISLET_RADIUS * scale;
  for (const [fill, r] of [[theme.sand, radius], [theme.grass, radius * 0.85]]) {
    g.fillStyle = fill;
    for (const [x, y] of islets) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/**
 * Draw previews one per frame so opening a screen never blocks on generating every track.
 * `jobs` is a list of `() => void`; returns a cancel function.
 */
export function drawLater(jobs) {
  let cancelled = false;
  let index = 0;
  const step = () => {
    if (cancelled || index >= jobs.length) return;
    jobs[index++]();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
  };
}
