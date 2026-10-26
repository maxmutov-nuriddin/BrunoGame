const SIZE = 190;
const PADDING = 14;

/** 2D track outline with live car dots. */
export default class Minimap {
  constructor(track, colors) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE * 2;
    this.canvas.height = SIZE * 2;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(2, 2);
    this.colors = colors;
    const xs = track.samples.map((s) => s.x);
    const zs = track.samples.map((s) => s.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const scale = (SIZE - PADDING * 2) / Math.max(maxX - minX, maxZ - minZ);
    this.toMap = (x, z) => [PADDING + (x - minX) * scale + ((SIZE - PADDING * 2) - (maxX - minX) * scale) / 2, PADDING + (z - minZ) * scale + ((SIZE - PADDING * 2) - (maxZ - minZ) * scale) / 2];
    this.path = new Path2D();
    track.samples.forEach((s, i) => {
      const [x, y] = this.toMap(s.x, s.z);
      if (i === 0) this.path.moveTo(x, y);
      else this.path.lineTo(x, y);
    });
    this.path.closePath();
    // Bridges are drawn last, on top, so an overpass reads as passing over the road below it.
    this.bridgePaths = track.bridges.map(({ start, end }) => {
      const path = new Path2D();
      for (let i = start; i <= end; i++) {
        const [x, y] = this.toMap(track.samples[i].x, track.samples[i].z);
        if (i === start) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      return path;
    });
    this.start = this.toMap(track.samples[0].x, track.samples[0].z);
  }

  draw(frames, localId) {
    const c = this.ctx;
    c.clearRect(0, 0, SIZE, SIZE);
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(8,10,16,0.55)';
    c.lineWidth = 9;
    c.stroke(this.path);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 4;
    c.stroke(this.path);
    for (const bridge of this.bridgePaths) {
      c.strokeStyle = 'rgba(8,10,16,0.9)';
      c.lineWidth = 9;
      c.stroke(bridge);
      c.strokeStyle = '#7fe8ff';
      c.lineWidth = 4;
      c.stroke(bridge);
    }
    c.fillStyle = '#ffffff';
    c.fillRect(this.start[0] - 3, this.start[1] - 3, 6, 6);
    let local = null;
    for (const frame of frames.values()) {
      if (frame.id === localId) {
        local = frame;
        continue;
      }
      const [x, y] = this.toMap(frame.position.x, frame.position.z);
      c.fillStyle = frame.flags.wrecked ? '#777' : this.colors.get(frame.id) ?? '#ff4f6d';
      c.beginPath();
      c.arc(x, y, 3.6, 0, Math.PI * 2);
      c.fill();
    }
    if (local) {
      const [x, y] = this.toMap(local.position.x, local.position.z);
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#111';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 5.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }
}
