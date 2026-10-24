let waitingWorker = null;
const listeners = new Set();

function notify(worker) {
  waitingWorker = worker;
  for (const listener of listeners) listener();
}

/** Register the service worker (production builds only). Updates wait until the player accepts them. */
export function registerOfflineSupport() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) notify(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) notify(worker);
          });
        });
      })
      .catch((error) => console.error('Service worker registration failed', error));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

export function onUpdateAvailable(listener) {
  listeners.add(listener);
  if (waitingWorker) listener();
}

/** Activate the waiting version (called from a menu, never mid-race). */
export function applyUpdate() {
  waitingWorker?.postMessage('SKIP_WAITING');
}

/** Kept for API compatibility: the build-time precache list now covers every asset. */
export function seedOfflineCache() {}
