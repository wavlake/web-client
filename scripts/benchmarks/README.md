# Paywall Latency Benchmarks

Reference implementations for testing and benchmarking the Cashu ecash payment flow.

## Quick Start

```bash
cd scripts/benchmarks
npm install @cashu/cashu-ts  # if not already installed at root

# Run full benchmark suite
node benchmark-full.mjs

# Trace individual HTTP calls
node trace-playback.mjs
```

## Scripts

| Script | Description |
|--------|-------------|
| `benchmark-full.mjs` | Full suite — all 3 modes, collated results |
| `benchmark-single-request.mjs` | Side-by-side mode comparison |
| `benchmark-latency.mjs` | Detailed latency breakdown per phase |
| `benchmark-prewarm.mjs` | Cold vs warm wallet comparison |
| `trace-playback.mjs` | HTTP call trace with timing |

## Results Summary

See [BENCHMARK_RESULTS.md](./BENCHMARK_RESULTS.md) for full analysis.

| Mode | Avg | HTTP Calls | vs Cold |
|------|-----|------------|---------|
| Cold | 467ms | 8 | baseline |
| Warm | 191ms | 2 | -59% |
| **Single-request** | **124ms** | **1** | **-73%** |

**Floor latency: ~114ms** (server processing time)

## Three Playback Modes

### Cold (Current Implementation)
Full initialization on every play — 8 HTTP calls.

### Warm (Cached Wallet)
Wallet pre-warmed at app load, skip 402 discovery — 2 HTTP calls.

### Single-request (Pre-built Tokens)
Tokens pre-minted at login with exact denomination — 1 HTTP call.

## Configuration

Scripts use staging environment by default:

```javascript
const MINT_URL = 'https://nutshell-staging-....run.app';
const API_URL = 'https://api-staging-....run.app/api';
```

Update for production testing as needed.

## Wallet

Scripts expect a `wallet.json` file with proofs:

```json
{
  "mintUrl": "https://...",
  "unit": "usd",
  "proofs": [...],
  "balance": 10
}
```
