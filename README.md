# Wavlake Paywall Debug Client

A **debug/testing harness** for the Wavlake paywall system. Built to expose every step of the payment flow.

## Purpose

Test and debug:
- Kind 30440 track discovery
- Cashu wallet operations (proofs, balances)
- Content API requests/responses
- Payment flow (402 → token → access)
- Audio playback from signed URLs

## Features

- 📊 **Debug Panels** - Real-time state inspection
- 🪙 **Wallet Visibility** - See all proofs, balances, transactions
- 📝 **Request Logging** - Full request/response history
- 🔊 **Playback Debug** - Stream status, grant expiry, buffer health

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🎵 Wavlake Debug Client           [API: localhost:3000]    │
├──────────────┬───────────────────────┬──────────────────────┤
│              │                       │   Wallet Panel       │
│  Track List  │   Now Playing         │   Balance: 500 ¢     │
│              │   + Controls          │   Proofs: [...]      │
│  - Track 1   │                       ├──────────────────────┤
│  - Track 2 🔒│                       │   API Config         │
│  - Track 3   │                       │   Base URL: [...]    │
│              │                       │                      │
├──────────────┴───────────────────────┴──────────────────────┤
│  Debug Log                                                  │
│  22:15:01 REQUEST GET /content/abc123                       │
│  22:15:01 RESPONSE 402 { priceCredits: 5, mintUrl: ... }    │
│  22:15:02 WALLET spending 5 credits (proofs: [...])         │
│  22:15:02 REQUEST GET /content/abc123 + X-Ecash-Token       │
│  22:15:02 RESPONSE 200 { url: "...", grant: {...} }         │
└─────────────────────────────────────────────────────────────┘
```

## Getting Started

```bash
npm install
npm run dev
```

Configure API URL in the debug panel (default: `http://localhost:3000/api/v1`)

## Token Import

Paste a Cashu token (cashuA... or cashuB...) to add credits to your wallet.

## Tech Stack

- React 18 + TypeScript + Vite
- NDK for Nostr relay queries
- cashu-ts for wallet operations
- Zustand for state management

## Related

- [wavlake/monorepo](https://github.com/wavlake/monorepo) - Main platform
- [cashu-ts](https://github.com/cashubtc/cashu-ts) - Cashu TypeScript library
