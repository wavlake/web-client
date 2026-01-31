# @wavlake/wallet

Cashu wallet state management with pluggable storage backends.

## Installation

```bash
npm install @wavlake/wallet
```

## Quick Start

```typescript
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';

const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new LocalStorageAdapter('my-wallet'),
});

// Load wallet from storage
await wallet.load();
console.log(`Balance: ${wallet.balance} credits`);

// Create a token for payment
const token = await wallet.createToken(5);

// Receive a token (e.g., change from payment)
const amount = await wallet.receiveToken(changeToken);
```

## Storage Adapters

### LocalStorageAdapter (Browser)

```typescript
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';

const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new LocalStorageAdapter('my-app-wallet'),
});
```

### AsyncStorageAdapter (React Native)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Wallet, AsyncStorageAdapter } from '@wavlake/wallet';

const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new AsyncStorageAdapter('my-app-wallet', AsyncStorage),
});
```

### MemoryAdapter (Testing)

```typescript
import { Wallet, MemoryAdapter } from '@wavlake/wallet';

const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new MemoryAdapter(),
});
```

### Custom Adapter

```typescript
import { Wallet, StorageAdapter } from '@wavlake/wallet';

class MyStorageAdapter implements StorageAdapter {
  async load() { /* return Proof[] */ }
  async save(proofs) { /* persist proofs */ }
  async clear() { /* clear storage */ }
}

const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new MyStorageAdapter(),
});
```

## Proof Selection Strategies

```typescript
import { Wallet, LocalStorageAdapter, selectors } from '@wavlake/wallet';

const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new LocalStorageAdapter('my-wallet'),
  proofSelector: selectors.exactMatch, // or smallestFirst, largestFirst, random
});
```

| Strategy | Description |
|----------|-------------|
| `smallestFirst` | Select smallest proofs first (default). Minimizes change. |
| `largestFirst` | Select largest proofs first. Minimizes proof count. |
| `exactMatch` | Try to find exact match first, then fall back to smallestFirst. |
| `random` | Random selection for privacy. |

## API Reference

### Wallet

```typescript
const wallet = new Wallet({
  mintUrl: string;              // Required: Cashu mint URL
  storage: StorageAdapter;      // Required: Storage backend
  proofSelector?: ProofSelector; // Optional: Selection strategy
  autoReceiveChange?: boolean;  // Optional: Auto-save on changes (default: true)
  unit?: string;                // Optional: Currency unit (default: 'usd')
});
```

#### Properties

```typescript
wallet.balance    // Current balance in credits
wallet.proofs     // Array of current proofs (readonly copy)
wallet.mintUrl    // Mint URL
wallet.isLoaded   // Whether wallet has been loaded from storage
```

#### Persistence

```typescript
await wallet.load();   // Load from storage (call on startup)
await wallet.save();   // Save to storage (usually automatic)
await wallet.clear();  // Clear wallet and storage
```

#### Token Operations

```typescript
// Create token for payment
const token = await wallet.createToken(amount);

// Receive token (e.g., payment, change)
const received = await wallet.receiveToken(token);

// Receive change (alias for receiveToken)
const change = await wallet.receiveChange(changeToken);
```

#### Proof Management

```typescript
// Add proofs directly
await wallet.addProofs(proofs);

// Remove specific proofs
await wallet.removeProofs(proofs);

// Check which proofs are still valid
const { valid, spent } = await wallet.checkProofs();

// Remove spent proofs
const removedCount = await wallet.pruneSpent();
```

#### Minting (from Lightning)

```typescript
// Get Lightning invoice
const quote = await wallet.createMintQuote(100);
console.log('Pay this invoice:', quote.request);

// Check if paid
const updated = await wallet.checkMintQuote(quote.id);
if (updated.paid) {
  // Mint the tokens
  const minted = await wallet.mintTokens(quote);
  console.log(`Minted ${minted} credits`);
}
```

#### Events

```typescript
wallet.on('balance-change', (balance) => {
  console.log('New balance:', balance);
});

wallet.on('proofs-change', (proofs) => {
  console.log('Proofs updated:', proofs.length);
});

wallet.on('error', (error) => {
  console.error('Wallet error:', error);
});

// Unsubscribe
wallet.off('balance-change', handler);
```

## Standalone Utilities

### Check Proof State

```typescript
import { checkProofState, isProofValid } from '@wavlake/wallet';

// Check multiple proofs
const { valid, spent } = await checkProofState(mintUrl, proofs);

// Check single proof
const isValid = await isProofValid(mintUrl, proof);
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  Proof,
  StorageAdapter,
  ProofSelector,
  WalletConfig,
  MintQuote,
  CheckProofsResult,
} from '@wavlake/wallet';
```

## License

MIT
