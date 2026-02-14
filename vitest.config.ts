import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@wavlake/wallet': path.resolve(__dirname, 'packages/wallet/src/index.ts'),
      '@wavlake/paywall-client': path.resolve(__dirname, 'packages/paywall-client/src/index.ts'),
      '@wavlake/nostr-wallet': path.resolve(__dirname, 'packages/nostr-wallet/src/index.ts'),
      '@wavlake/paywall-react': path.resolve(__dirname, 'packages/paywall-react/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/*/test/**/*.test.ts', 'packages/*/test/**/*.test.tsx'],
    setupFiles: ['./packages/paywall-react/test/setup.ts'],
  },
});
