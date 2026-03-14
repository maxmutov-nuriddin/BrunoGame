import * as THREE from 'three';

export default {
  id: 'About',
  title: 'About',
  signline: 'Background, approach, what matters',
  teaser: 'About stop discovered. Enter for the short version.',
  prompt: 'Press Enter or tap ACT to open the about panel.',
  description:
    'I like work that feels alive. The sweet spot is building interfaces with a point of view, while keeping the codebase friendly to the next person who touches it.',
  accent: '#7ac7ff',
  position: new THREE.Vector3(-52, 0, -88),
  radius: 12,
  cards: [
    {
      title: 'Design-Minded Engineering',
      body: 'Not just implementing screens, but shaping motion, hierarchy, timing, and the emotional read of the experience.'
    },
    {
      title: 'Ownership',
      body: 'From brief to polish to launch-day fixes, I care whether the final thing actually lands well with people.'
    },
    {
      title: 'Momentum',
      body: 'Fast iteration, clear communication, and enough structure that creative ideas do not collapse under complexity.'
    }
  ],
  footerLeft: 'Curious, collaborative, and comfortable in ambitious builds.',
  footerRight: 'The road is half the portfolio.'
};
