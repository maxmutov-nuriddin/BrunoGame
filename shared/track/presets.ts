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
  { id: 'alpine', name: 'Alpine Knot', seed: 'ALPINE', blurb: 'Snow figure 8: climb, cross, drop.', layout: 'figure8', theme: 'snow' },
  { id: 'meadow8', name: 'Clover Cross', seed: 'CLOVER', blurb: 'Green figure 8 with a long overpass.', layout: 'figure8', theme: 'meadow' },
  { id: 'citylap', name: 'Night Boulevard', seed: 'BOULEVARD', blurb: 'City loop lined with towers.', layout: 'loop', theme: 'dusk' },
  { id: 'reef', name: 'Reef Runner', seed: 'REEF', blurb: 'Tight island hops between two bridges.', layout: 'island', theme: 'island' },
  { id: 'mesa', name: 'Mesa Loop', seed: 'MESA', blurb: 'Rolling desert loop with a big crest.', layout: 'loop', theme: 'desert' },
  { id: 'glacier', name: 'Glacier Bend', seed: 'GLACIER', blurb: 'Icy sweepers and late hairpins.', layout: 'loop', theme: 'snow' },
  { id: 'valley', name: 'Green Valley', seed: 'VALLEY', blurb: 'Fast, flowing countryside loop.', layout: 'loop', theme: 'meadow' },
  { id: 'neonknot', name: 'Neon Knot', seed: 'NEONKNOT', blurb: 'Downtown figure 8 under the lights.', layout: 'figure8', theme: 'dusk' },
  { id: 'atoll', name: 'Atoll Sprint', seed: 'ATOLL', blurb: 'Sea bridges and sandy islets.', layout: 'island', theme: 'island' },
  { id: 'dustbowl', name: 'Dust Bowl', seed: 'DUSTBOWL', blurb: 'Desert loop of wide, dusty corners.', layout: 'loop', theme: 'desert' },
  { id: 'frost8', name: 'Frozen Eight', seed: 'FROZEN8', blurb: 'Snowy figure 8 with a steep bridge.', layout: 'figure8', theme: 'snow' },
  { id: 'harbor', name: 'Harbor Lights', seed: 'HARBORL', blurb: 'Dusk loop of hairpins and straights.', layout: 'loop', theme: 'dusk' },
  { id: 'palms', name: 'Palm Bay', seed: 'PALMBAY', blurb: 'Lagoon loop with two long bridges.', layout: 'island', theme: 'island' },
  { id: 'prairie', name: 'Prairie Run', seed: 'PRAIRIE', blurb: 'Open meadow, big jump, three hairpins.', layout: 'loop', theme: 'meadow' },
  { id: 'oasis', name: 'Oasis Cross', seed: 'OASIS', blurb: 'Desert figure 8 around an oasis.', layout: 'figure8', theme: 'desert' },
  { id: 'tundra', name: 'Tundra Ring', seed: 'TUNDRA', blurb: 'Long snowy loop, hard braking zones.', layout: 'loop', theme: 'snow' },
  { id: 'metro8', name: 'Metro Eight', seed: 'METRO8', blurb: 'City figure 8 crossing the main street.', layout: 'figure8', theme: 'dusk' }
]);

/** A named track picked at random, never `exceptSeed` (so pressing it always changes the map). */
export function randomPreset(exceptSeed = ''): TrackPreset {
  const pool = TRACK_PRESETS.filter((p) => p.seed !== exceptSeed);
  return pool[Math.floor(Math.random() * pool.length)];
}

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
