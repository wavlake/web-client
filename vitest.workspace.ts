import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Non-React packages - use node environment
  'packages/wallet/vitest.config.ts',
  'packages/paywall-client/vitest.config.ts',
  'packages/nostr-wallet/vitest.config.ts',
  // React package - uses jsdom environment
  'packages/paywall-react/vitest.config.ts',
]);
