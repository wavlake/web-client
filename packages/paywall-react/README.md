# @wavlake/paywall-react

React hooks and providers for Wavlake paywall integration. SSR/Next.js compatible.

## Installation

```bash
npm install @wavlake/paywall-react @wavlake/wallet @wavlake/paywall-client
```

## Quick Start

```tsx
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
import { PaywallClient } from '@wavlake/paywall-client';
import { WalletProvider, PaywallProvider, useWallet, useTrackPlayer } from '@wavlake/paywall-react';

// Create instances (do this once, outside components)
const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new LocalStorageAdapter('my-wallet'),
});

const client = new PaywallClient({
  apiUrl: 'https://api.wavlake.com',
});

// Wrap your app with providers
function App() {
  return (
    <WalletProvider wallet={wallet}>
      <PaywallProvider client={client}>
        <Player />
      </PaywallProvider>
    </WalletProvider>
  );
}

// Use hooks in components
function Player() {
  const { balance, isReady } = useWallet();
  const { play, stop, audioUrl, isPlaying, isLoading, error } = useTrackPlayer();

  if (!isReady) return <div>Loading wallet...</div>;

  return (
    <div>
      <p>Balance: {balance} credits</p>
      {error && <p style={{ color: 'red' }}>{error.message}</p>}
      
      <button 
        onClick={() => play('track-dtag-here', 1)} 
        disabled={isLoading || balance < 1}
      >
        {isPlaying ? 'Playing...' : 'Play (1 credit)'}
      </button>
      
      {isPlaying && <button onClick={stop}>Stop</button>}
      {audioUrl && <audio src={audioUrl} autoPlay />}
    </div>
  );
}
```

## Providers

### WalletProvider

Provides wallet state to child components.

```tsx
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
import { WalletProvider } from '@wavlake/paywall-react';

const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new LocalStorageAdapter('wallet-key'),
});

<WalletProvider wallet={wallet} autoLoad={true}>
  {children}
</WalletProvider>
```

**Props:**
- `wallet` - Wallet instance from @wavlake/wallet
- `autoLoad` - Auto-load wallet on mount (default: true)

### PaywallProvider

Provides paywall client to child components.

```tsx
import { PaywallClient } from '@wavlake/paywall-client';
import { PaywallProvider } from '@wavlake/paywall-react';

const client = new PaywallClient({
  apiUrl: 'https://api.wavlake.com',
});

<PaywallProvider client={client}>
  {children}
</PaywallProvider>
```

**Props:**
- `client` - PaywallClient instance
- `wallet` - Optional wallet for auto-payment flows

## Hooks

### useWallet

Access wallet state and actions.

```tsx
const {
  balance,      // number - current balance in credits
  proofs,       // Proof[] - current proofs
  isReady,      // boolean - false during SSR/hydration
  isLoading,    // boolean - operation in progress
  error,        // Error | null
  createToken,  // (amount: number) => Promise<string>
  receiveToken, // (token: string) => Promise<number>
  createMintQuote, // (amount: number) => Promise<MintQuote>
  mintTokens,   // (quote: MintQuote | string) => Promise<number>
  checkProofs,  // () => Promise<CheckProofsResult>
  pruneSpent,   // () => Promise<number>
  clear,        // () => Promise<void>
} = useWallet();
```

### usePaywall

Access paywall client methods.

```tsx
const {
  requestAudio,   // (dtag: string, token: string) => Promise<AudioResult>
  requestContent, // (dtag: string, token: string) => Promise<ContentResult>
  getAudioUrl,    // (dtag: string, token: string, paymentId?) => string
  fetchChange,    // (paymentId: string) => Promise<ChangeResult>
  isLoading,      // boolean
  error,          // Error | null
  clearError,     // () => void
} = usePaywall();
```

### useTrackPlayer

Combined hook for the common "pay and play" flow.

```tsx
const {
  play,        // (dtag: string, price: number) => Promise<void>
  stop,        // () => void
  audioUrl,    // string | null - current audio URL
  grantId,     // string | null - grant ID for replay
  isPlaying,   // boolean
  isLoading,   // boolean
  error,       // Error | null
  clearError,  // () => void
} = useTrackPlayer({
  useContentEndpoint: true,  // Use /v1/content (default: true)
  autoReceiveChange: true,   // Auto-receive change tokens (default: true)
});
```

## SSR / Next.js Compatibility

All hooks and providers are marked with `'use client'` and are SSR-safe:

- `isReady` is `false` during SSR/hydration
- localStorage access is guarded
- No browser APIs are called during server render

**Next.js App Router usage:**

```tsx
// app/providers.tsx
'use client';

import { WalletProvider, PaywallProvider } from '@wavlake/paywall-react';
// ... create wallet and client

export function Providers({ children }) {
  return (
    <WalletProvider wallet={wallet}>
      <PaywallProvider client={client}>
        {children}
      </PaywallProvider>
    </WalletProvider>
  );
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  WalletProviderProps,
  WalletContextValue,
  PaywallProviderProps,
  PaywallContextValue,
  UseTrackPlayerResult,
  UseTrackPlayerOptions,
} from '@wavlake/paywall-react';
```

## License

MIT
