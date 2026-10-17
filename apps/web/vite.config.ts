import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy API calls to a locally running engine (`leettrace start --dev`).
const engine = process.env.LEETTRACE_ENGINE ?? 'http://127.0.0.1:47823';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: engine, changeOrigin: false, ws: true },
    },
  },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
