import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('three')) {
            return 'three-core';
          }

          if (id.includes('rapier')) {
            return 'physics';
          }

          if (id.includes('howler') || id.includes('gsap')) {
            return 'experience-utils';
          }

          return 'vendor';
        }
      }
    }
  },
  server: {
    host: true
  }
});
