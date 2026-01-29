# PRD: Audio Player

Implement a functional audio player for streaming tracks.

## Goal

Users can click a track and hear it play with standard playback controls.

## Implementation Phases

### Phase 1: Player Store

Create global state for audio playback.

**Tasks:**
1. Create `src/stores/player.ts` (Zustand)
   ```typescript
   interface PlayerState {
     currentTrack: Track | null;
     isPlaying: boolean;
     currentTime: number;
     duration: number;
     volume: number;
     queue: Track[];
     // Actions
     play: (track: Track) => void;
     pause: () => void;
     resume: () => void;
     seek: (time: number) => void;
     setVolume: (volume: number) => void;
     addToQueue: (track: Track) => void;
     next: () => void;
     previous: () => void;
   }
   ```

2. Create `src/hooks/useAudio.ts`
   - Manage HTML5 Audio element
   - Sync with player store
   - Handle events (timeupdate, ended, error)

3. Write tests for player store

**Acceptance Criteria:**
- [ ] Player store manages playback state
- [ ] Audio element plays track URLs
- [ ] Time updates reflect in store
- [ ] Queue management works

### Phase 2: Player UI

Build the player bar component.

**Tasks:**
1. Create `src/components/player/PlayerBar.tsx`
   - Current track info (artwork, title, artist)
   - Play/pause button
   - Previous/next buttons
   - Progress bar (seekable)
   - Volume slider
   - Current time / duration display

2. Create `src/components/player/ProgressBar.tsx`
   - Visual progress indicator
   - Click to seek
   - Drag to scrub

3. Update Layout.tsx to use PlayerBar

**Acceptance Criteria:**
- [ ] Player bar shows current track
- [ ] Play/pause toggles playback
- [ ] Progress bar updates in real-time
- [ ] Can seek by clicking progress bar
- [ ] Volume control works

### Phase 3: Queue and Keyboard Controls

Add queue UI and keyboard shortcuts.

**Tasks:**
1. Create queue panel (slide-out or modal)
   - Show upcoming tracks
   - Reorder tracks (drag and drop)
   - Remove from queue

2. Add keyboard shortcuts
   - Space: play/pause
   - Arrow left/right: seek
   - Arrow up/down: volume
   - N: next track
   - P: previous track

3. Persist volume preference to localStorage

**Acceptance Criteria:**
- [ ] Queue panel shows upcoming tracks
- [ ] Keyboard shortcuts work
- [ ] Volume persists across sessions
