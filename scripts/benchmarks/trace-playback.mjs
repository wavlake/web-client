/**
 * Trace Playback - Shows every HTTP call in order
 * 
 * Simulates "click play" and logs all network requests with timing.
 */

import { Wallet, Mint, getEncodedTokenV4 } from '@cashu/cashu-ts';
import * as fs from 'fs';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app/api';
const TEST_TRACK = 'staging-test-paywall-track';

let callNumber = 0;
const startTime = performance.now();

function log(method, url, status, ms) {
  callNumber++;
  const elapsed = (performance.now() - startTime).toFixed(0);
  console.log(`${callNumber}. [${elapsed}ms] ${method} ${url}`);
  console.log(`   → ${status} (${ms.toFixed(0)}ms)\n`);
}

// Wrap fetch to trace calls
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const start = performance.now();
  const resp = await originalFetch(url, options);
  log(method, url, resp.status, performance.now() - start);
  return resp;
};

async function simulateClickPlay() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TRACE: "Click Play" → Audio URL');
  console.log('  Track:', TEST_TRACK);
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Load wallet proofs
  const walletData = JSON.parse(fs.readFileSync('wallet.json', 'utf-8'));
  const proofs = walletData.proofs;
  console.log(`💰 Wallet: ${proofs.reduce((s, p) => s + p.amount, 0)} credits\n`);
  console.log('─── NETWORK CALLS ───────────────────────────────────────\n');

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Initialize Cashu Wallet (CURRENT implementation)
  // ═══════════════════════════════════════════════════════════════
  console.log('## STEP 1: Initialize Wallet\n');
  
  const mint = new Mint(MINT_URL);
  
  // These are the "redundant" calls in current implementation
  await mint.getInfo();
  await mint.getKeySets();
  
  // Create wallet and load mint data
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();  // This also fetches info/keysets/keys internally
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Request Content (triggers 402)
  // ═══════════════════════════════════════════════════════════════
  console.log('## STEP 2: Request Content (Discovery)\n');
  
  const contentResp = await fetch(`${API_URL}/v1/content/${TEST_TRACK}`);
  const contentData = await contentResp.json();
  
  if (contentResp.status !== 402) {
    console.log('Track is free! URL:', contentData.data?.url || contentData.url);
    return;
  }
  
  const price = contentData.price_credits;
  console.log(`   Payment required: ${price} credit(s)\n`);
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Prepare Payment (swap at mint if needed)
  // ═══════════════════════════════════════════════════════════════
  console.log('## STEP 3: Prepare Payment\n');
  
  const sendResult = await wallet.send(price, proofs);
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Pay and Get Content URL
  // ═══════════════════════════════════════════════════════════════
  console.log('## STEP 4: Pay for Content\n');
  
  const token = getEncodedTokenV4({
    mint: MINT_URL,
    proofs: sendResult.send,
    unit: 'usd'
  });
  
  const paidResp = await fetch(`${API_URL}/v1/content/${TEST_TRACK}`, {
    headers: { 'X-Ecash-Token': token }
  });
  const paidData = await paidResp.json();
  
  // ═══════════════════════════════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════════════════════════════
  const totalTime = performance.now() - startTime;
  
  console.log('─── RESULT ──────────────────────────────────────────────\n');
  console.log(`✅ Got audio URL in ${totalTime.toFixed(0)}ms`);
  console.log(`   URL: ${(paidData.data?.url || paidData.url)?.slice(0, 60)}...`);
  console.log(`   Grant ID: ${paidData.data?.grant?.grant_id || paidData.grant?.grant_id}`);
  
  // Save remaining proofs
  const remaining = sendResult.keep;
  fs.writeFileSync('wallet.json', JSON.stringify({
    ...walletData,
    proofs: remaining,
    balance: remaining.reduce((s, p) => s + p.amount, 0),
    updatedAt: new Date().toISOString()
  }, null, 2));
  console.log(`\n💾 Saved: ${remaining.reduce((s, p) => s + p.amount, 0)} credits remaining`);
}

simulateClickPlay().catch(e => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
