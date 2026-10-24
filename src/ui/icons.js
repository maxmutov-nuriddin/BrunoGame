/** Original inline SVG glyphs for items and UI (no external icon sets). */
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ITEM_ICONS = {
  pulse: svg('<path d="M6 24h22"/><path d="M22 14l14 10-14 10"/><circle cx="40" cy="24" r="3" fill="currentColor"/>'),
  missile: svg('<path d="M10 38l8-8"/><path d="M18 30c6-12 14-18 22-20-2 8-8 16-20 22z"/><path d="M14 26l-6 2 2 6"/><path d="M22 34l-2 6 6-2"/>'),
  shock: svg('<circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="13" stroke-dasharray="5 4"/><circle cx="24" cy="24" r="20" stroke-dasharray="3 6"/>'),
  mine: svg('<circle cx="24" cy="26" r="10"/><path d="M24 8v6M10 14l4 4M38 14l-4 4M6 26h6M36 26h6"/>'),
  shield: svg('<path d="M24 6l14 6v10c0 9-6 16-14 20-8-4-14-11-14-20V12z"/>'),
  repair: svg('<path d="M30 8a8 8 0 0 0-8 11L8 33l7 7 14-14a8 8 0 0 0 11-8l-6 6-6-2-2-6z"/>'),
  nitro: svg('<path d="M26 4L12 28h10l-4 16 16-24H24z"/>')
};

export const KEY_LABELS = {
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter'
};

export const keyLabel = (code) => KEY_LABELS[code] ?? code?.replace(/^Key/, '').replace(/^Digit/, '') ?? '—';
