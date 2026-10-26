import { generateTrack } from './generator.ts';
import type { TrackDefinition, TrackLayout, TrackTheme } from './types.ts';

export interface TrackPreset {
  id: string;
  name: string;
  seed: string;
  blurb: string;
  layout: TrackLayout;
  theme: TrackTheme;
}

/**
 * Named circuits: a seed plus a fixed layout and theme. Tests assert none of them needs the fallback.
 * Any other code picks its layout and theme from the seed, so every new code is a different circuit.
 */
export const TRACK_PRESETS: readonly TrackPreset[] = Object.freeze([
  { id: 'sunset', name: 'Sunset Loop', seed: 'SUNSET', blurb: 'Long sweepers, tight hairpins and a crest jump.', layout: 'loop', theme: 'meadow' },
  { id: 'neon', name: 'Neon Overpass', seed: 'NEON', blurb: 'Figure 8 under city lights: the road crosses itself on a bridge.', layout: 'figure8', theme: 'dusk' },
  { id: 'coral', name: 'Coral Isles', seed: 'CORAL', blurb: 'Islets joined by two bridges over the sea.', layout: 'island', theme: 'island' },
  { id: 'dunes', name: 'Dune Sprint', seed: 'DUNES', blurb: 'Wide desert sweepers, fast and dusty.', layout: 'loop', theme: 'desert' },
  { id: 'frost', name: 'Frost Bite', seed: 'FROST', blurb: 'Snowy pines and hairpins that punish late braking.', layout: 'loop', theme: 'snow' },
  { id: 'canyon', name: 'Canyon Cross', seed: 'CANYON', blurb: 'Desert figure 8 with a high overpass.', layout: 'figure8', theme: 'desert' },
  { id: 'lagoon', name: 'Lagoon Run', seed: 'LAGOON', blurb: 'Long bridges across a turquoise lagoon.', layout: 'island', theme: 'island' },
  { id: 'alpine', name: 'Alpine Knot', seed: 'ALPINE', blurb: 'Snow figure 8: climb, cross, drop.', layout: 'figure8', theme: 'snow' }
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
  const track = generateTrack(seed, preset?.name ?? `Circuit ${seed}`, preset ? { layout: preset.layout, theme: preset.theme } : {}).track;
  cache.set(seed, track);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return track;
}
