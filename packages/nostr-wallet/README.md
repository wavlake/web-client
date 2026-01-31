# @wavlake/nostr-wallet

NIP-60/61 support for the Wavlake SDK. Sync your Cashu wallet across apps via Nostr and send/receive nutzaps.

> ⚠️ **Draft** - This package is under development.

## Features

- **NIP-60 Wallet Sync** — Store proofs on Nostr relays, access from any client
- **NIP-61 Nutzaps** — Send and receive P2PK-locked Cashu tips
- **Composable** — Works with existing `@wavlake/wallet` or standalone
- **Modular** — Use only what you need

## Installation

```bash
npm install @wavlake/nostr-wallet @wavlake/wallet @nostr-dev-kit/ndk
```

## Quick Start

### Option 1: Drop-in Storage Adapter

Use `Nip60Adapter` as a storage backend for the existing Wallet class:

```ts
import { Wallet } from '@wavlake/wallet';
import { Nip60Adapter } from '@wavlake/nostr-wallet';
import NDK from '@nostr-dev-kit/ndk';

// Connect to Nostr
const ndk = new NDK({ 
  explicitRelayUrls: ['wss://relay.wavlake.com'] 
});
await ndk.connect();

// Create adapter
const adapter = new Nip60Adapter({
  ndk,
  signer: ndk.signer,
  mintUrl: 'https://mint.wavlake.com',
});

// Use with existing Wallet - no other changes needed!
const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: adapter,  // Instead of LocalStorageAdapter
});

await wallet.load();  // Fetches from Nostr relays
console.log(`Balance: ${wallet.balance}`);

await wallet.receiveToken(token);  // Auto-syncs to relays
```

### Option 2: Full Nostr Wallet

Use `Nip60Wallet` for full NIP-60 features:

```ts
import { Nip60Wallet } from '@wavlake/nostr-wallet';

const wallet = new Nip60Wallet({
  ndk,
  signer: ndk.signer,
  mintUrl: 'https://mint.wavlake.com',
});

await wallet.load();

// All standard wallet methods work
await wallet.createToken(5);
await wallet.receiveToken(token);

// Plus NIP-60 features
await wallet.publishWalletEvent();  // kind:17375
wallet.on('sync', () => console.log('Synced!'));
```

### Option 3: Nutzaps Only

Use nutzap features without wallet sync:

```ts
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
import { NutzapReceiver, NutzapInfo } from '@wavlake/nostr-wallet/nutzap';

// Regular local wallet
const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: new LocalStorageAdapter('my-wallet'),
});

// Publish nutzap receiving info
const info = new NutzapInfo({ ndk, signer: ndk.signer });
await info.publish({
  mints: [{ url: 'https://mint.wavlake.com', units: ['usd'] }],
  relays: ['wss://relay.wavlake.com'],
});

// Receive nutzaps
const receiver = new NutzapReceiver({ ndk, wallet });
receiver.on('nutzap', async (zap) => {
  const amount = await receiver.redeem(zap);
  console.log(`Got ${amount} credits from ${zap.sender}!`);
});
await receiver.subscribe();
```

## API

### Nip60Adapter

Storage adapter that syncs proofs via NIP-60.

```ts
interface Nip60AdapterConfig {
  ndk: NDK;
  signer: NDKSigner;
  mintUrl: string;
  unit?: string;  // default: 'sat'
}

class Nip60Adapter implements StorageAdapter {
  load(): Promise<Proof[]>;
  save(proofs: Proof[]): Promise<void>;
  clear(): Promise<void>;
  
  getP2PKPubkey(): string;
}
```

### Nip60Wallet

Extended wallet with full NIP-60 support.

```ts
class Nip60Wallet extends Wallet {
  // Inherited: balance, proofs, createToken, receiveToken, etc.
  
  publishWalletEvent(): Promise<void>;
  getSpendingHistory(limit?: number): Promise<SpendingRecord[]>;
  
  on(event: 'sync', handler: () => void): void;
  on(event: 'conflict', handler: (local, remote) => void): void;
}
```

### NutzapSender

Send nutzaps to other users.

```ts
class NutzapSender {
  fetchRecipientInfo(pubkey: string): Promise<NutzapInfo>;
  
  send(options: {
    recipientPubkey: string;
    amount: number;
    comment?: string;
    eventId?: string;
  }): Promise<NutzapEvent>;
}
```

### NutzapReceiver

Receive and redeem nutzaps.

```ts
class NutzapReceiver {
  subscribe(): Promise<void>;
  unsubscribe(): void;
  
  fetchPending(): Promise<Nutzap[]>;
  redeem(nutzap: Nutzap): Promise<number>;
  
  on(event: 'nutzap', handler: (zap: Nutzap) => void): void;
}
```

## Event Kinds

| Kind | Name | Purpose |
|------|------|---------|
| 17375 | Wallet | Encrypted mints + P2PK key |
| 7375 | Token | Encrypted unspent proofs |
| 7376 | History | Spending history (optional) |
| 10019 | Nutzap Info | Receiving preferences |
| 9321 | Nutzap | P2PK-locked tip |

## Security

- **P2PK keys** are separate from your Nostr identity
- **All proofs** are NIP-44 encrypted
- **DLEQ proofs** verify nutzaps without trusting the mint
- **Proof validation** prevents double-spend attacks

## Composability

This package is designed to be composable:

```
┌─────────────────────────────────────────────────────┐
│                   Your App                          │
├─────────────────────────────────────────────────────┤
│  @wavlake/paywall-react                             │
│  (useWallet, usePaywall, useTrackPlayer)            │
├─────────────────────────────────────────────────────┤
│  @wavlake/wallet              @wavlake/nostr-wallet │
│  ┌─────────────┐              ┌─────────────────┐   │
│  │   Wallet    │◄─────────────│  Nip60Adapter   │   │
│  └─────────────┘              ├─────────────────┤   │
│                               │  NutzapSender   │   │
│                               │  NutzapReceiver │   │
│                               └─────────────────┘   │
├─────────────────────────────────────────────────────┤
│  @cashu/cashu-ts              @nostr-dev-kit/ndk    │
└─────────────────────────────────────────────────────┘
```

## License

MIT
