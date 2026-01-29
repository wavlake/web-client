# Wavlake Web Client

A barebones alternative client for [Wavlake](https://wavlake.com) — focused on what matters: **play music, manage credits, buy tracks**.

## Why?

Wavlake's Nostr-first architecture means all music lives on relays. This minimal client proves anyone can build a player.

## Features

- 🎵 **Browse Tracks** - Simple grid from Nostr relays
- 🎧 **Play Music** - Barebones audio player
- 💳 **Credit Balance** - View your Wavlake credits
- 🔓 **Buy Tracks** - Spend credits on paywalled content

That's it. No social features, no playlists, no bloat.

## Tech Stack

- React 19 + TypeScript + Vite
- NDK for Nostr
- TailwindCSS
- Zustand for state

## Getting Started

```bash
npm install
npm run dev
```

## How It Works

1. Tracks are queried from Nostr relays (kind 30440)
2. Free tracks play immediately
3. Paywalled tracks require login + credits
4. Credits are managed via Wavlake API (NIP-98 auth)

## License

MIT
