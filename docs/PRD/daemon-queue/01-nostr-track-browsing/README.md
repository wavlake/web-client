# PRD: Nostr Track Browsing

Connect to Nostr relays and display real tracks from the Wavlake network.

## Goal

Replace placeholder content with actual music tracks queried from Nostr relays.

## Implementation Phases

### Phase 1: Track Query Hook

Create a React hook that fetches tracks from relays.

**Tasks:**
1. Create `src/hooks/useTracks.ts`
   - Use NDK to query kind 30440 events
   - Parse event content into TrackMetadata type
   - Handle loading/error states
   - Return array of Track objects

2. Create `src/lib/parsers.ts`
   - `parseTrackEvent(event)` - Extract metadata from event
   - `parseTrackTags(tags)` - Parse d-tag, title, artist references
   - Handle missing/malformed data gracefully

3. Write tests for parsers

**Acceptance Criteria:**
- [ ] `useTracks()` returns tracks from relays
- [ ] Tracks have title, artist, artwork parsed
- [ ] Error states handled gracefully
- [ ] Parser tests pass

### Phase 2: Track Grid Component

Display tracks in a responsive grid.

**Tasks:**
1. Create `src/components/TrackCard.tsx`
   - Display artwork, title, artist
   - Show access mode badge (free/paywall)
   - Hover state with play button overlay
   - Click handler (prepare for player integration)

2. Create `src/components/TrackGrid.tsx`
   - Responsive grid layout
   - Loading skeletons
   - Empty state message

3. Update `HomePage.tsx` to use real data

**Acceptance Criteria:**
- [ ] Track cards display real artwork and metadata
- [ ] Grid is responsive (2-5 columns based on viewport)
- [ ] Loading skeletons show while fetching
- [ ] Empty state shown when no tracks

### Phase 3: Recent/Popular Sorting

Add sorting and filtering options.

**Tasks:**
1. Add sort options to useTracks hook
   - Recent (by created_at)
   - Filter by genre (from tags)
   
2. Add filter UI to HomePage
   - Genre dropdown
   - Sort toggle

3. Implement pagination/infinite scroll

**Acceptance Criteria:**
- [ ] Can sort by recent
- [ ] Can filter by genre
- [ ] Infinite scroll loads more tracks
