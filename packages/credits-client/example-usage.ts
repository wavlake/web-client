/**
 * Example: Integrating Wavlake Credits into your app
 * 
 * This shows the complete flow in ~50 lines.
 */

import { WavlakeCreditsClient } from './credits-client';

// ============================================================
// SETUP (do once on app init)
// ============================================================

const client = new WavlakeCreditsClient({
  mintUrl: 'https://mint.wavlake.com',
  apiUrl: 'https://api.wavlake.com',
});

// Initialize wallet early (not when user clicks play)
await client.init();

console.log(`Wallet ready. Balance: ${client.getBalance()} credits`);

// ============================================================
// PRE-BUILD TOKENS (optional but recommended)
// ============================================================

// After loading your track list, scan the prices and prebuild
const trackPrices = [1, 2, 5]; // unique prices from your tracks
await client.prebuildTokens(trackPrices);

console.log('Tokens pre-built for fast playback');

// ============================================================
// PLAY A TRACK
// ============================================================

async function playTrack(dtag: string) {
  try {
    const { url, creditsSpent } = await client.playTrack(dtag);
    
    console.log(`Playing! Spent ${creditsSpent} credits`);
    console.log(`Audio URL: ${url}`);
    
    // Use the URL with your audio player
    // e.g., audio.src = url; audio.play();
    
  } catch (err) {
    if (err.message.includes('Insufficient balance')) {
      console.log('Need more credits! Show purchase modal.');
    } else {
      console.error('Playback failed:', err);
    }
  }
}

// Example: user clicks a track
await playTrack('my-track-dtag');

// ============================================================
// PURCHASE MORE CREDITS (when balance is low)
// ============================================================

async function purchaseCredits(amount: number) {
  // 1. Create quote (get Lightning invoice)
  const quoteResp = await fetch(`${client['config'].mintUrl}/v1/mint/quote/bolt11`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, unit: 'usd' }),
  });
  
  const { quote: quoteId, request: bolt11 } = await quoteResp.json();
  
  console.log(`Pay this invoice: ${bolt11}`);
  
  // 2. Wait for payment (poll or webhook)
  // ... user pays with Lightning wallet ...
  
  // 3. Mint credits
  await client.mintCredits(quoteId, amount);
  
  console.log(`Minted! New balance: ${client.getBalance()}`);
}

// Example: user wants 10 credits ($0.10)
// await purchaseCredits(10);
