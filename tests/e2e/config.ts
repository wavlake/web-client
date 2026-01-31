/**
 * E2E Test Configuration
 * 
 * Staging environment URLs and test credentials
 */

export const config = {
  // Staging API
  apiUrl: 'https://api-staging-854568123236.us-central1.run.app',
  
  // Nutshell Mint (staging)
  mintUrl: 'https://nutshell-staging-854568123236.us-central1.run.app',
  
  // Nostr Relay
  relayUrl: 'wss://relay.wavlake.com',
  
  // Test accounts
  testArtist: {
    nsec: 'nsec1p2e056x4lsfkkhx7skpr3xqvue72tzentz2x5dywmaajslghnkeqyd0jrs',
  },
  testListener: {
    nsec: 'nsec1v7w4y87zp2kc7d4pgla4s7u92n5rmh83zs7y0x2zdach8vuzv23qp250f7',
  },
  
  // Test tracks (from relay)
  testTracks: {
    paid: {
      dtag: 'track-24bf3b5b-a133-4584-a73b-392af8967e87',
      title: 'How to Sing',
      priceCredits: 2,
    },
    free: {
      dtag: 'track-2122de24-dda1-4f3d-9637-410e7a741b71',
      title: "That's My Couch (Instrumental)",
      priceCredits: 0,
    },
  },
  
  // Timeouts
  timeouts: {
    mint: 30000,
    api: 10000,
    relay: 5000,
  },
};

export type Config = typeof config;
