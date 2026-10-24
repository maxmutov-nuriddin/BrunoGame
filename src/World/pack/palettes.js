const PALETTES = Object.freeze([
  { name: 'Clear day', sky: '#89d2ff', hemiSky: '#fff3ca', hemiGround: '#4980a8', sun: '#fff8d2' },
  { name: 'Golden hour', sky: '#ffc08a', hemiSky: '#ffe2b8', hemiGround: '#8a6f9e', sun: '#ffb870' },
  { name: 'Mint morning', sky: '#aef0dc', hemiSky: '#f4fff0', hemiGround: '#5aa08e', sun: '#fffbe0' },
  { name: 'Lilac dusk', sky: '#b8a6ff', hemiSky: '#f1e4ff', hemiGround: '#5a56a8', sun: '#ffd6f0' }
]);

export const pickPalette = (rng) => rng.pick(PALETTES);
