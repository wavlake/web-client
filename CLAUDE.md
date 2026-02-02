# CLAUDE.md

Wavlake Web Client + SDK Monorepo.

## Packages

```
packages/
├── paywall-client/       # @wavlake/paywall-client - Stateless API client
├── wallet/               # @wavlake/wallet - Cashu wallet with pluggable storage
├── nostr-wallet/         # @wavlake/nostr-wallet - NIP-60/61 storage adapter
├── paywall-react/        # @wavlake/paywall-react - React hooks + providers
├── paywall-react-native/ # @wavlake/paywall-react-native - RN adapter
└── credits-client/       # Reference implementation (single file)
```

## Examples

```
examples/
└── paywall-demo/    # POC v2 - deployed to GitHub Pages
```

## SDK Implementation Status

- [x] Phase 1: `@wavlake/paywall-client` - Stateless API client
- [x] Phase 2: `@wavlake/wallet` - Wallet with local/memory storage
- [x] Phase 3: `@wavlake/nostr-wallet` - NIP-60 relay storage
- [x] Phase 4: `@wavlake/paywall-react` - React hooks + providers
- [x] Phase 5: `@wavlake/paywall-react-native` - RN adapter (basic)
- [x] POC v2 Demo - GitHub Pages deployment

---

## Web Client (apps/web)

Debug client for Wavlake paywall system. **Expose everything.**

## Purpose

Test harness for:
1. Track discovery (kind 30440)
2. Cashu wallet (proofs, balance)
3. Content API (402 → payment → access)
4. Audio playback (signed URLs, grants)

**Every action should be visible in debug logs.**

## Stack

React 18 + TypeScript + Vite + NDK + cashu-ts + Zustand

## Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

## Project Structure

```
src/
├── components/
│   ├── DebugLayout.tsx    # Main 3-panel layout
│   ├── DebugPanel.tsx     # Collapsible debug panel
│   ├── TrackList.tsx      # Track browser
│   ├── WalletPanel.tsx    # Wallet state display
│   ├── PlayerDebug.tsx    # Playback debug info
│   └── ApiConfigPanel.tsx # API URL config
├── hooks/
│   ├── useTracks.ts       # Query kind 30440
│   ├── useContentAccess.ts # Paywall API
│   └── useAudioPlayer.ts  # Audio element
├── stores/
│   ├── debug.ts           # Log entries
│   ├── wallet.ts          # Cashu proofs
│   └── player.ts          # Playback state
├── lib/
│   ├── ndk.tsx            # Nostr connection
│   ├── cashu.ts           # Cashu wallet wrapper
│   ├── api.ts             # API client
│   └── parsers.ts         # Event parsing
└── types/
    └── nostr.ts           # Event types
```

## Key Flows

### Purchase Flow (Debug Visible)

1. Click paywalled track
2. Log: `REQUEST GET /content/{dtag}`
3. Log: `RESPONSE 402 { priceCredits, mintUrl }`
4. Show purchase prompt with price
5. User confirms
6. Log: `WALLET spending {n} proofs`
7. Log: `REQUEST GET /content/{dtag} + X-Ecash-Token`
8. Log: `RESPONSE 200 { url, grant }`
9. Log: `PLAYER loading signed URL`
10. Audio plays

### Wallet State

Always visible:
- Total balance (sum of proof amounts)
- Individual proofs with amounts
- Pending proofs (being spent)
- Last transaction

### Grant Cache

- Grant ID for replay
- Expiry countdown
- Signed URL (truncated)

## API Integration

```typescript
// Content access
GET /api/v1/content/{dtag}

// Headers
X-Ecash-Token: cashuB...  // Payment
X-Access-Grant: {id}      // Replay

// Responses
200: { url, grant, streamType }
402: { priceCredits, mintUrl, paymentMethods }
```

## Debug Logging

Every significant action logs to debug store:

```typescript
debugStore.addLog({
  timestamp: new Date(),
  type: 'request' | 'response' | 'wallet' | 'player' | 'error',
  label: 'GET /content/abc123',
  data: { /* full request/response */ }
});
```

## Payment Modes

Three strategies for paying at play time, configurable via Settings:

### 1. SINGLE-REQUEST (fastest, ~124ms)
Pre-built tokens + one HTTP request. Best UX.

```typescript
// Token cache pre-builds exact denomination tokens on load
const token = useTokenCacheStore.getState().popToken();
// Single request with payment
const response = await fetch(`/content/${dTag}`, {
  headers: { 'X-Ecash-Token': token.token }
});
```

### 2. JIT (Just-In-Time, ~300-400ms)
Swap proofs at play time, keep change client-side.

```typescript
import { jitSwap } from './lib/jitSwap';
const { token, keepProofs } = await jitSwap(price, proofs);
```

### 3. DIRECT (server-side change)
Send overpayment, server returns change proofs.
Simplest client code, server handles denomination.

## Cashu Token Format

Using v4 tokens (cashuB...):

