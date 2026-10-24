import './style.css';
import Application from './Application.js';
import { registerOfflineSupport } from './Network.js';

const root = document.querySelector('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

new Application(root);

registerOfflineSupport();
