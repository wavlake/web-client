# PRD: Credit Spending

Purchase paywalled tracks with credits.

## Goal

Users can spend credits to unlock and play paywalled tracks.

## Implementation Phases

### Phase 1: Purchase Flow

**Tasks:**
1. Create `src/hooks/usePurchase.ts`
   - Check if track is paywalled (access_mode === 'paywall')
   - Check if user has purchased (local cache + API check)
   - Purchase track: `POST /v1/tracks/{id}/purchase`
   - Return { canPlay, price, purchase, loading }

2. Update track click behavior
   - Free track → play immediately
   - Paywalled + purchased → play immediately
   - Paywalled + not purchased → show purchase prompt

3. Create `src/components/PurchasePrompt.tsx`
   - Modal or inline prompt
   - Show track info + price
   - "Buy for X credits" button
   - Success → start playback
   - Error → show message (insufficient balance, etc.)

4. Update player to handle 402 responses
   - If audio URL returns 402, show purchase prompt
   - After purchase, retry playback

**Acceptance Criteria:**
- [ ] Paywalled tracks show price before play
- [ ] Can purchase with credits
- [ ] Balance updates after purchase
- [ ] Purchased tracks play normally
- [ ] Insufficient balance shows error
