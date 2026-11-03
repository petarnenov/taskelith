import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devServer, devServerFiles } from './dev-server.ts';

// The SPA lives under /app/ of the control plane's browser origin; .env
// files are never read, so no environment value reaches the bundle.
export default defineConfig(({ command }) => {
  // Vite reads NODE_ENV after the config, so a build is always production.
  if (command === 'build') process.env.NODE_ENV = 'production';
  return {
    base: '/app/',
    envDir: false,
    // The control plane's nonce placeholder, which every response of the
    // page replaces with a fresh nonce; a root test checks the build.
    html: { cspNonce: 'TASKELITH_CSP_NONCE' },
    plugins: [react()],
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
    server: command === 'serve' ? devServer(devServerFiles(process.env)) : undefined,
  };
});
