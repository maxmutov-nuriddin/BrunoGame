/**
 * Look of each track theme (shared/track/types.ts TrackTheme). Visual only: physics never read this.
 * nature: weighted scenery-kit pieces; buildings: how many landmark buildings to try placing.
 */
export const THEMES = Object.freeze({
  meadow: {
    sky: '#9fd6ff', fog: [260, 1150],
    hemisphere: ['#fff3ca', '#4980a8', 1.6], sun: ['#fff8d2', 2.7],
    ground: 'tiles', groundTint: '#ffffff', slope: '#7fb862', accent: '#ff4f6d',
    nature: [['Tree_Round', 0.27], ['Tree_Pine', 0.22], ['Tree_Tall', 0.14], ['Bush', 0.16], ['Rock_Small', 0.08], ['Rock_Big', 0.04], ['FlowerPatch', 0.09]],
    buildings: 70
  },
  desert: {
    sky: '#f4d3a1', fog: [240, 1050],
    hemisphere: ['#fff1d6', '#b07b4a', 1.5], sun: ['#ffe2b0', 3.0],
    ground: '#e1bd86', slope: '#d3a86f', accent: '#ff8a1f',
    nature: [['Rock_Big', 0.38], ['Rock_Small', 0.4], ['Bush', 0.17], ['Tree_Tall', 0.05]],
    buildings: 18
  },
  snow: {
    sky: '#d6e5f3', fog: [200, 950],
    hemisphere: ['#ffffff', '#8aa4c4', 1.7], sun: ['#ffffff', 2.3],
    ground: '#eef3f8', slope: '#e3ebf3', accent: '#3fa9ff',
    nature: [['Tree_Pine', 0.62], ['Rock_Big', 0.14], ['Rock_Small', 0.18], ['Bush', 0.06]],
    buildings: 26
  },
  dusk: {
    sky: '#3a2d63', fog: [220, 1000],
    hemisphere: ['#ffb38a', '#2a2350', 1.05], sun: ['#ff9a5c', 1.7],
    ground: 'tiles', groundTint: '#6f8f78', slope: '#41604a', accent: '#c18cff',
    nature: [['Tree_Round', 0.35], ['Tree_Tall', 0.25], ['Bush', 0.25], ['Rock_Small', 0.15]],
    buildings: 140
  },
  island: {
    sky: '#8fdcff', fog: [300, 1300],
    hemisphere: ['#fff6dc', '#4aa3c8', 1.7], sun: ['#fff4d6', 2.8],
    ground: 'island', water: '#1fa8c4', sand: '#ecd9a6', grass: '#8cc96b', slope: '#e3cf9b', accent: '#3dffd0',
    nature: [['Tree_Round', 0.4], ['Bush', 0.3], ['Rock_Small', 0.15], ['FlowerPatch', 0.15]],
    buildings: 10
  }
});

export const themeFor = (track) => THEMES[track.theme] ?? THEMES.meadow;
