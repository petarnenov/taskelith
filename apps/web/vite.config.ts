import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devServer, devServerFiles } from './dev-server.ts';

// The SPA lives under /app/ of the control plane's browser origin; .env
// files are never read, so no environment value reaches the bundle.
export default defineConfig(({ command }) => ({
  base: '/app/',
  envDir: false,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: command === 'serve' ? devServer(devServerFiles(process.env)) : undefined,
}));
