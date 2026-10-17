import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: `leettrace start --dev` (allows the Vite origin), then `pnpm --filter @leettrace/web dev`
// and open http://localhost:5173/#t=<token>. API calls are proxied to the engine.
const engine = process.env.LEETTRACE_ENGINE ?? 'http://127.0.0.1:47823';
const api = { target: engine, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/health': api,
      '/trace': api,
      '/leetcode': api,
      '/runs': api,
      '/watch': { ...api, ws: true },
    },
  },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
