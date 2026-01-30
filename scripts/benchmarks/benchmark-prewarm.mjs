/**
 * Pre-warm Benchmark
 * 
 * Compares cold vs pre-warmed wallet for playback latency
 */

import { Wallet, Mint, getEncodedTokenV4 } from '@cashu/cashu-ts';
import * as fs from 'fs';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app/api';
const TEST_TRACK = 'staging-test-paywall-track';

function timer() {
  const start = performance.now();
  return () => performance.now() - start;
}

// ============================================================
// WALLET CACHE (Approach 2)
// ============================================================

let cachedWallet = null;
let cachePromise = null;

async function prewarmWallet() {
  if (cachedWallet) return cachedWallet;
  if (cachePromise) return cachePromise;
  
  cachePromise = (async () => {
    const mint = new Mint(MINT_URL);
    const wallet = new Wallet(mint, { unit: 'usd' });
    await wallet.loadMint();
    cachedWallet = wallet;
    return wallet;
  })();
  
  return cachePromise;
}

function clearCache() {
  cachedWallet = null;
  cachePromise = null;
}

// ============================================================
// SIMULATED PLAYBACK FLOWS
// ============================================================

async function coldPlayback(dtag, proofs) {
  const breakdown = {};
  const total = timer();
  
  // Cold wallet init (current implementation)
  let t = timer();
  const mint = new Mint(MINT_URL);
  await mint.getInfo();
  await mint.getKeySets();
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  breakdown.walletInit = t();
  
  // 402 Discovery
  t = timer();
  const resp = await fetch(`${API_URL}/v1/content/${dtag}`);
  const info = await resp.json();
  breakdown.discovery = t();
  
  if (resp.status !== 402) {
    return { breakdown, total: total(), status: 'free' };
  }
  
  // Spend + Pay
  t = timer();
  const result = await wallet.send(info.price_credits, proofs);
  breakdown.swap = t();
  
  t = timer();
  const token = getEncodedTokenV4({ mint: MINT_URL, proofs: result.send, unit: 'usd' });
  const paidResp = await fetch(`${API_URL}/v1/content/${dtag}`, {
    headers: { 'X-Ecash-Token': token }
  });
  breakdown.payment = t();
  
  return { 
    breakdown, 
    total: total(), 
    status: paidResp.status === 200 ? 'paid' : 'failed',
    keepProofs: result.keep
  };
}

async function warmPlayback(dtag, proofs, priceHint) {
  const breakdown = {};
  const total = timer();
  
  // Pre-warmed wallet (already initialized)
  let t = timer();
  const wallet = await prewarmWallet(); // Returns immediately if cached
  breakdown.walletInit = t();
  
  // Skip 402, use price hint
  t = timer();
  const result = await wallet.send(priceHint, proofs);
  breakdown.swap = t();
  
  t = timer();
  const token = getEncodedTokenV4({ mint: MINT_URL, proofs: result.send, unit: 'usd' });
  const paidResp = await fetch(`${API_URL}/v1/content/${dtag}`, {
    headers: { 'X-Ecash-Token': token }
  });
  breakdown.payment = t();
  
  // No 402 discovery step!
  breakdown.discovery = 0;
  
  return { 
    breakdown, 
    total: total(), 
    status: paidResp.status === 200 ? 'paid' : 'failed',
    keepProofs: result.keep
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PRE-WARM BENCHMARK: Cold vs Warm Playback');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Warm up network connection
  console.log('⏳ Warming network connection...');
  await fetch(`${MINT_URL}/v1/info`);
  await fetch(`${API_URL}/v1/content/${TEST_TRACK}`);
  console.log('   Done\n');
  
  // Load wallet
  let proofs = [];
  try {
    const walletData = JSON.parse(fs.readFileSync('wallet.json', 'utf-8'));
    proofs = walletData.proofs;
    console.log(`💰 Wallet: ${proofs.reduce((s, p) => s + p.amount, 0)} credits\n`);
  } catch {
    console.log('❌ No wallet.json - run mint-safe.mjs first\n');
    return;
  }
  
  if (proofs.reduce((s, p) => s + p.amount, 0) < 2) {
    console.log('❌ Need at least 2 credits for this benchmark\n');
    return;
  }
  
  // ─────────────────────────────────────────────────────────
  // TEST 1: Cold Playback (current implementation)
  // ─────────────────────────────────────────────────────────
  console.log('═══ TEST 1: Cold Playback (Current Implementation) ═══\n');
  
  clearCache(); // Ensure cold start
  
  const cold = await coldPlayback(TEST_TRACK, proofs);
  proofs = cold.keepProofs || proofs;
  
  console.log('  Breakdown:');
  console.log(`    Wallet init:  ${cold.breakdown.walletInit.toFixed(0)}ms`);
  console.log(`    402 discovery: ${cold.breakdown.discovery.toFixed(0)}ms`);
  console.log(`    Mint swap:     ${cold.breakdown.swap.toFixed(0)}ms`);
  console.log(`    Payment:       ${cold.breakdown.payment.toFixed(0)}ms`);
  console.log(`    ────────────────────────`);
  console.log(`    TOTAL:         ${cold.total.toFixed(0)}ms`);
  console.log(`    Status:        ${cold.status}\n`);
  
  // ─────────────────────────────────────────────────────────
  // TEST 2: Warm Playback (optimized)
  // ─────────────────────────────────────────────────────────
  console.log('═══ TEST 2: Warm Playback (Optimized) ═══\n');
  
  // Pre-warm wallet before playback
  console.log('  Pre-warming wallet in background...');
  const prewarmStart = timer();
  await prewarmWallet();
  console.log(`  Pre-warm complete: ${prewarmStart().toFixed(0)}ms (happens on login)\n`);
  
  // Simulate playback with warm wallet
  const warm = await warmPlayback(TEST_TRACK, proofs, 1); // price hint = 1
  proofs = warm.keepProofs || proofs;
  
  console.log('  Breakdown:');
  console.log(`    Wallet init:  ${warm.breakdown.walletInit.toFixed(0)}ms (cached)`);
  console.log(`    402 discovery: ${warm.breakdown.discovery.toFixed(0)}ms (skipped)`);
  console.log(`    Mint swap:     ${warm.breakdown.swap.toFixed(0)}ms`);
  console.log(`    Payment:       ${warm.breakdown.payment.toFixed(0)}ms`);
  console.log(`    ────────────────────────`);
  console.log(`    TOTAL:         ${warm.total.toFixed(0)}ms`);
  console.log(`    Status:        ${warm.status}\n`);
  
  // ─────────────────────────────────────────────────────────
  // COMPARISON
  // ─────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMPARISON');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Cold playback:  ${cold.total.toFixed(0)}ms`);
  console.log(`  Warm playback:  ${warm.total.toFixed(0)}ms`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Savings:        ${(cold.total - warm.total).toFixed(0)}ms (${((1 - warm.total/cold.total) * 100).toFixed(0)}%)`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Save remaining proofs
  const walletData = {
    mintUrl: MINT_URL,
    unit: 'usd',
    proofs,
    balance: proofs.reduce((s, p) => s + p.amount, 0),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
  console.log(`💾 Saved: ${walletData.balance} credits remaining\n`);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
