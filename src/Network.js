// Must match CACHE_NAME in public/sw.js.
const CACHE_NAME = 'bruno-game-v2';

// The worker is not active yet during the very first load, so seed the cache with what already loaded.
async function cacheLoadedResources() {
  const cache = await caches.open(CACHE_NAME);
  const urls = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => new URL(url).origin === window.location.origin && !url.includes('/@vite/'));

  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url, { ignoreVary: true })) return;
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    })
  );
}

export function seedOfflineCache() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.ready
    .then(cacheLoadedResources)
    .catch((error) => console.error('Offline cache seeding failed', error));
}

export function registerOfflineSupport() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => console.error('Service worker registration failed', error));
  });
}

export function watchConnection(element) {
  const update = () => {
    const online = navigator.onLine;
    element.textContent = online ? 'Online' : 'Offline';
    element.dataset.state = online ? 'online' : 'offline';
  };

  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}
