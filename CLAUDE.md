# CLAUDE.md

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
