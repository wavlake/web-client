# Benchmark Scripts vs Monorepo: Comparison

**Date:** 2026-01-30  
**Purpose:** Understand why benchmark scripts work smoothly while monorepo web app had issues.

---

## TL;DR

The benchmark scripts work because they're **minimal and synchronous** — no layers, no state management, no Service Workers. The monorepo has **5+ abstraction layers** that each add complexity, potential race conditions, and failure points.

---

## Architecture Comparison

### Benchmark Scripts (Simple)

```
User clicks play
    ↓
wallet.loadMint()           ← Direct cashu-ts call
    ↓
fetch() with X-Ecash-Token  ← Direct HTTP
    ↓
Audio URL returned
```

**Total layers:** 1  
**State management:** JSON file  
**Async coordination:** None (sequential)

### Monorepo Web App (Complex)

```
User clicks play
    ↓
useAudioStream hook
    ↓
├→ usePaywallGrant (grant cache check)
├→ useAudioServiceWorker (SW registration check)
│   ↓
│   Service Worker intercepts /audio/:dtag
│   ↓
│   setPendingToken → postMessage to SW
│   ↓
│   SW injects X-Ecash-Token header
    ↓
useContentAccess hook
    ↓
walletCache.ts (singleton + promise deduplication)
    ↓
CashuWalletClient (wrapper class)
    ↓
cashu-ts Wallet
    ↓
NIP-60 proof storage (NDK + Nostr events)
    ↓
proofState.ts (localStorage state machine)
```

**Total layers:** 7+  
**State management:** React state + localStorage + Nostr events + Service Worker  
**Async coordination:** Multiple concurrent promises, message passing, event listeners

---

## Key Differences

### 1. Wallet Initialization

**Benchmark scripts:**
```javascript
const mint = new Mint(MINT_URL);
const wallet = new Wallet(mint, { unit: 'usd' });
await wallet.loadMint();  // Single async call
```

**Monorepo:**
```javascript
// walletCache.ts - 400+ lines
// Handles: singleton, deduplication, retry, status tracking, listeners
const wallet = await getOrCreateWallet(config);

// CashuWalletClient - 450+ lines  
// Wraps cashu-ts with validation, error handling, keyset checks
await wallet.initialize();
```

**Verdict:** Monorepo has proper caching but adds complexity. If the cache or retry logic has a bug, it's hard to trace.

### 2. Token/Header Injection

**Benchmark scripts:**
```javascript
const token = getEncodedTokenV4({ mint, proofs, unit: 'usd' });
fetch(url, { headers: { 'X-Ecash-Token': token } });
```

**Monorepo:**
```javascript
// Option 1: Service Worker path
setPendingToken(dtag, proofs, mintUrl);  // Posts to SW
// SW intercepts fetch, injects header
// SW posts back PROOFS_SPENT or PAYMENT_REQUIRED

// Option 2: Direct header path (fallback)
// Goes through useContentAccess with manual header
```

**Verdict:** Service Worker adds a message-passing layer that can fail silently. If SW isn't registered, isn't active, or loses the pending token, the request goes through without payment.

### 3. Proof Management

**Benchmark scripts:**
```javascript
// wallet.json - simple array
{ "proofs": [...], "balance": 15 }
```

**Monorepo:**
```javascript
// NIP-60: Proofs stored as Nostr events
// proofState.ts: localStorage state machine
// States: available → pending → spent/uncertain
// Multiple listeners and state transitions
```

**Verdict:** NIP-60 is more robust for multi-device sync, but adds Nostr relay latency and potential sync issues.

### 4. Error Handling

**Benchmark scripts:**
```javascript
// Throws on error, crashes visibly
if (resp.status !== 200) throw new Error(...);
```

**Monorepo:**
```javascript
// Errors propagate through multiple layers
// Each layer may catch, transform, or swallow errors
// Status tracked in React state, localStorage, SW
// Silent failures possible
```

**Verdict:** Monorepo's defensive error handling can mask root causes.

---

## Likely Pain Points in Monorepo

### 1. Service Worker Race Conditions

The SW path requires:
1. SW registered and active
2. `setPendingToken()` completes before fetch
3. SW intercepts the right URL pattern
4. SW has the token when request arrives

Any timing issue = request without payment header.

### 2. Promise Deduplication Edge Cases

`walletCache.ts` deduplicates concurrent init calls, but:
- What if init fails mid-flight for some callers?
- Retry logic adds more async complexity
- Status listeners may fire out of order

### 3. NIP-60 Sync Issues

Proofs stored as Nostr events means:
- Relay latency affects balance visibility
- Multiple devices can have stale proof state
- "Spent" proofs might still appear available locally

### 4. State Machine Complexity

`proofState.ts` tracks: `available → pending → spent/uncertain`

Edge cases:
- Request times out → proofs stuck in "uncertain"
- SW crashes → pending proofs never resolved
- localStorage gets cleared → state lost

---

## What the Monorepo Gets Right

1. **Wallet caching** - `walletCache.ts` correctly caches and pre-warms
2. **Optimized init** - Only calls `loadMint()`, validates after
3. **Grant caching** - Replays signed URLs within window
4. **Proper types** - TypeScript throughout
5. **Observability** - Sentry integration for tracing

---

## Recommendations

### Short-term: Debug the Integration

1. **Add logging to SW message passing** - Are tokens reaching the SW?
2. **Verify SW intercept pattern** - Is `/audio/:dtag` matching?
3. **Check NIP-60 proof loading** - Are proofs available when needed?
4. **Trace the full flow** - Add timestamps at each layer

### Medium-term: Simplify the Happy Path

1. **Skip SW for initial implementation** - Use direct header injection
2. **Local proofs first** - Don't wait for NIP-60 sync
3. **Reduce abstraction layers** - Inline some hooks

### Long-term: Consider the Benchmark Approach

The benchmark's "single-request mode" proves you can achieve **124ms playback** with:
- Pre-warmed wallet (at app load)
- Pre-built tokens (exact denomination)
- Direct header injection (no SW)
- 1 HTTP call (no 402 discovery)

This could be a "fast path" in the monorepo for users with sufficient balance.

---

## Summary Table

| Aspect | Benchmark Scripts | Monorepo |
|--------|-------------------|----------|
| Lines of code | ~200 | ~2000+ |
| Abstraction layers | 1 | 7+ |
| Wallet init | Direct | Cached + retry + status |
| Header injection | Direct fetch | Service Worker |
| Proof storage | JSON file | NIP-60 + localStorage |
| Error visibility | Throws/crashes | Silent failures possible |
| Latency (single-request) | 124ms | TBD (should be similar) |
| Complexity | Low | High |
| Production-ready | No | Yes (with debugging) |

---

## Files Referenced

**Monorepo:**
- `apps/web/src/lib/cashu/wallet.ts` - Wallet wrapper
- `apps/web/src/lib/cashu/walletCache.ts` - Singleton cache
- `apps/web/src/lib/cashu/proofState.ts` - State machine
- `apps/web/src/hooks/useContentAccess.ts` - API hook
- `apps/web/src/hooks/useAudioStream.ts` - Stream URL hook
- `apps/web/src/hooks/useAudioServiceWorker.ts` - SW management

**Benchmark scripts:**
- `scripts/benchmarks/benchmark-full.mjs`
- `scripts/benchmarks/trace-playback.mjs`
