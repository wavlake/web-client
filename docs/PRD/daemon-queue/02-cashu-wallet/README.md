# PRD: Cashu Wallet (Debug)

Basic Cashu wallet with full state visibility.

## Goal

Manage credits with complete debug visibility into proofs, balances, and transactions.

## Config

- Mint URL: configurable (default to Wavlake mint or localhost)
- Unit: 'usd' (wavlake credits, 1 credit = $0.01)

## Implementation

### Phase 1: Wallet Core

**Tasks:**
1. Create `src/lib/cashu.ts`
   - Wrap cashu-ts CashuWallet
   - Initialize with mint URL
   - Track all proofs in state

2. Create `src/stores/wallet.ts`
   ```typescript
   interface WalletState {
     initialized: boolean;
     mintUrl: string;
     balance: number;  // total from proofs
     proofs: Proof[];  // raw cashu proofs
     pendingProofs: Proof[];  // proofs being spent
     
     // Actions
     initialize: (mintUrl: string) => Promise<void>;
     addProofs: (proofs: Proof[]) => void;
     spendProofs: (amount: number) => Promise<Proof[]>;
     getBalance: () => number;
   }
   ```

3. Create `src/components/WalletPanel.tsx`
   - Show balance prominently
   - List all proofs with amounts
   - Show proof states (unspent/pending/spent)
   - Mint URL display + change option

**Acceptance Criteria:**
- [ ] Wallet initializes with mint
- [ ] Balance calculated from proofs
- [ ] Proofs listed with details
- [ ] State changes logged to debug panel

### Phase 2: Manual Token Import

**Tasks:**
1. Add token paste input
   - Accept cashuA... or cashuB... tokens
   - Parse and add proofs to wallet
   - Show success/error

2. Add proof inspection
   - Click proof to see full JSON
   - Copy individual proof

**Acceptance Criteria:**
- [ ] Can paste token string to import
- [ ] Proofs decoded and added
- [ ] Full proof data inspectable
