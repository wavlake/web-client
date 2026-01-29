# PRD: Content API Integration (Debug)

Connect to paywall API with full request/response logging.

## Goal

Call content API, handle 402s, send payments — all with debug visibility.

## API Endpoint

```
GET /api/v1/content/{dtag}
Headers:
  - X-Ecash-Token: cashuB... (optional, for payment)
  - X-Access-Grant: {grantId} (optional, for replay)
  - Authorization: Nostr {nip98} (optional)

Responses:
  - 200: { url, grant, streamType }
  - 402: { priceCredits, mintUrl, paymentMethods }
  - 4xx: { error, errorCode }
```

## Implementation

### Phase 1: Content Access Hook

**Tasks:**
1. Create `src/hooks/useContentAccess.ts`
   - `checkAccess(dtag)` - initial request, expects 402
   - `purchaseAccess(dtag, proofs)` - send with token
   - Log all requests/responses to debug store

2. Create `src/lib/api.ts`
   - Base URL config (env or manual input)
   - Request wrapper with logging
   - Token encoding helper

3. Create `src/components/ApiConfigPanel.tsx`
   - API base URL input
   - Test connection button
   - Show current config

**Acceptance Criteria:**
- [ ] Can configure API URL
- [ ] Requests logged with full headers
- [ ] 402 response parsed correctly
- [ ] 200 response provides audio URL

### Phase 2: Payment Flow

**Tasks:**
1. Implement purchase flow
   - Check access → get price
   - Select proofs from wallet
   - Encode as cashu token
   - Send request with X-Ecash-Token
   - Handle response (success/error)

2. Add to track UI
   - "Buy" button on paywalled tracks
   - Show price from 402
   - Confirm before spending
   - Log entire flow

**Acceptance Criteria:**
- [ ] Full purchase flow works
- [ ] Proofs removed from wallet on success
- [ ] Grant cached for replay
- [ ] All steps visible in debug log
