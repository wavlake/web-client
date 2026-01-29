# Wavlake Web Client

An alternative web client for the [Wavlake](https://wavlake.com) music platform, built on Nostr.

## Why?

Wavlake uses a **Nostr-first architecture** — all music content (tracks, albums, artist profiles) lives on Nostr relays, not in a proprietary database. This means anyone can build their own client to browse and play music.

This project demonstrates that openness by providing an independent, community-built alternative to the official web app.

## Features

- 🎵 **Browse Music** - Discover tracks, albums, and artists
- 🎧 **Audio Player** - Full-featured playback with queue management
- 👤 **Nostr Login** - Use your existing Nostr identity
- ⚡ **Zaps** - Support artists with Lightning payments
- 🔓 **Paywall Support** - Access premium content

## Tech Stack

- **React 19** + TypeScript
- **Vite** for fast development
- **NDK** (Nostr Dev Kit) for relay connections
- **TailwindCSS** for styling
- **React Query** for data fetching
- **Zustand** for state management

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Nostr Event Kinds

| Kind | Description |
|------|-------------|
| 30440 | Track metadata |
| 30441 | Album metadata |
| 30442 | Artist profile |
| 30443 | Music playlist |

## Contributing

This project uses **compound engineering** — features are defined as PRDs in `docs/PRD/daemon-queue/` and implemented automatically by AI agents.

To contribute:
1. Create a PRD for your feature
2. Submit as a PR to the daemon-queue
3. Or implement directly and submit a PR

## Related

- [Wavlake](https://wavlake.com) - Official platform
- [wavlake/monorepo](https://github.com/wavlake/monorepo) - Official codebase
- [NIP-wavlake-music](https://github.com/wavlake/monorepo/blob/main/docs/PRD/NIPs/NIP-wavlake-music.md) - Event kind specifications

## License

MIT
