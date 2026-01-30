# CLAUDE.md

Wavlake Web Client + SDK Monorepo.

## Packages

```
packages/
├── paywall-client/    # @wavlake/paywall-client - Stateless API client
├── wallet/            # @wavlake/wallet - Cashu wallet state (TODO)
├── paywall-react/     # @wavlake/paywall-react - React hooks (TODO)
└── credits-client/    # Reference implementation (single file)
```

## SDK Implementation Status

See `/home/clawd/clawd/users/josh_1994891486/workspace/paywall-sdk-plan/PLAN.md` for full plan.

- [x] Phase 1: `@wavlake/paywall-client` - COMPLETE
- [ ] Phase 2: `@wavlake/wallet`
- [ ] Phase 3: `@wavlake/paywall-react`
- [ ] Phase 4: `@wavlake/paywall-react-native`
- [ ] Phase 5: Documentation & Examples

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

## Gotchas

**Header name:** `X-Ecash-Token` (not X-Cashu-Token)

**Response formats:** Handle both flat and nested:
```typescript
const url = data.data?.url || data.url;
```

**Wallet.send() returns:** `{ send: Proof[], keep: Proof[] }`
- `send` = proofs to pay with
- `keep` = change to retain
