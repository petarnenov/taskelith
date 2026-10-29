import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, so tests never need the dev server's files.
export default defineConfig({
  envDir: false,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/generated/**'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 75, branches: 75, functions: 75 },
    },
  },
});
