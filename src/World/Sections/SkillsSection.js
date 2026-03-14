import * as THREE from 'three';

export default {
  id: 'Skills',
  title: 'Skills',
  signline: 'Systems, rendering, frontend craft',
  teaser: 'Skills stop ahead. Enter to inspect the stack.',
  prompt: 'Press Enter or tap ACT to open the skills breakdown.',
  description:
    'The toolkit behind the scenes: modern frontend engineering, real-time graphics, animation systems, and the habit of shipping thoughtful polish.',
  accent: '#7af7d0',
  position: new THREE.Vector3(52, 0, 88),
  radius: 12,
  cards: [
    {
      title: 'Creative Frontend',
      body: 'Three.js, shaders, motion systems, responsive interaction design, and UI architecture that stays maintainable.'
    },
    {
      title: 'Product Engineering',
      body: 'React, TypeScript, Vite, API integration, state management, and delivery practices that survive real product timelines.'
    },
    {
      title: 'Collaboration',
      body: 'Pairing with design, prototyping ideas quickly, translating fuzzy goals into systems that teams can keep extending.'
    }
  ],
  footerLeft: 'Strongest when design and engineering need to feel like one discipline.',
  footerRight: 'Low-poly city, high-signal workflow.'
};
