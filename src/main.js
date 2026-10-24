import './ui/game.css';
import Game from './game/Game.js';
import { registerOfflineSupport } from './Network.js';

const root = document.querySelector('#app');
if (!root) throw new Error('Missing #app root element.');

const game = new Game(root);
game.boot();
registerOfflineSupport();

// Dev-only handle for automated browser checks; stripped from production builds.
if (import.meta.env.DEV) window.__game = game;
