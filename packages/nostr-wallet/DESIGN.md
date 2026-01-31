# @wavlake/nostr-wallet Design

## Overview

NIP-60/61 support for the Wavlake SDK, designed as a **separate, composable package**.

## NIPs Summary

### NIP-60: Cashu Wallets
Sync wallet state across clients via Nostr relays.

| Kind | Purpose | Encrypted |
|------|---------|-----------|
| `17375` | Wallet metadata (mints, P2PK privkey) | Yes (NIP-44) |
| `7375` | Token events (unspent proofs) | Yes (NIP-44) |
| `7376` | Spending history | Yes (NIP-44) |
| `7374` | Mint quotes (optional) | Yes (NIP-44) |

### NIP-61: Nutzaps
P2PK-locked Cashu tips sent via Nostr.

| Kind | Purpose |
|------|---------|
| `10019` | Nutzap info (mints, relays, receiving pubkey) |
| `9321` | Nutzap event (P2PK-locked proofs) |

## Architecture

```
@wavlake/wallet (existing)
    │
    └── StorageAdapter interface
            │
            ├── LocalStorageAdapter (browser)
            ├── AsyncStorageAdapter (React Native)
            ├── MemoryAdapter (testing)
            │
            └── Nip60Adapter ← NEW (from @wavlake/nostr-wallet)

@wavlake/nostr-wallet (new package)
    │
    ├── Nip60Adapter (StorageAdapter implementation)
    ├── Nip60Wallet (higher-level wallet with events)
    ├── NutzapSender (create & send nutzaps)
    ├── NutzapReceiver (subscribe & redeem nutzaps)
    └── utilities (encryption, P2PK, DLEQ)
```

## Package: @wavlake/nostr-wallet

### Dependencies
- `@wavlake/wallet` - for StorageAdapter interface
- `@nostr-dev-kit/ndk` - Nostr connectivity
- `@noble/secp256k1` - P2PK operations
- `@cashu/cashu-ts` - proof handling

### Core Components

#### 1. Nip60Adapter (StorageAdapter)
Drop-in replacement for LocalStorageAdapter.

```ts
import { Wallet } from '@wavlake/wallet';
import { Nip60Adapter } from '@wavlake/nostr-wallet';
import NDK from '@nostr-dev-kit/ndk';

const ndk = new NDK({ explicitRelayUrls: ['wss://relay.example.com'] });
await ndk.connect();

const adapter = new Nip60Adapter({
  ndk,
  signer: ndk.signer,      // NIP-07 or nsec
  mintUrl: 'https://mint.wavlake.com',
  unit: 'usd',
});

// Use with existing Wallet class - fully compatible!
const wallet = new Wallet({
  mintUrl: 'https://mint.wavlake.com',
  storage: adapter,
});

await wallet.load();  // Fetches kind:7375 from relays
```

**Interface:**
```ts
interface Nip60AdapterConfig {
  ndk: NDK;
  signer: NDKSigner;
  mintUrl: string;
  unit?: string;  // default: 'sat'
  relays?: string[];  // override relay list
}

class Nip60Adapter implements StorageAdapter {
  // StorageAdapter interface
  load(): Promise<Proof[]>;
  save(proofs: Proof[]): Promise<void>;
  clear(): Promise<void>;
  
  // NIP-60 specific
  getWalletEvent(): Promise<NDKEvent | null>;
  getTokenEvents(): Promise<NDKEvent[]>;
  getSpendingHistory(limit?: number): Promise<SpendingRecord[]>;
  
  // P2PK key for nutzaps
  getP2PKPubkey(): string;
  getP2PKPrivkey(): string;
}
```

#### 2. Nip60Wallet (Extended Wallet)
Higher-level wrapper with Nostr events.

```ts
import { Nip60Wallet } from '@wavlake/nostr-wallet';

const wallet = new Nip60Wallet({
  ndk,
  signer: ndk.signer,
  mintUrl: 'https://mint.wavlake.com',
});

await wallet.load();

// Inherited from Wallet
wallet.balance;
await wallet.createToken(5);
await wallet.receiveToken(token);

// NIP-60 specific
wallet.on('sync', () => console.log('Synced with relays'));
wallet.on('conflict', (local, remote) => { /* resolve */ });

// Publish wallet discovery event
await wallet.publishWalletEvent();
```

#### 3. NutzapSender
Create and send nutzaps (NIP-61).

```ts
import { NutzapSender } from '@wavlake/nostr-wallet';

const sender = new NutzapSender({
  ndk,
  wallet,  // Nip60Wallet or regular Wallet
});

// Fetch recipient's nutzap info
const recipientInfo = await sender.fetchRecipientInfo(recipientPubkey);

// Send nutzap
const nutzap = await sender.send({
  recipientPubkey: '...',
  amount: 21,
  comment: 'Great post!',
  eventId: 'note123...',  // optional: event being zapped
});
```

