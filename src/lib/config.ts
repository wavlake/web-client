/**
 * Debug Client Configuration
 * 
 * Staging environment endpoints for paywall testing
 */

export const CONFIG = {
  // Nostr relay
  RELAY_URL: 'wss://relay.wavlake.com',
  
  // Nutshell mint (staging)
  MINT_URL: 'https://nutshell-staging-854568123236.us-central1.run.app',
  
  // Wavlake API (staging) 
  API_BASE_URL: 'https://api-staging-854568123236.us-central1.run.app',
  
  // Content endpoint
  CONTENT_API_URL: 'https://api-staging-854568123236.us-central1.run.app/api/v1',
} as const;

// For debug panel display
export const ENV_INFO = {
  environment: 'staging',
  relay: CONFIG.RELAY_URL,
  mint: CONFIG.MINT_URL,
  api: CONFIG.API_BASE_URL,
};
