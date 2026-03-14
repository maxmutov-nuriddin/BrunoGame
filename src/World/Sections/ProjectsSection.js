import * as THREE from 'three';

export default {
  id: 'Projects',
  title: 'Projects',
  signline: 'Case studies, prototypes, shipped work',
  teaser: 'Projects stop unlocked. Park and inspect recent work.',
  prompt: 'Press Enter or tap ACT to open featured project cards.',
  description:
    'A rotating stop for flagship launches, experiments, and product thinking. Each card is written like a playable snapshot instead of a resume bullet.',
  accent: '#ffb347',
  position: new THREE.Vector3(-52, 0, 88),
  radius: 12,
  cards: [
    {
      title: 'Motion Commerce',
      body: 'A retail storytelling site blending cinematic scroll choreography with hard-nosed performance budgets.'
    },
    {
      title: 'Realtime Configurator',
      body: 'A WebGL product customizer with multiplayer cursor presence, instant sharing, and adaptive quality controls.'
    },
    {
      title: 'Creative Tooling',
      body: 'Internal generators and design-dev systems that cut repetitive work while keeping the output expressive.'
    }
  ],
  footerLeft: 'Built for product teams that want personality without chaos.',
  footerRight: 'Best viewed with a little speed.'
};
