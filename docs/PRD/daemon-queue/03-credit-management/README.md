# PRD: Credit Management

Login, view balance, and manage Wavlake credits.

## Goal

Users can authenticate and see their credit balance.

## Implementation Phases

### Phase 1: Auth and Balance Display

**Tasks:**
1. Create `src/stores/auth.ts` (Zustand)
   ```typescript
   interface AuthState {
     pubkey: string | null;
     isLoggedIn: boolean;
     loginWithExtension: () => Promise<void>;
     logout: () => void;
   }
   ```

2. Create `src/hooks/useCredits.ts`
   - Fetch credit balance from Wavlake API
   - `GET /v1/wallet/balance` with NIP-98 auth
   - Return { balance: number, loading, error }

3. Update header in `Layout.tsx`
   - "Connect" button → NIP-07 login
   - After login: show balance (e.g., "⚡ 500 credits")
   - Dropdown with logout

4. Create `src/lib/api.ts`
   - Base fetch wrapper for Wavlake API
   - NIP-98 auth header generation

**Acceptance Criteria:**
- [ ] Can login with NIP-07 extension
- [ ] Credit balance displayed in header
- [ ] Can logout
- [ ] Auth state persists (pubkey in localStorage)