```typescript
import { getEncodedTokenV4 } from '@cashu/cashu-ts';

const token = getEncodedTokenV4({
  mint: mintUrl,
  proofs,
  unit: 'usd',
});
```

## Key Stores

```
stores/
├── wallet.ts       # Cashu proofs (persistent)
├── tokenCache.ts   # Pre-built tokens for single-request (persistent)
├── settings.ts     # Feature toggles: prebuildEnabled, jitSwapEnabled
├── player.ts       # Playback state
└── debug.ts        # Debug log entries
```

## Crypto Dependencies

For Nostr key operations, use noble/scure directly (not nostr-tools):

```typescript
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';

// Decode nsec → hex private key
const { words } = bech32.decode(nsec, 1500);
const privkeyHex = bytesToHex(new Uint8Array(bech32.fromWords(words)));

// Derive pubkey
const pubkeyHex = bytesToHex(schnorr.getPublicKey(privkeyHex));
```

## NIP-60 Wallet Storage

The SDK supports syncing wallet proofs to Nostr relays via NIP-60.

### Configuration

```typescript
import { Nip60Adapter } from '@wavlake/nostr-wallet';

const storage = new Nip60Adapter({
  ndk,
  signer,
  mintUrl: MINT_URL,
  unit: 'usd',  // Important: match keyset unit!
});

const wallet = new Wallet({ mintUrl, storage, unit: 'usd' });
```

### Relay Priority

Primary relay for NIP-60: `wss://relay.wavlake.com`

```typescript
const RELAYS = [
  'wss://relay.wavlake.com',  // Primary for wallet storage
  'wss://relay.damus.io',
  'wss://nos.lol',
];
```

### Event Kinds

- `kind:17375` - Wallet event (P2PK keys, mints)
- `kind:7375` - Token events (encrypted proofs)
- `kind:7376` - Spending history

## Gotchas

**Header name:** `X-Ecash-Token` (not X-Cashu-Token)

**Response formats:** Handle both flat and nested:
```typescript
const url = data.data?.url || data.url;
```

**Wallet.send() returns:** `{ send: Proof[], keep: Proof[] }`
- `send` = proofs to pay with
- `keep` = change to retain

**Keyset unit matters:** The mint has separate keysets for `sat` and `usd`. 
Always specify `unit: 'usd'` for USD credits:

```typescript
// Correct
const wallet = new Wallet({ mintUrl, storage, unit: 'usd' });

// Wrong - will use sat keyset
const wallet = new Wallet({ mintUrl, storage });
```

**Mint keysets:**
- `00ad82d4e3acaf21` - USD, 0 fee (preferred)
- `009c98fd4a55013a` - USD, 100 ppk fee
- `000542834cffddfb` - sat, 0 fee
- `00c89963a0eb87a3` - sat, 100 ppk fee

**Unit conversion in API:** The API handles sat vs usd amounts differently:
- `sat` unit: amount × 1000 (converted to msats internally)
- `usd` unit: amount used directly as credits
Never mix units! A 2-credit payment with sat keyset would be interpreted as 2000 msats.

**Wallet init optimization:** Avoid redundant mint API calls by:
1. Computing effective mode (`'local'` vs `'nostr'`) as a single value
2. Only re-run effect when mode actually changes
3. Use refs for ndk/signer to avoid stale closures

```typescript
// Bad: triggers on every dep change
useEffect(() => { ... }, [walletStorage, isLoggedIn, ndk, connected, signer]);

// Good: triggers only when mode changes
const effectiveMode = canUseNostr ? 'nostr' : 'local';
useEffect(() => { ... }, [effectiveMode]);
```

**nsec decoding:** Use `@scure/base` directly, not dynamic imports:

```typescript
import { bech32 } from '@scure/base';
const { words } = bech32.decode(nsec, 1500);
const privkeyBytes = bech32.fromWords(words);
```

---

## E2E Testing

Integration tests against staging API in `tests/e2e/`.

### Commands

```bash
npm run test:e2e          # Run all E2E tests
npm run test:e2e:payment  # Payment flow tests only
```

### Proof Pool

E2E tests use real ecash proofs from `proofs.json`. The pool manager handles:
- Withdrawing proofs for test payments
- Returning change after successful calls
- Automatic backup before modifications

```typescript
import { withdrawProofs, returnProofs } from './helpers/proof-pool';

const { proofs, token, total } = withdrawProofs(amount);
// Use token in test...
// If test fails before spend:
returnProofs(proofs);
```

**Check pool status:**
```bash
node scripts/proof-pool-status.ts
```

### Side Effects

See `tests/e2e/SIDE_EFFECTS.md` for full documentation. Key points:
- Ecash proofs are **consumed permanently** when spent
- Artist earnings/stream counts accumulate (not reversible)
- Grants auto-expire (10 min TTL)
- Read-only tests are safe to run repeatedly

### Snapshots

The snapshot system (`tests/e2e/snapshots/`) tracks state changes over time:
- Artist balance/earnings before and after
- Proof pool balance
- Stream counts

Used to verify royalty flows and detect unexpected side effects.
