/**
 * The online backend: who I am (peer id), the lobby directory and a mailbox for connection setup and
 * relayed traffic. Firebase in production; without Firebase config, development builds fall back to a
 * same-browser stand-in so online play can be tried between tabs.
 */

const FIREBASE_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  databaseURL: 'VITE_FIREBASE_DATABASE_URL',
  appId: 'VITE_FIREBASE_APP_ID'
};

/** Web app config from build-time env, or null when any field is missing. */
export function firebaseConfig() {
  const env = import.meta.env;
  const config = Object.fromEntries(Object.entries(FIREBASE_KEYS).map(([key, name]) => [key, env[name] ?? '']));
  return Object.values(config).every(Boolean) ? config : null;
}

export const backendKind = () => (firebaseConfig() ? 'firebase' : import.meta.env.DEV ? 'local' : 'none');

let pending = null;

/** The shared backend instance (created once, lazily: solo players never load Firebase). */
export function getBackend() {
  pending ??= (async () => {
    const kind = backendKind();
    if (kind === 'firebase') return (await import('./firebase.js')).createFirebaseBackend(firebaseConfig());
    if (kind === 'local') return (await import('./local.js')).createLocalBackend();
    throw new Error('Online play is not configured: add the Firebase settings (see .env.example).');
  })().catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
