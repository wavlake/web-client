# PRD: Search and Discovery

Implement search functionality and content discovery features.

## Goal

Users can search for tracks, artists, and albums, and discover new music.

## Implementation Phases

### Phase 1: Basic Search

Implement text search across content.

**Tasks:**
1. Create `src/hooks/useSearch.ts`
   - Search tracks by title, artist name
   - Search artists by name
   - Search albums by title
   - Combine results with type indicators

2. Create `src/components/SearchBar.tsx`
   - Input with search icon
   - Debounced input (300ms)
   - Clear button
   - Keyboard shortcut (Cmd/Ctrl + K)

3. Create `src/pages/SearchPage.tsx`
   - Results grouped by type (tracks, artists, albums)
   - "No results" state
   - Recent searches (localStorage)

4. Add route `/search?q=query`

**Acceptance Criteria:**
- [ ] Can search by text
- [ ] Results grouped by type
- [ ] Debounced to avoid excessive queries
- [ ] Keyboard shortcut opens search

### Phase 2: Genre Browsing

Browse content by genre.

**Tasks:**
1. Create `src/hooks/useGenres.ts`
   - Extract unique genres from track events
   - Count tracks per genre

2. Create `src/pages/GenrePage.tsx`
   - Tracks filtered by genre
   - Genre description (if available)
   - Related genres

3. Create genre chips/tags for navigation

4. Add route `/genre/:genre`

**Acceptance Criteria:**
- [ ] Can browse tracks by genre
- [ ] Genre page shows relevant tracks
- [ ] Genre links throughout UI

### Phase 3: Feed and Recommendations

Personalized discovery feed.

**Tasks:**
1. Create `src/hooks/useFeed.ts`
   - Recent tracks from followed artists
   - Trending tracks (most zapped)
   - New releases

2. Create `src/pages/FeedPage.tsx`
   - Personalized feed (if logged in)
   - Trending feed (if logged out)
   - "New releases" section

3. Add route `/feed`

**Acceptance Criteria:**
- [ ] Feed shows relevant content
- [ ] Different feed for logged in/out users
- [ ] New releases section works
