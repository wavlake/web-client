# PRD: Artist and Album Pages

Create dedicated pages for viewing artists and albums.

## Goal

Users can browse artist profiles and album pages with full track listings.

## Implementation Phases

### Phase 1: Artist Page

Create artist profile pages.

**Tasks:**
1. Create `src/hooks/useArtist.ts`
   - Query kind 30442 events by d-tag or pubkey
   - Parse artist profile metadata
   - Fetch artist's tracks (kind 30440 with matching 'a' tag)

2. Create `src/pages/ArtistPage.tsx`
   - Artist banner and profile picture
   - Bio and social links
   - Lightning address for zaps
   - Grid of artist's tracks
   - List of artist's albums

3. Add route `/artist/:identifier` (supports npub or d-tag)

**Acceptance Criteria:**
- [ ] Artist page displays profile info
- [ ] Artist's tracks shown in grid
- [ ] Artist's albums listed
- [ ] Lightning address displayed for zaps

### Phase 2: Album Page

Create album detail pages.

**Tasks:**
1. Create `src/hooks/useAlbum.ts`
   - Query kind 30441 events by d-tag
   - Parse album metadata
   - Fetch album's tracks (from 'track' tags)

2. Create `src/pages/AlbumPage.tsx`
   - Album artwork (large)
   - Album title, artist, year
   - Track listing with numbers
   - "Play all" button
   - Total duration

3. Create `src/components/TrackList.tsx`
   - Numbered list view (vs grid)
   - Duration display
   - Currently playing indicator

4. Add route `/album/:identifier`

**Acceptance Criteria:**
- [ ] Album page shows artwork and metadata
- [ ] Track listing in order
- [ ] "Play all" queues entire album
- [ ] Can click individual tracks to play

### Phase 3: Artists Index Page

Create browsable artists directory.

**Tasks:**
1. Create `src/hooks/useArtists.ts`
   - Query all kind 30442 events
   - Sort by follower count or track count

2. Create `src/pages/ArtistsPage.tsx`
   - Grid of artist cards
   - Search/filter by genre
   - Sort options

3. Create `src/components/ArtistCard.tsx`
   - Profile picture
   - Name and genres
   - Track count

4. Add route `/artists`

**Acceptance Criteria:**
- [ ] Artists page lists all artists
- [ ] Can search artists by name
- [ ] Artist cards link to artist pages
