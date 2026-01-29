# PRD: User Authentication

Implement Nostr-based user authentication.

## Goal

Users can log in with their Nostr identity to access personalized features.

## Implementation Phases

### Phase 1: Auth Store and NIP-07

Create auth state and browser extension login.

**Tasks:**
1. Create `src/stores/auth.ts` (Zustand)
   ```typescript
   interface AuthState {
     user: { pubkey: string; profile?: UserProfile } | null;
     isLoading: boolean;
     loginWithExtension: () => Promise<void>;
     logout: () => void;
   }
   ```

2. Create `src/hooks/useAuth.ts`
   - Check for `window.nostr` (NIP-07)
   - Request pubkey from extension
   - Fetch user profile (kind 0) from relays

3. Create `src/components/nostr/LoginButton.tsx`
   - Show "Connect" when logged out
   - Show user avatar/name when logged in
   - Dropdown with logout option

4. Update header in Layout.tsx

**Acceptance Criteria:**
- [ ] Can login with NIP-07 extension (nos2x, Alby)
- [ ] User profile displayed after login
- [ ] Logout clears auth state
- [ ] Auth state persists across page refresh

### Phase 2: Profile Display

Show logged-in user's profile.

**Tasks:**
1. Create `src/components/nostr/UserAvatar.tsx`
   - Display profile picture
   - Fallback to generated avatar
   - NIP-05 verification badge

2. Create `src/pages/ProfilePage.tsx`
   - User's profile info
   - Their published tracks (if artist)
   - Their playlists

3. Add route `/profile`

**Acceptance Criteria:**
- [ ] User avatar component works
- [ ] Profile page shows user info
- [ ] NIP-05 verification displayed

### Phase 3: Alternative Login Methods

Support users without browser extensions.

**Tasks:**
1. Add nsec login (with security warnings)
   - Input field for nsec
   - Clear warning about key security
   - Store encrypted in memory only

2. Add NIP-46 Nostr Connect option
   - QR code for mobile signers
   - Connection status indicator

3. Create login modal with all options

**Acceptance Criteria:**
- [ ] Can login with nsec (with warnings)
- [ ] NIP-46 connect flow works
- [ ] Login modal shows all options
