# CLAUDE.md

Development guide for the Wavlake alternative web client - a Nostr-native music streaming application.

## Project Overview

This is an **independent client** for the Wavlake music platform. It demonstrates the power of Nostr's decentralized architecture - all music content lives on relays, so anyone can build a client.

**Stack:** React 19 + TypeScript + Vite + NDK + TailwindCSS + React Query

## Critical Rules

### 1. Nostr-First Architecture
All music content is queried from Nostr relays, NOT traditional APIs.

- **Tracks** → Kind 30440 events
- **Albums** → Kind 30441 events  
- **Artists** → Kind 30442 events
- **Playlists** → Kind 30443 events

Use NDK for all Nostr interactions. Never build REST endpoints for content data.

### 2. Development Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # TypeScript + Vite build
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues
npm run typecheck    # TypeScript check
npm run test         # Run tests
npm run test:watch   # Watch mode
```

### 3. Code Quality

- **TypeScript strict mode** - No `any` types
- **Tests first** - Write tests before implementation when practical
- **Small PRs** - One feature/fix per PR
- **Descriptive commits** - Explain what and why

### 4. Project Structure

```
src/
├── components/      # Reusable UI components
│   ├── ui/          # Base components (buttons, cards, etc.)
│   ├── player/      # Audio player components
│   └── nostr/       # Nostr-specific components (login, profiles)
├── hooks/           # Custom React hooks
│   ├── useTrack.ts  # Query tracks from relays
│   ├── useAlbum.ts  # Query albums
│   └── usePlayer.ts # Audio playback state
├── lib/             # Utilities and providers
│   ├── ndk.tsx      # NDK provider and context
│   └── utils.ts     # Helper functions
├── pages/           # Route components
├── types/           # TypeScript type definitions
└── stores/          # Zustand stores (player state, auth)
```

## Nostr Event Kinds

| Kind | Description | Reference |
|------|-------------|-----------|
| 30440 | Track metadata | A440 Hz tuning standard |
| 30441 | Album metadata | |
| 30442 | Artist profile | NIP-72 community format |
| 30443 | Music playlist | |

## Key Patterns

### Querying Tracks

```typescript
import { useNDK } from '@/lib/ndk';
import { NostrEventKind } from '@/types/nostr';

function useTracks() {
  const { ndk } = useNDK();
  
  return useQuery({
    queryKey: ['tracks'],
    queryFn: async () => {
      const events = await ndk?.fetchEvents({
        kinds: [NostrEventKind.TRACK_METADATA],
        limit: 50,
      });
      return parseTrackEvents(events);
    },
    enabled: !!ndk,
  });
}
```

### Audio Playback

Use a global Zustand store for player state:

```typescript
// stores/player.ts
interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  play: (track: Track) => void;
  pause: () => void;
  next: () => void;
}
```

### User Authentication

Support multiple login methods:
1. **NIP-07** - Browser extension (nos2x, Alby)
2. **NIP-46** - Nostr Connect (remote signer)
3. **nsec** - Direct key input (with warnings)

## Relay Configuration

Default relays:
- `wss://relay.wavlake.com` - Primary Wavlake relay
- `wss://relay.damus.io` - Fallback
- `wss://nos.lol` - Fallback
- `wss://relay.nostr.band` - Discovery/search

## PRD Workflow

Features are defined as PRDs in `docs/PRD/daemon-queue/`. The compound automation picks them up and implements them.

### Adding a Feature

1. Create `docs/PRD/daemon-queue/feature-name/README.md`
2. Define clear phases with acceptance criteria
3. The daemon implements phase-by-phase, creating PRs

## Reference

- [NIP-wavlake-music spec](https://github.com/wavlake/monorepo/blob/main/docs/PRD/NIPs/NIP-wavlake-music.md)
- [NDK Documentation](https://ndk.fiatjaf.com/)
- [Nostr NIPs](https://github.com/nostr-protocol/nips)