#### 4. NutzapReceiver
Subscribe to and redeem incoming nutzaps.

```ts
import { NutzapReceiver } from '@wavlake/nostr-wallet';

const receiver = new NutzapReceiver({
  ndk,
  wallet,
  mints: ['https://mint.wavlake.com'],
});

// Start listening
receiver.on('nutzap', async (nutzap) => {
  console.log(`Received ${nutzap.amount} from ${nutzap.sender}`);
  
  // Auto-redeem or manual
  const amount = await receiver.redeem(nutzap);
  console.log(`Redeemed ${amount} sats`);
});

await receiver.subscribe();

// Fetch and redeem any pending nutzaps
const pending = await receiver.fetchPending();
for (const zap of pending) {
  await receiver.redeem(zap);
}
```

#### 5. NutzapInfo
Manage user's nutzap receiving info (kind:10019).

```ts
import { NutzapInfo } from '@wavlake/nostr-wallet';

const info = new NutzapInfo({
  ndk,
  signer: ndk.signer,
});

// Publish/update nutzap info
await info.publish({
  mints: [
    { url: 'https://mint.wavlake.com', units: ['usd', 'sat'] },
  ],
  relays: ['wss://relay.wavlake.com'],
  p2pkPubkey: wallet.getP2PKPubkey(),
});

// Fetch someone's nutzap info
const theirInfo = await info.fetch(pubkey);
```

## File Structure

```
packages/nostr-wallet/
├── src/
│   ├── index.ts
│   ├── adapter.ts          # Nip60Adapter
│   ├── wallet.ts           # Nip60Wallet
│   ├── nutzap/
│   │   ├── index.ts
│   │   ├── sender.ts       # NutzapSender
│   │   ├── receiver.ts     # NutzapReceiver
│   │   └── info.ts         # NutzapInfo
│   ├── crypto/
│   │   ├── index.ts
│   │   ├── nip44.ts        # NIP-44 encryption
│   │   ├── p2pk.ts         # P2PK lock/unlock
│   │   └── dleq.ts         # DLEQ verification
│   ├── events/
│   │   ├── index.ts
│   │   ├── wallet.ts       # kind:17375
│   │   ├── token.ts        # kind:7375
│   │   ├── history.ts      # kind:7376
│   │   └── nutzap.ts       # kind:9321, 10019
│   └── types.ts
├── test/
│   ├── adapter.test.ts
│   ├── nutzap.test.ts
│   └── crypto.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Phases

### Phase 1: Nip60Adapter
- [ ] NIP-44 encryption/decryption
- [ ] Parse kind:7375 token events
- [ ] Implement StorageAdapter interface (load/save/clear)
- [ ] Publish kind:7375 on save
- [ ] Delete old token events on spend
- [ ] Basic tests with mock NDK

### Phase 2: Nip60Wallet
- [ ] Wallet event (kind:17375) management
- [ ] P2PK key generation/storage
- [ ] Spending history (kind:7376)
- [ ] Sync conflict resolution
- [ ] Event subscriptions for live updates

### Phase 3: Nutzap Receiving
- [ ] kind:10019 info publishing
- [ ] kind:9321 subscription
- [ ] P2PK proof unlocking
- [ ] DLEQ verification
- [ ] Auto-redemption flow

### Phase 4: Nutzap Sending
- [ ] Fetch recipient kind:10019
- [ ] P2PK lock proofs
- [ ] Publish kind:9321
- [ ] Include DLEQ proofs

## Considerations

### Composability
- Nip60Adapter can be used with existing Wallet class
- Nutzap components work independently
- No changes needed to @wavlake/wallet core

### Security
- P2PK privkey is separate from Nostr identity
- All proof data is NIP-44 encrypted
- DLEQ proofs prevent fake nutzaps

### Offline Support
- Cache last-known state locally
- Sync on reconnect
- Handle conflicts gracefully

### Multi-Mint
- Support multiple mints per wallet
- Track proofs per mint
- Nutzap sender respects recipient's mint preferences

## Open Questions

1. **Conflict Resolution**: When local and remote state diverge, how to resolve?
   - Option A: Remote wins (simpler)
   - Option B: Merge with proof validation
   - Option C: User prompt

2. **Relay Selection**: Which relays to use?
   - User's NIP-65 relays?
   - Wallet-specific relays from kind:17375?
   - Configurable per-adapter?

3. **Key Management**: Where to store P2PK privkey?
   - In kind:17375 (encrypted)
   - Derived from Nostr key?
   - Separate storage?
