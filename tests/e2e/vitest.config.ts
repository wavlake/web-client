import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only include e2e tests, not unit tests from packages/
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run tests sequentially (important for stateful tests)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
