# PRD: Zaps and Payments

Implement Lightning payments for supporting artists.

## Goal

Users can zap (tip) artists and pay for paywalled content.

## Implementation Phases

### Phase 1: Display Zap Counts

Show social proof of support.

**Tasks:**
1. Create `src/hooks/useZaps.ts`
   - Query kind 9735 (zap receipts) for a track
   - Sum total sats received
   - Count unique zappers

2. Update TrackCard to show zap count
   - Lightning bolt icon with sat amount
   - "1.2k sats" format for large numbers

3. Update ArtistPage to show total zaps received

**Acceptance Criteria:**
- [ ] Zap counts displayed on tracks
- [ ] Total artist zaps shown
- [ ] Counts update when new zaps arrive

### Phase 2: Send Zaps (NWC)

Enable sending zaps via Nostr Wallet Connect.

**Tasks:**
1. Create `src/stores/wallet.ts`
   - NWC connection state
   - Balance (if available)
   - Connection URL storage

2. Create `src/hooks/useNWC.ts`
   - Connect to NWC provider
   - Send payment
   - Check payment status

3. Create `src/components/ZapButton.tsx`
   - Click to zap
   - Amount selector (21, 100, 500, 1000, custom)
   - Success/error feedback

4. Create `src/components/NWCConnectModal.tsx`
   - Input for NWC connection string
   - QR scan option
   - Connection status

**Acceptance Criteria:**
- [ ] Can connect NWC wallet
- [ ] Can send zaps to tracks/artists
- [ ] Zap confirmation shown
- [ ] Error handling for failed payments

### Phase 3: Paywall Content

Handle paywalled tracks.

**Tasks:**
1. Create `src/hooks/usePaywall.ts`
   - Check track access_mode
   - Verify payment status
   - Handle 402 responses from streaming

2. Update player to handle paywall
   - Show locked state for paywalled tracks
   - Payment prompt with price
   - Unlock after payment

3. Create `src/components/PaywallPrompt.tsx`
   - Track preview (if available)
   - Price display
   - Pay button

**Acceptance Criteria:**
- [ ] Paywalled tracks show locked state
- [ ] Can pay to unlock
- [ ] Unlocked tracks play normally
- [ ] Payment status persisted
