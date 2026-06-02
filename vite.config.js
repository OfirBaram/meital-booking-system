import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vite';

// Resolve paths relative to this config file, handling the U+200F project path safely.
const root = fileURLToPath(new URL('./frontend', import.meta.url));
const entry = (name) => fileURLToPath(new URL(`./frontend/${name}`, import.meta.url));

export default defineConfig({
  root,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,       // keep all assets as separate files — no base64 blobs
    rollupOptions: {
      input: {
        main:  entry('index.html'),
        admin: entry('admin.html'),
      },
    },
  },
  server:  { port: 5173, open: false },
  preview: { port: 4173 },
});
