# E2E Test Side Effects

This document tracks all side effects that occur when running E2E tests against the staging environment.

## Overview

| Resource | Test Impact | Reversible? | Notes |
|----------|------------|-------------|-------|
| Ecash proofs | **CONSUMED** | ❌ No | Real money - handle carefully |
| Artist earnings | Increased | ❌ No | Accumulates with each paid stream |
| Artist stream count | Increased | ❌ No | Permanent record |
| Listener spending | Increased | ❌ No | Affects spending cap |
| Grants | Created | ⏳ TTL | Auto-expire after 10 minutes |
| Mint proof state | Marked spent | ❌ No | One-time use |

---

## Detailed Side Effects

### 1. Ecash Proof Consumption

**When:** Any test that sends `X-Ecash-Token` header or `?token=` URL param

**What happens:**
- Proof is burned at the mint (marked as spent)
- Cannot be reused
- Server may return change tokens

**Affected tests:**
- `content.test.ts` → "Paid Content - With Token" (skipped)
- `content.test.ts` → "Paid Audio - With Token" (skipped)
- `phase5.test.ts` → "Paid Content with URL Token" (skipped)

**Mitigation:**
```typescript
// Always capture and return change
const result = await requestContent(dtag, token);
if (result.data?.change) {
  addChangeProofs(decodeToken(result.data.change).proofs);
}
```

### 2. Artist Earnings Increase

**When:** Any successful paid stream

**What happens:**
- Artist's `lifetime_earnings_credits` increases
- Stream is recorded in `by_track` breakdown
- `time_series` data updated for the day

**Affected endpoints:**
- `GET /v1/artist/stats` (reads)
- `GET /v1/artist/earnings` (reads)

**Test impact:**
- After running paid stream tests, artist stats will show higher numbers
- No way to reset without database access

**Mitigation:**
- Use test artist account that's expected to have test data
- Document baseline values before test runs
- Consider adding "test" flag to streams (if API supports)

### 3. Artist Stream Count Increase

**When:** Any successful content/audio access (paid OR free)

**What happens:**
- `streams.total` increments
- `streams.paid` or `streams.free` increments
- Stream event created in history

**Affected endpoints:**
- `GET /v1/artist/streams` (reads history)

**Mitigation:**
- Accept that stream counts grow over time
- Use relative assertions (`newCount > oldCount`) not absolute

### 4. Listener Spending Accumulation

**When:** Paid streams with identity (NIP-98 or URL signature)

**What happens:**
- Listener's monthly spending increases
- May trigger free tier access after cap reached

**Affected endpoints:**
- `GET /v1/listener/spending-status`

**Mitigation:**
- Track spending per test run
- Reset monthly (automatic)
- Consider using different test listener keys per test

### 5. Grant Creation

**When:** Successful paid content access

**What happens:**
- Grant ID created with 10-minute TTL
- Can be replayed for re-access without payment

**Side effects:**
- Grants auto-expire, minimal cleanup needed
- Multiple grants for same content are allowed

### 6. Mint State Changes

**When:** Token verification/burn

**What happens:**
- Proof secrets marked as spent in mint DB
- Attempted reuse returns "already spent" error

**Mitigation:**
- Never retry with same proofs
- Validate proofs before test if uncertain

---

## Test Categories by Side Effect

### 🟢 Read-Only (Safe to run repeatedly)
- `mint.test.ts` - Info, keysets, quotes (unpaid)
- `artist.test.ts` - Stats, earnings, streams (reads only)
- `content.test.ts` - Free content, 402 checks
- `phase5.test.ts` - Free content, change endpoint format

### 🟡 Writes Test Data (Accumulates)
- `artist.test.ts` - "Payment → Royalty Flow" (if enabled)
- Any paid stream tests

### 🔴 Consumes Real Value
- All tests using `withdrawProofs()` or `X-Ecash-Token`
- Currently all skipped by default

---

## Running Tests Safely

### Before running paid tests:
```bash
# Check pool balance
node -e "import('./tests/e2e/helpers/proof-pool.ts').then(m => console.log(m.getPoolStatus()))"

# Record baseline artist stats
curl -s "$API_URL/v1/artist/stats" -H "Authorization: Nostr $(nip98token)" | jq
```

### After running paid tests:
```bash
# Verify pool balance (should show change returned)
cat proofs.json | jq '[.[].amount] | add'

# Check artist earnings increased
curl -s "$API_URL/v1/artist/earnings" -H "Authorization: ..." | jq '.data.summary'
```

---

## Cost Per Test Run

| Test Suite | Estimated Cost | Notes |
|------------|---------------|-------|
| Read-only tests | 0 credits | Safe |
| Single paid stream | 2 credits | Test track price |
| Full paid flow | ~10 credits | Multiple streams + overpay tests |
| Royalty verification | 2-4 credits | Stream + verification |

**Current pool:** Check `proofs.json`

---

## Recovery Procedures

### If proofs lost (test crashed):
```bash
# Restore from backup
cp proofs.backup.json proofs.json
```

### If proofs spent but test failed:
- Check server response for change tokens
- Manually decode and add to pool if found
- Lost proofs cannot be recovered

### If pool depleted:
```bash
# Create new mint quote
curl -s "$MINT_URL/v1/mint/quote/bolt11" -d '{"amount":100,"unit":"usd"}'
# Pay invoice, then:
node scripts/mint-tokens.mjs <quoteId> 100
```
