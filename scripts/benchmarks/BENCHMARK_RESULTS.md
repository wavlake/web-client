# Paywall Latency Benchmark Results

**Date:** 2026-01-30  
**Environment:** Staging (services pre-warmed to simulate production)  
**Track:** `staging-test-paywall-track` (1 credit)

---

## Summary

| Mode | Avg | Min | Max | vs Cold | HTTP Calls |
|------|-----|-----|-----|---------|------------|
| Cold | 467ms | 282ms | 603ms | baseline | 8 |
| Warm | 191ms | 119ms | 317ms | -59% | 2 |
| **Single-request** | **124ms** | **114ms** | **137ms** | **-73%** | **1** |

**Floor latency: ~114ms** (irreducible server processing time)

---

## Modes Explained

### Mode 1: Cold Playback (Current Implementation)
Full initialization on every play request.

```
1. GET  /v1/info        ─┐
2. GET  /v1/keysets      │ Wallet init (redundant)
3. GET  /v1/info         │
4. GET  /v1/keysets      │ wallet.loadMint()
5. GET  /v1/keys        ─┘
6. GET  /v1/content/{track}     → 402 (discovery)
7. POST /v1/swap                 → mint swap
8. GET  /v1/content/{track}     → 200 + audio URL
```

**Breakdown (avg):**
- Wallet init: 137ms
- 402 discovery: 27ms
- Mint swap: 173ms
- Paid request: 130ms
- **Total: 467ms**

### Mode 2: Warm Playback (Cached Wallet + Skip 402)
Wallet pre-warmed at app load, price known from metadata.

```
1. POST /v1/swap                 → mint swap
2. GET  /v1/content/{track}     → 200 + audio URL
```

**Breakdown (avg):**
- Wallet init: 0ms (cached)
- 402 discovery: 0ms (skipped)
- Mint swap: 67ms
- Paid request: 124ms
- **Total: 191ms**

### Mode 3: Single-Request (Pre-built Tokens)
Tokens pre-minted with exact denomination at app load.

```
1. GET  /v1/content/{track}     → 200 + audio URL
   Header: X-Ecash-Token: <pre-built token>
```

**Breakdown (avg):**
- Wallet init: 0ms
- 402 discovery: 0ms
- Mint swap: 0ms
- Paid request: 124ms
- **Total: 124ms**

---

## Raw Data

### Cold Playback (3 runs)
| Run | Total | Init | 402 | Swap | Pay |
|-----|-------|------|-----|------|-----|
| 1 | 516ms | 134ms | 28ms | 216ms | 138ms |
| 2 | 282ms | 133ms | 26ms | 0ms | 123ms |
| 3 | 603ms | 143ms | 27ms | 304ms | 129ms |

### Warm Playback (3 runs)
| Run | Total | Init | Swap | Pay |
|-----|-------|------|------|-----|
| 1 | 136ms | 0ms | 0ms | 136ms |
| 2 | 317ms | 0ms | 200ms | 117ms |
| 3 | 119ms | 0ms | 0ms | 119ms |

### Single-Request Playback (3 runs)
| Run | Total |
|-----|-------|
| 1 | 114ms |
| 2 | 137ms |
| 3 | 122ms |

---

## Key Findings

1. **Mint swap has high variance (0-304ms)** — depends on whether proofs need splitting. When proofs are exact denomination, swap returns instantly.

2. **Single-request is most consistent** — 114-137ms range (23ms variance) vs cold's 282-603ms range (321ms variance).

3. **Floor latency is ~114ms** — this is the server processing time (token validation + URL signing). Cannot be reduced client-side.

4. **73% improvement possible** — from 467ms (cold) to 124ms (single-request).

---

## Recommendations

### For Production Implementation

1. **Pre-warm wallet on app load**
   - Call `wallet.loadMint()` immediately after login
   - Moves 137ms off critical path

2. **Cache track prices**
   - Store `price_credits` from track metadata
   - Skip 402 discovery entirely

3. **Pre-build tokens in background**
   - Mint N tokens with exact denomination (e.g., 10 × 1-credit)
   - Replenish when cache runs low
   - Eliminates mint swap latency entirely

4. **Target: <150ms playback latency**
   - Single HTTP request
   - Guaranteed consistent performance

---

## Scripts

All benchmark scripts in `wavlake-client/`:

| Script | Purpose |
|--------|---------|
| `benchmark-full.mjs` | Full suite, all 3 modes, collated results |
| `benchmark-single-request.mjs` | Side-by-side comparison of modes |
| `benchmark-latency.mjs` | Detailed latency breakdown |
| `benchmark-prewarm.mjs` | Cold vs warm comparison |
| `trace-playback.mjs` | HTTP call trace with timing |

Run with: `node <script>.mjs`

---

## Test Environment

- **Mint:** `https://nutshell-staging-854568123236.us-central1.run.app`
- **API:** `https://api-staging-854568123236.us-central1.run.app/api`
- **Track:** `staging-test-paywall-track`
- **Price:** 1 credit
- **All requests:** Successful (9/9)
