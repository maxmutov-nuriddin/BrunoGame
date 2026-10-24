import { generateTrack } from './generator.ts';
import type { TrackDefinition } from './types.ts';

export interface TrackPreset {
  id: string;
  name: string;
  seed: string;
  blurb: string;
}

/** Named circuits. Each is just a seed for the generator; tests assert none of them needs the fallback. */
export const TRACK_PRESETS: readonly TrackPreset[] = Object.freeze([
  { id: 'sunset', name: 'Sunset Loop', seed: 'SUNSET', blurb: 'Fast sweepers and a big crest jump.' },
  { id: 'neon', name: 'Neon Hairpins', seed: 'NEON', blurb: 'Three hairpins: drift or lose time.' },
  { id: 'harbor', name: 'Harbor Ring', seed: 'HARBOR', blurb: 'Short, tight and busy.' },
  { id: 'canyon', name: 'Canyon Run', seed: 'CANYON', blurb: 'Rolling elevation, long straights.' },
  { id: 'pixel', name: 'Pixel Park', seed: 'PIXEL', blurb: 'Technical middle sector.' }
]);

/** Generation costs ~10 ms (up to ~60 ms); keep recent tracks, but bounded so custom seeds cannot grow memory. */
const CACHE_LIMIT = 32;
const cache = new Map<string, TrackDefinition>();

/** Generate (and memoise in a small LRU) the track for a seed; named presets keep their display name. */
export function trackForSeed(seed: string): TrackDefinition {
  const cached = cache.get(seed);
  if (cached) {
    cache.delete(seed);
    cache.set(seed, cached);
    return cached;
  }
  const preset = TRACK_PRESETS.find((p) => p.seed === seed);
  const track = generateTrack(seed, preset?.name ?? `Circuit ${seed}`).track;
  cache.set(seed, track);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return track;
}
