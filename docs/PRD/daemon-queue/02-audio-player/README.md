# PRD: Audio Player (Barebones)

Minimal audio playback for tracks.

## Goal

Click a track, hear it play. Basic controls only.

## Implementation Phases

### Phase 1: Player Store and Playback

**Tasks:**
1. Create `src/stores/player.ts` (Zustand)
   ```typescript
   interface PlayerState {
     currentTrack: Track | null;
     isPlaying: boolean;
     currentTime: number;
     duration: number;
     play: (track: Track) => void;
     pause: () => void;
     resume: () => void;
     seek: (time: number) => void;
   }
   ```

2. Create `src/hooks/useAudio.ts`
   - Create/manage HTML5 Audio element
   - Sync with player store
   - Handle timeupdate, ended, error events

3. Update `Layout.tsx` player bar
   - Show current track info
   - Play/pause button (functional)
   - Progress bar (visual + seekable)
   - Current time / duration

4. Wire up track clicks to player

**Acceptance Criteria:**
- [ ] Click track → audio plays
- [ ] Play/pause button works
- [ ] Progress bar shows position
- [ ] Can seek by clicking progress bar
