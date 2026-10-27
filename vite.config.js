import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])));
  return nested.flat();
}

/** Emits dist/sw.js with a content-hash version and the full precache list (app shell, chunks, models). */
function serviceWorker() {
  let publicFiles = [];
  return {
    name: 'bruno-service-worker',
    apply: 'build',
    async buildStart() {
      const root = join(process.cwd(), 'public');
      publicFiles = (await listFiles(root))
        .map((file) => relative(root, file).split('\\').join('/'))
        .filter((file) => !file.endsWith('.zip') && !file.endsWith('.md') && !file.includes('vehicle-pack/') && !file.endsWith('manifest.json'));
    },
    async generateBundle(_options, bundle) {
      // Online-only code (the Firebase SDK) is not precached: it is useless offline and nearly 1 MB.
      const emitted = Object.keys(bundle).filter((name) => !name.endsWith('.map') && !name.startsWith('assets/firebase'));
      const files = ['./', ...emitted.map((name) => `./${name}`), ...publicFiles.map((name) => `./${name}`)];
      const version = createHash('sha256').update(files.join('|')).update(String(Object.values(bundle).map((b) => b.code?.length ?? b.source?.length ?? 0))).digest('hex').slice(0, 12);
      const template = await readFile(join(process.cwd(), 'scripts/sw-template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replaceAll('__VERSION__', version).replaceAll('__PRECACHE__', JSON.stringify(files))
      });
    }
  };
}

/**
 * Dev only: a worker installed by an older build (or the old public/sw.js) would keep serving stale cached
 * JS. Serving this at /sw.js makes the browser's update check replace it with one that clears every cache,
 * unregisters itself and reloads open tabs onto the live dev server.
 */
const DEV_KILL_SWITCH = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});`;

function devServiceWorkerKillSwitch() {
  return {
    name: 'dev-service-worker-kill-switch',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-store');
        res.end(DEV_KILL_SWITCH);
      });
    }
  };
}

export default defineConfig({
  plugins: [serviceWorker(), devServiceWorkerKillSwitch()],
  build: {
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('three')) return 'three-core';
          if (id.includes('rapier')) return 'physics';
          // Only online play needs Firebase: its own chunk, fetched on demand, never at boot.
          if (/firebase|@grpc|protobufjs|[/\\]idb[/\\]|tslib|re2js/.test(id)) return 'firebase-sdk';
          return 'vendor';
        }
      }
    }
  },
  server: {
    host: true
  }
});
