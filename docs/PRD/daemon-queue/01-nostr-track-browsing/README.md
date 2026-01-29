# PRD: Track Browsing (Barebones)

Display tracks from Nostr relays with minimal UI.

## Goal

Simple list of playable tracks. No frills.

## Implementation Phases

### Phase 1: Fetch and Display Tracks

**Tasks:**
1. Create `src/hooks/useTracks.ts`
   - Query kind 30440 events from relays
   - Parse title, artist, artwork_url, audio_url, access_mode, price
   - Return array of tracks

2. Create `src/lib/parsers.ts`
   - `parseTrackEvent(event)` - Extract metadata
   - Handle missing data gracefully

3. Update `HomePage.tsx`
   - Replace placeholder grid with real tracks
   - Show artwork, title, artist
   - Show lock icon + price for paywalled tracks
   - Click to play (free) or show price (paywalled)

4. Simple loading state (spinner or skeleton)

**Acceptance Criteria:**
- [ ] Tracks load from relays
- [ ] Display artwork, title, artist
- [ ] Paywalled tracks show price
- [ ] Free tracks clickable to play
