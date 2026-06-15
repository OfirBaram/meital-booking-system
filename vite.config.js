import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vite';

// Resolve paths relative to this config file, handling the U+200F project path safely.
const root = fileURLToPath(new URL('./frontend', import.meta.url));
const entry = (name) => fileURLToPath(new URL(`./frontend/${name}`, import.meta.url));

export default defineConfig({
  base: './',
  root,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,       // keep all assets as separate files — no base64 blobs
    rollupOptions: {
      input: {
        landing:  entry('landing.html'),
        main:     entry('index.html'),
        admin:    entry('admin.html'),
        takanon:  entry('takanon.html'),
        privacy:    entry('privacy.html'),
        'my-booking': entry('my-booking.html'),
      },
    },
  },
  server:  { port: 5173, open: false, fs: { strict: false } },
  preview: { port: 4173 },
  optimizeDeps: { include: ['mixpanel-browser'] },
});
