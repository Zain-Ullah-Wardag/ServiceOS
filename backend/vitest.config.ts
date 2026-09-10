import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],

    // Keep DB integration tests sequential and predictable.
    fileParallelism: false,

    testTimeout: 15000,
    hookTimeout: 15000
  }
});