/**
 * Interior of every car (cockpit camera), matched to its exterior model (scripts/cars/designs.mjs).
 * `cabin` is that model's cabin in car space (front -Z): belt line height, windscreen base and top [z, y],
 * roof height (null for open cars) and cabin width. The eye, dashboard, wheel and gauges are placed from it.
 *
 * wheel.type: round | flat (D-shaped) | rally (deep dish, top marker) | retro (thin rim, wood) | yoke | bus
 * cluster:    twin (rev + speed dials) | single (big speed dial + screen) | digital (wide screen)
 *             | triple (three small rally dials) | tablet (centre screen only) | retro (cream twin dials + clock trio)
 * frame:      pillars (roof car) | cage (roll-cage tubes) | open (windscreen frame only)
 */
const DARK_DIAL = { face: '#0d0f13', ink: '#e9eef5', needle: '#ff3b3b', bezel: '#5c636e' };

export const COCKPIT_STYLES = Object.freeze({
  'bruno-gt': {
    cabin: { belt: 0.31, screen: [[-0.5, 0.3], [0.1, 0.66]], roof: 0.66, width: 1.5 },
    dash: '#16181d', trim: '#2b2f37', accent: '#ff3b4f', frame: 'pillars',
    wheel: { type: 'round', radius: 0.17, color: '#15171c', accent: '#ff3b4f' },
    cluster: 'twin', dial: { ...DARK_DIAL, accent: '#ff3b4f' }, gearKmh: 34
  },
  'atlas-hauler': {
    cabin: { belt: 0.49, screen: [[-0.72, 0.48], [-0.38, 1.06]], roof: 1.07, width: 1.66 },
    dash: '#2f2b26', trim: '#4a443b', accent: '#ffb020', frame: 'pillars',
    wheel: { type: 'round', radius: 0.21, color: '#1c1b19', accent: '#ffb020', spokes: 4 },
    cluster: 'twin', dial: { face: '#141210', ink: '#f2e6cc', needle: '#ffb020', bezel: '#8a7f6a', accent: '#ffb020' }, gearKmh: 28
  },
  'pixel-hatch': {
    cabin: { belt: 0.36, screen: [[-0.85, 0.35], [-0.2, 0.9]], roof: 0.91, width: 1.56 },
    dash: '#22262e', trim: '#ffc928', accent: '#ffc928', frame: 'pillars',
    wheel: { type: 'round', radius: 0.165, color: '#1a1d22', accent: '#ffc928' },
    cluster: 'single', dial: { ...DARK_DIAL, accent: '#ffc928', needle: '#ffc928' }, gearKmh: 30
  },
  'nova-coupe': {
    cabin: { belt: 0.28, screen: [[-0.6, 0.27], [0.0, 0.6]], roof: 0.6, width: 1.42 },
    dash: '#111215', trim: '#1e2a33', accent: '#22d3ee', frame: 'pillars',
    wheel: { type: 'flat', radius: 0.165, color: '#101114', accent: '#22d3ee' },
    cluster: 'digital', dial: { face: '#05080b', ink: '#e8fbff', accent: '#22d3ee', needle: '#22d3ee', bezel: '#22323c' }, gearKmh: 40
  },
  'courier-van': {
    cabin: { belt: 0.5, screen: [[-1.25, 0.48], [-0.8, 1.22]], roof: 1.23, width: 1.78 },
    dash: '#4a4f57', trim: '#5d636c', accent: '#ff8a1f', frame: 'pillars',
    wheel: { type: 'bus', radius: 0.22, color: '#2a2d33', accent: '#ff8a1f', spokes: 2 },
    cluster: 'twin', dial: { face: '#f3f1ea', ink: '#1d1f23', needle: '#d62828', bezel: '#9aa0a8', accent: '#ff8a1f' }, gearKmh: 26
  },
  'dune-jumper': {
    cabin: { belt: 0.31, screen: [[-0.5, 0.3], [-0.5, 0.3]], roof: null, width: 1.4 },
    dash: '#3a3a36', trim: '#15181d', accent: '#ffd23f', frame: 'cage',
    wheel: { type: 'rally', radius: 0.17, color: '#121316', accent: '#ffd23f' },
    cluster: 'triple', dial: { ...DARK_DIAL, accent: '#ffd23f', needle: '#ffd23f' }, gearKmh: 30
  },
  'vandal-v8': {
    cabin: { belt: 0.36, screen: [[-0.55, 0.35], [0.05, 0.72]], roof: 0.72, width: 1.5 },
    dash: '#3b2416', trim: '#c9cdd3', accent: '#f5f5f5', frame: 'pillars',
    wheel: { type: 'retro', radius: 0.19, color: '#d9dee5', accent: '#6b4226' },
    cluster: 'retro', dial: { face: '#efe6cf', ink: '#1d1a16', needle: '#c81d25', bezel: '#d9dee5', accent: '#6b4226' }, gearKmh: 42
  },
  'gravel-fox': {
    cabin: { belt: 0.39, screen: [[-0.8, 0.37], [-0.2, 0.9]], roof: 0.9, width: 1.56 },
    dash: '#26292f', trim: '#f97316', accent: '#f97316', frame: 'cage',
    wheel: { type: 'rally', radius: 0.17, color: '#15171b', accent: '#f97316' },
    cluster: 'single', dial: { ...DARK_DIAL, accent: '#f97316', needle: '#f97316' }, gearKmh: 32
  },
  'volt-arrow': {
    cabin: { belt: 0.32, screen: [[-0.7, 0.31], [0.0, 0.7]], roof: 0.7, width: 1.52 },
    dash: '#c9ced6', trim: '#2b2f36', accent: '#38bdf8', frame: 'pillars',
    wheel: { type: 'yoke', radius: 0.15, color: '#1c1f24', accent: '#38bdf8' },
    cluster: 'tablet', dial: { face: '#0b1117', ink: '#eaf6ff', accent: '#38bdf8', needle: '#38bdf8', bezel: '#2b2f36' }, gearKmh: 999
  },
  'kei-bolt': {
    cabin: { belt: 0.46, screen: [[-1.05, 0.44], [-0.78, 1.12]], roof: 1.13, width: 1.5 },
    dash: '#e9efe9', trim: '#7dd3b0', accent: '#2f9e7a', frame: 'pillars',
    wheel: { type: 'round', radius: 0.15, color: '#2c3330', accent: '#7dd3b0', spokes: 2 },
    cluster: 'digital', dial: { face: '#1b2622', ink: '#e8fff6', accent: '#7dd3b0', needle: '#7dd3b0', bezel: '#7dd3b0' }, gearKmh: 26
  },
  'sundown-roadster': {
    cabin: { belt: 0.34, screen: [[-0.42, 0.38], [-0.22, 0.66]], roof: null, width: 1.6 },
    dash: '#6b1d1f', trim: '#f3e9d2', accent: '#f3e9d2', frame: 'open',
    wheel: { type: 'retro', radius: 0.19, color: '#d9dee5', accent: '#7a4a26' },
    cluster: 'retro', dial: { face: '#f3e9d2', ink: '#2a1a12', needle: '#c81d25', bezel: '#d9dee5', accent: '#6b1d1f' }, gearKmh: 34
  },
  'hornet-rs': {
    cabin: { belt: 0.32, screen: [[-0.7, 0.31], [-0.05, 0.7]], roof: 0.7, width: 1.48 },
    dash: '#0e0f12', trim: '#facc15', accent: '#facc15', frame: 'pillars',
    wheel: { type: 'flat', radius: 0.165, color: '#0e0f12', accent: '#facc15' },
    cluster: 'digital', dial: { ...DARK_DIAL, accent: '#facc15', needle: '#facc15' }, gearKmh: 36, boostGauge: true
  }
});

export const cockpitStyleFor = (vehicleId) => COCKPIT_STYLES[vehicleId] ?? COCKPIT_STYLES['bruno-gt'];
