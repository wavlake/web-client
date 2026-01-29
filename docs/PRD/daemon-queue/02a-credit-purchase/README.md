# PRD: Credit Purchase Flow (Debug)

Buy credits with Lightning invoice - explicit step-by-step with debug visibility.

## Goal

Manual control over each step: quote → pay → check → mint → receive proofs.

## API Endpoints

```
POST /api/v1/credits/quote
  Body: { amount: number }  // credits to buy
  Response: { quoteId, bolt11, amount, expiresAt }

GET /api/v1/credits/quote/{quoteId}
  Response: { quoteId, paid: boolean, amount, expiresAt }

POST /api/v1/credits/mint/bolt11
  Body: { quote: quoteId, outputs: BlindedOutput[] }
  Response: { signatures: BlindSignature[] }
```

## Implementation

### Phase 1: Purchase Panel UI

**Tasks:**
1. Create `src/components/PurchasePanel.tsx`
   ```
   ┌─────────────────────────────────────┐
   │  Buy Credits                        │
   │  ┌─────────────────────────────────┐│
   │  │ Amount: [____100____] credits   ││
   │  │ [Create Quote]                  ││
   │  └─────────────────────────────────┘│
   │                                     │
   │  Quote: abc123                      │
   │  Status: ⏳ Unpaid                  │
   │  ┌─────────────────────────────────┐│
   │  │ lnbc100n1p...                   ││
   │  │ [Copy Invoice] [Show QR]        ││
   │  └─────────────────────────────────┘│
   │  [Check Status]                     │
   │                                     │
   │  ✅ PAID!                           │
   │  [Mint Tokens]                      │
   │                                     │
   │  Minted: 100 credits                │
   │  Proofs: [...] (added to wallet)   │
   └─────────────────────────────────────┘
   ```

2. Create `src/stores/purchase.ts`
   ```typescript
   interface PurchaseState {
     // Quote state
     quoteId: string | null;
     bolt11: string | null;
     quoteAmount: number;
     quoteExpiry: Date | null;
     quotePaid: boolean;
     
     // Minting state
     blindedOutputs: BlindedOutput[] | null;
     outputData: OutputData[] | null;  // for unblinding
     mintedProofs: Proof[] | null;
     
     // Actions
     createQuote: (amount: number) => Promise<void>;
     checkQuoteStatus: () => Promise<boolean>;
     mintTokens: () => Promise<void>;
     reset: () => void;
   }
   ```

3. Each action logs to debug store with full request/response

**Acceptance Criteria:**
- [ ] Can enter amount and create quote
- [ ] Invoice displayed with copy button
- [ ] "Check Status" button polls quote
- [ ] "Mint Tokens" enabled when paid
- [ ] Proofs added to wallet after mint
- [ ] All steps visible in debug log

### Phase 2: Cashu Blinding Integration

**Tasks:**
1. Create `src/lib/blinding.ts`
   - Use cashu-ts to create blinded outputs
   - Store outputData for later unblinding
   - Unblind signatures to get proofs

2. Wire up to mint endpoint
   - After "Mint Tokens" clicked
   - Generate blinded outputs for quote amount
   - POST to mint endpoint
   - Unblind response → proofs
   - Add proofs to wallet store

**Acceptance Criteria:**
- [ ] Blinded outputs generated correctly
- [ ] Signatures unblinded to valid proofs
- [ ] Proofs pass validation
- [ ] Wallet balance updates
