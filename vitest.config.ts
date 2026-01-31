import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/*/test/**/*.test.ts', 'packages/*/test/**/*.test.tsx'],
    setupFiles: ['./packages/paywall-react/test/setup.ts'],
  },
});
