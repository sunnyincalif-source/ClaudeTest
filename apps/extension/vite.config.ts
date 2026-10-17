import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  // One shared .env at the repo root (STORE_URL etc. — see /.env).
  envDir: '../..',
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { welcome: 'src/welcome/index.html' } },
  },
  server: { port: 5174, strictPort: true, hmr: { port: 5174 } },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
