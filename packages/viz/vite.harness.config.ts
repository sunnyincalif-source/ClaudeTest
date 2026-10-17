import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'harness',
  plugins: [react()],
  build: { outDir: '../harness-dist', emptyOutDir: true },
  server: { port: 5175 },
});
