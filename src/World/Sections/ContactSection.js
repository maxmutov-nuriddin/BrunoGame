import * as THREE from 'three';

export default {
  id: 'Contact',
  title: 'Contact',
  signline: 'Email, social, next mission',
  teaser: 'Contact stop nearby. Enter to open contact options.',
  prompt: 'Press Enter or tap ACT to open the contact panel.',
  description:
    'If the work feels aligned, this stop turns the drive into a conversation. The panel is set up for a quick hello, project pitch, or freelance collaboration.',
  accent: '#ff7b68',
  position: new THREE.Vector3(52, 0, -88),
  radius: 12,
  cards: [
    {
      title: 'Email',
      body: 'hello@brunogame.dev'
    },
    {
      title: 'LinkedIn',
      body: 'linkedin.com/in/brunogame'
    },
    {
      title: 'Availability',
      body: 'Open to freelance builds, product collaborations, and interactive portfolio work.'
    }
  ],
  footerLeft: 'Drive up, press Enter, then make the next move.',
  footerRight: 'Let’s build something with lift.'
};
