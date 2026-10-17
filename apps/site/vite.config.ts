import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // One shared .env at the repo root (STORE_URL etc. — see /.env).
  envDir: '../..',
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    // Two static pages: the landing page and /privacy (the Web Store privacy-policy URL).
    rollupOptions: { input: { main: 'index.html', privacy: 'privacy/index.html' } },
  },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
