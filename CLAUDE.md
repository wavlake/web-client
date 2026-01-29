# CLAUDE.md

Barebones Wavlake client — **play music, manage credits, buy tracks**. Nothing else.

## Project Overview

Minimal client proving Nostr's open architecture. Four features only:
1. Browse tracks (from relays)
2. Play audio
3. View credit balance
4. Purchase paywalled tracks

**Stack:** React 19 + TypeScript + Vite + NDK + TailwindCSS + Zustand

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
├── components/      # UI components
│   └── PurchasePrompt.tsx
├── hooks/           # React hooks
│   ├── useTracks.ts    # Query tracks from relays
│   ├── useAudio.ts     # Audio playback
│   ├── useCredits.ts   # Credit balance
│   └── usePurchase.ts  # Purchase flow
├── lib/             # Utilities
│   ├── ndk.tsx      # NDK provider
│   ├── api.ts       # Wavlake API client
│   └── parsers.ts   # Event parsing
├── stores/          # Zustand stores
│   ├── player.ts    # Playback state
│   └── auth.ts      # Auth state
├── pages/           # Route components
└── types/           # TypeScript types
```

## Key Event Kind

| Kind | Description |
|------|-------------|
| 30440 | Track metadata |

We only care about tracks. No albums, artists, playlists.

## Key APIs

### Wavlake API (requires NIP-98 auth)

```
GET  /v1/wallet/balance     # Get credit balance
POST /v1/tracks/{id}/purchase  # Purchase track
```

### NIP-98 Auth

Sign a Nostr event with kind 27235, include as Authorization header.

## Relay Configuration

- `wss://relay.wavlake.com` - Primary
- `wss://relay.damus.io` - Fallback

## Reference

- [NIP-wavlake-music](https://github.com/wavlake/monorepo/blob/main/docs/PRD/NIPs/NIP-wavlake-music.md)
- [NDK Docs](https://ndk.fiatjaf.com/)
