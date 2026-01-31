# E2E Test Gaps PRD

**Date:** 2026-01-31  
**Status:** Backlog  
**Priority:** Medium  
**Author:** Clawd  

---

## Overview

The e2e test suite currently covers ~95% of the paywall flow spec'd in `PAYWALL_ENDPOINTS.md`. This PRD captures the remaining gaps that require additional infrastructure (funded wallets, specific track configurations) to test.

## Current Coverage

**44 tests passing, 14 skipped**

Fully tested:
- All token delivery methods (header, URL params, Authorization variants)
- URL-based identity (token signature, timestamp signature)
- NIP-98 authentication
- Free/paid content access flows
- 402 payment required responses
- Grant replay system
- Change recovery endpoint
- Mint operations
- Artist dashboard APIs

## Gaps

### 1. Payment Flow Tests (High Priority)

**Problem:** Cannot test actual payment acceptance without funded test wallet.

**Tests Needed:**
- [ ] Paid content access with valid token → 200 + content URL
- [ ] AudioHandler streaming with valid token → 200 + binary audio
- [ ] Change token returned when overpaying
- [ ] Change amount matches overpayment
- [ ] Proofs marked as spent after successful payment

**Requirements:**
- Test wallet with pre-funded proofs (suggest: 100 credits in test pool)
- Automated refill mechanism or manual top-up process
- Proof pool isolation (don't mix with production)

**Implementation Options:**

```typescript
// Option A: Pre-funded test wallet (recommended)
// Store test proofs in env or secure config
const TEST_PROOFS = JSON.parse(process.env.TEST_PROOF_POOL || '[]');

// Option B: Mint before each test run
// Requires paying Lightning invoices - not ideal for CI
beforeAll(async () => {
  const quote = await createMintQuote(100);
  // Manual or automated invoice payment...
});

// Option C: Mock at API boundary
// Less realistic but works for CI
vi.mock('../helpers/api', () => ({
  requestContent: vi.fn().mockResolvedValue({ ok: true, url: '...' }),
}));
```

**Recommendation:** Option A with a dedicated test proof pool that gets manually refilled periodically.

---

### 2. Double-Spend Detection (Medium Priority)

**Problem:** Cannot test TOKEN_ALREADY_SPENT error without first spending a token.

**Tests Needed:**
- [ ] Second request with same token → 402 TOKEN_ALREADY_SPENT
- [ ] Error includes helpful message for client recovery

**Requirements:**
- Funded test wallet (see #1)
- Capture spent proof from successful payment
- Immediately retry with same proof

**Test Outline:**
```typescript
it('should reject already-spent token', async () => {
  // First request succeeds
  const result1 = await requestContent(dtag, validToken);
  expect(result1.ok).toBe(true);
  
  // Second request with same token fails
  const result2 = await requestContent(dtag, validToken);
  expect(result2.status).toBe(402);
  expect(result2.error.code).toBe('TOKEN_ALREADY_SPENT');
});
```

---

### 3. Spending Cap Exhaustion (Medium Priority)

**Problem:** Cannot test free-tier access without spending 1000 credits first.

**Tests Needed:**
- [ ] Listener with 1000+ credits spent gets free access
- [ ] Free access recorded as `free_tier` stream type
- [ ] Cap resets monthly

**Requirements:**
- Test listener identity (have this: `testListener.nsec`)
- 1000 credits worth of payments with NIP-98 auth
- Or: API endpoint to artificially set spending (test-only)

**Implementation Options:**

```typescript
// Option A: Actually spend 1000 credits (expensive, slow)
// Not recommended for regular CI

// Option B: Test-only API to set listener spending
// POST /api/v1/test/set-listener-spending
// { pubkey: "...", amount: 1000 }

// Option C: Database seed for test environment
// Insert listener_spending record directly
```

**Recommendation:** Option B - add test-only endpoint (disabled in production) to manipulate listener spending for testing.

---

### 4. Honor Mode (Low Priority)

**Problem:** No honor-mode track configured in staging.

**Tests Needed:**
- [ ] Honor track returns 200 without payment
- [ ] Payment recorded if provided (optional tip)
- [ ] Stream recorded as `honor_paid` or `honor_unpaid`

**Requirements:**
- Configure a test track with `access_mode: honor`
- Or: API to temporarily set track access mode

**Test Outline:**
```typescript
it('should return content without payment for honor track', async () => {
  const result = await requestContent(HONOR_TRACK_DTAG);
  expect(result.ok).toBe(true);
  expect(result.data.stream_type).toBe('honor_unpaid');
});

it('should record payment if provided for honor track', async () => {
  const result = await requestContent(HONOR_TRACK_DTAG, validToken);
  expect(result.ok).toBe(true);
  expect(result.data.stream_type).toBe('honor_paid');
});
```

---

### 5. Concurrent Payment Race Conditions (Low Priority)

**Problem:** Cannot easily test race conditions in automated tests.

**Tests Needed:**
- [ ] Two simultaneous payments for same track → one succeeds, one fails
- [ ] No double-charging
- [ ] Graceful handling of mint unavailability mid-request

**Requirements:**
- Parallel test execution
- Timing coordination
- Possibly: chaos engineering tooling

**Implementation:**
```typescript
it('should handle concurrent payments gracefully', async () => {
  const [result1, result2] = await Promise.all([
    requestContent(dtag, token1),
    requestContent(dtag, token2),
  ]);
  
  // Both might succeed (different tokens) or one might fail
  // Key: no double-charge, no data corruption
  const successes = [result1, result2].filter(r => r.ok);
  expect(successes.length).toBeGreaterThanOrEqual(1);
});
```

---

### 6. Edge Cases (Low Priority)

**Tests Needed:**
- [ ] V3 (cashuA) token handling
- [ ] Keyset mismatch error (token from wrong mint)
- [ ] HTTP Range requests for seeking
- [ ] Rate limiting (429) behavior
- [ ] Malformed dtag handling

**Requirements:**
- V3 token generation (cashu-ts supports this)
- Token from different mint
- Rate limit testing requires careful throttling

---

## Implementation Plan

### Phase 1: Test Wallet Infrastructure
1. Create isolated test proof pool
2. Document refill process
3. Add CI secrets for test proofs
4. Implement proof pool helpers

### Phase 2: Payment Flow Tests
1. Valid payment → success
2. Overpayment → change
3. Double-spend → rejection

### Phase 3: Spending Cap Tests
1. Add test-only spending manipulation endpoint
2. Test cap check
3. Test free tier access

### Phase 4: Honor Mode & Edge Cases
1. Configure honor track in staging
2. Add remaining edge case tests

---

## Success Criteria

- [ ] All payment flow tests passing with real tokens
- [ ] Double-spend detection verified
- [ ] Spending cap free tier verified
- [ ] Honor mode verified
- [ ] Test suite runs reliably in CI
- [ ] Test proof pool has automated monitoring/alerting for low balance

---

## Files to Modify

| File | Changes |
|------|---------|
| `tests/e2e/helpers/wallet.ts` | New - test wallet/proof pool helpers |
| `tests/e2e/payment.test.ts` | New - payment flow tests |
| `tests/e2e/spending-cap.test.ts` | New - cap exhaustion tests |
| `tests/e2e/honor.test.ts` | New - honor mode tests |
| `tests/e2e/config.ts` | Add test proof pool config |
| `.github/workflows/test.yml` | Add test wallet secrets |

---

## Open Questions

1. **Proof pool funding:** Who refills it? How often? Alert threshold?
2. **Test-only endpoints:** Acceptable security trade-off for staging?
3. **CI cost:** How many credits per test run? Budget?

---

## References

- `docs/architecture/PAYWALL_ENDPOINTS.md` - Full endpoint spec
- `tests/e2e/access-modes.test.ts` - Current identity tests
- `tests/e2e/content.test.ts` - Current content tests
