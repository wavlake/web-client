# PRD: Audio Playback (Debug)

Play audio from signed URLs with debug visibility.

## Goal

Play purchased content, show stream status, handle errors visibly.

## Implementation

### Phase 1: Basic Player

**Tasks:**
1. Create `src/stores/player.ts`
   ```typescript
   interface PlayerState {
     currentTrack: Track | null;
     signedUrl: string | null;
     grantId: number | null;
     grantExpiresAt: Date | null;
     
     isPlaying: boolean;
     currentTime: number;
     duration: number;
     
     // Debug info
     audioState: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
     lastError: string | null;
     bufferHealth: number;
     
     // Actions
     play: (track: Track, url: string, grant?: Grant) => void;
     pause: () => void;
     seek: (time: number) => void;
   }
   ```

2. Create `src/hooks/useAudioPlayer.ts`
   - Manage HTML5 Audio element
   - Track all state changes
   - Log events to debug store

3. Create `src/components/PlayerDebug.tsx`
   - Current track info
   - Signed URL (truncated, copyable)
   - Grant status + expiry countdown
   - Audio element state
   - Buffer/network info

**Acceptance Criteria:**
- [ ] Audio plays from signed URL
- [ ] All state changes logged
- [ ] Grant expiry visible
- [ ] Errors displayed clearly

### Phase 2: Full Flow

**Tasks:**
1. Wire up complete flow
   - Click track → check access
   - If 402 → show buy prompt
   - If bought/free → play immediately
   - Grant replay within window

2. Add playback controls
   - Play/pause
   - Seek bar
   - Time display

**Acceptance Criteria:**
- [ ] Click-to-play works for free tracks
- [ ] Purchase flow triggers for paywalled
- [ ] Grant replay works
- [ ] Controls functional
