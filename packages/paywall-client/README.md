# @wavlake/paywall-client

Stateless API client for Wavlake paywall endpoints. Pure functions, no state, zero external dependencies.

## Installation

```bash
npm install @wavlake/paywall-client
```

## Quick Start

```typescript
import { PaywallClient } from '@wavlake/paywall-client';

const client = new PaywallClient({
  apiUrl: 'https://api.wavlake.com',
});

// Request content with payment
const result = await client.requestContent('track-dtag', cashuToken);

// Use the signed URL
const audio = new Audio(result.url);
audio.play();

// Replay within 10-minute grant window (no payment needed)
const replay = await client.replayGrant('track-dtag', result.grant.id);
```

## Endpoints

This client supports two paywall endpoints:

| Endpoint | Method | Use Case |
|----------|--------|----------|
| `/v1/audio` | `requestAudio()` | Direct binary streaming, embedded players |
| `/v1/content` | `requestContent()` | JSON with signed URL, grant replay support |

### Which endpoint should I use?

- **`/v1/audio`** - Simpler, single request, no grant replay. Good for embedded players and native apps.
- **`/v1/content`** - Returns a grant ID that allows replay within 10 minutes without re-payment. Better for web apps with seek/replay needs.

## API Reference

### PaywallClient

```typescript
const client = new PaywallClient({
  apiUrl: string;           // Required: API base URL
  defaultHeaders?: Record<string, string>;  // Optional: headers for all requests
  timeout?: number;         // Optional: request timeout in ms (default: 30000)
});
```

### Audio Endpoint

```typescript
// Request audio binary directly
const result = await client.requestAudio(dtag, token, {
  range?: string;  // HTTP Range header for seeking
});
// Returns: { audio: Blob, contentType: string, change?: string, changeAmount?: number }

// Generate URL with embedded token (for <audio src="...">)
const url = client.getAudioUrl(dtag, token);

// Check price (0 = free)
const price = await client.getAudioPrice(dtag);
```

### Content Endpoint

```typescript
// Request content with payment
const result = await client.requestContent(dtag, token, {
  grantId?: string;    // Replay existing grant
  nostrAuth?: string;  // NIP-98 for spending caps
});
// Returns: { url: string, grant: AccessGrant, change?: string, changeAmount?: number }

// Replay without payment
const replay = await client.replayGrant(dtag, grantId);

// Check price (0 = free or cap reached)
const price = await client.getContentPrice(dtag, nostrAuth?);
```

### Change Recovery

```typescript
// Fetch change from overpayment
const result = await client.fetchChange(paymentId);
// Returns: { paymentId: string, change: string | null, changeAmount?: number }

// Check if change exists
const hasIt = await client.hasChange(paymentId);
```

### Error Handling

```typescript
import { PaywallClient, PaywallError } from '@wavlake/paywall-client';

try {
  await client.requestContent(dtag, token);
} catch (error) {
  if (PaywallClient.isPaymentRequired(error)) {
    console.log(`Need ${error.requiredAmount} credits`);
    console.log(`Mint: ${error.expectedMint}`);
  } else if (PaywallClient.isTokenSpent(error)) {
    console.log('Token already used');
  } else if (PaywallClient.isKeysetMismatch(error)) {
    console.log('Wrong mint');
  }
}
```

### Standalone Functions

For tree-shaking, you can import functions directly:

```typescript
import { requestContent, getContentPrice } from '@wavlake/paywall-client';

const config = { apiUrl: 'https://api.wavlake.com' };
const price = await getContentPrice(config, dtag);
const result = await requestContent(config, dtag, token);
```

## Error Types

| Error | When |
|-------|------|
| `PaywallError` | API returned a payment-related error |
| `NetworkError` | Network request failed |
| `TimeoutError` | Request timed out |

### PaywallError Codes

| Code | Meaning |
|------|---------|
| `PAYMENT_REQUIRED` | Need to pay (402) |
| `INVALID_TOKEN` | Malformed token |
| `TOKEN_ALREADY_SPENT` | Double-spend attempt |
| `KEYSET_MISMATCH` | Token from wrong mint |
| `CONTENT_NOT_FOUND` | Track doesn't exist (404) |
| `INVALID_GRANT` | Grant expired or invalid |
| `RATE_LIMITED` | Too many requests (429) |

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  PaywallClientConfig,
  AudioResult,
  ContentResult,
  AccessGrant,
  ChangeResult,
  PaymentError,
  PaymentErrorCode,
} from '@wavlake/paywall-client';
```

## Browser & Node.js

Works in both environments. Uses native `fetch` (available in Node.js 18+).

## License

MIT
