import type { TrackDefinition } from './types.ts';

/** FNV-1a over millimetre-rounded geometry: equal fingerprints mean the same raceable track. */
export function trackFingerprint(track: TrackDefinition): string {
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    const n = Math.round(value * 1000) | 0;
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (n >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  };
  for (const s of track.samples) {
    mix(s.x);
    mix(s.y);
    mix(s.z);
  }
  for (const c of track.checkpoints) mix(c.sample);
  for (const p of track.pickups) mix(p.x + p.z);
  mix(track.width);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
