# Wavlake Credits Client

Minimal reference implementation for paying to play tracks with Cashu ecash credits.

## Quick Start

```bash
npm install @cashu/cashu-ts
```

```typescript
import { WavlakeCreditsClient } from './credits-client';

const client = new WavlakeCreditsClient({
  mintUrl: 'https://mint.wavlake.com',
  apiUrl: 'https://api.wavlake.com',
});

// Initialize wallet (do once on app load)
await client.init();

// Add credits to wallet (from Lightning payment)
await client.mintCredits(quoteId, amount);

// Play a track
const { url } = await client.playTrack('track-dtag-here');
// url = signed audio URL, ready to stream
```

## Core Concepts

### 1. Credits are Cashu Ecash Tokens

- 1 credit = $0.01 USD
- Stored as cryptographic proofs in local storage
- Bearer tokens - if you lose them, they're gone

### 2. Payment Flow

```
┌─────────────────────────────────────────────────────────┐
│  SLOW PATH (~500ms)                                     │
│  1. GET /content/{dtag} → 402 + price                   │
│  2. Swap proofs at mint → exact amount                  │
│  3. GET /content/{dtag} + X-Ecash-Token → audio URL     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FAST PATH (~120ms)                                     │
│  Pre-build tokens with exact denomination               │
│  1. GET /content/{dtag} + X-Ecash-Token → audio URL     │
└─────────────────────────────────────────────────────────┘
```

### 3. Token Pre-building (Optimization)

Pre-swap proofs into exact denominations matching track prices:

```typescript
// If tracks cost 1, 2, or 5 credits
await client.prebuildTokens([1, 2, 5]);

// Now playTrack() uses pre-built tokens (single HTTP call)
```

## Files

| File | Description |
|------|-------------|
| `credits-client.ts` | Main client class (~200 lines) |
| `example-usage.ts` | Complete integration example |

## API Reference

### `new WavlakeCreditsClient(config)`

```typescript
interface Config {
  mintUrl: string;  // Cashu mint URL
  apiUrl: string;   // Wavlake API base URL
}
```

### `client.init(): Promise<void>`

Initialize the wallet. Call once on app load.

### `client.getBalance(): number`

Get current balance in credits.

### `client.mintCredits(quoteId: string, amount: number): Promise<void>`

Mint credits from a paid Lightning quote.

### `client.playTrack(dtag: string): Promise<{ url: string }>`

Pay for and get audio URL. Uses pre-built token if available, otherwise does full swap.

### `client.prebuildTokens(amounts: number[]): Promise<void>`

Pre-build tokens for specific amounts. Call after loading track list.

## Minimal Example

See `example-usage.ts` for a complete 50-line integration.

## Production Considerations

1. **Persist proofs** - Save to localStorage/IndexedDB after every change
2. **Handle errors** - Mint can be down, proofs can be spent
3. **Pre-warm wallet** - Call `init()` early (on login, not on play)
4. **Pre-build tokens** - Scan track prices, prebuild on load

## License

MIT
