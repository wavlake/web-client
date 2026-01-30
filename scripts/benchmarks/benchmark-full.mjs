/**
 * Full Benchmark Suite
 * 
 * Runs all three modes multiple times with warm service
 * to get accurate production-like numbers.
 */

import { Wallet, Mint, getEncodedTokenV4 } from '@cashu/cashu-ts';
import * as fs from 'fs';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app/api';
const TEST_TRACK = 'staging-test-paywall-track';
const PRICE = 1;
const ITERATIONS = 3;

function timer() {
  const start = performance.now();
  return () => performance.now() - start;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function stats(arr) {
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  return { avg, min, max };
}

// ============================================================
// WALLET MANAGEMENT
// ============================================================

let cachedWallet = null;
let prebuiltTokens = [];

async function freshWallet() {
  const mint = new Mint(MINT_URL);
  await mint.getInfo();
  await mint.getKeySets();
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  return wallet;
}

async function getCachedWallet() {
  if (cachedWallet) return cachedWallet;
  const mint = new Mint(MINT_URL);
  cachedWallet = new Wallet(mint, { unit: 'usd' });
  await cachedWallet.loadMint();
  return cachedWallet;
}

async function prebuildTokens(proofs, count) {
  const wallet = await getCachedWallet();
  const tokens = [];
  let remaining = proofs;
  
  for (let i = 0; i < count && remaining.reduce((s, p) => s + p.amount, 0) >= PRICE; i++) {
    const result = await wallet.send(PRICE, remaining);
    tokens.push(getEncodedTokenV4({ mint: MINT_URL, proofs: result.send, unit: 'usd' }));
    remaining = result.keep;
  }
  
  prebuiltTokens.push(...tokens);
  return remaining;
}

// ============================================================
// PLAYBACK MODES
// ============================================================

async function coldPlayback(proofs) {
  const breakdown = {};
  const total = timer();
  
  let t = timer();
  const wallet = await freshWallet();
  breakdown.walletInit = t();
  
  t = timer();
  const resp = await fetch(`${API_URL}/v1/content/${TEST_TRACK}`);
  const info = await resp.json();
  breakdown.discovery = t();
  
  t = timer();
  const result = await wallet.send(info.price_credits, proofs);
  breakdown.swap = t();
  
  t = timer();
  const token = getEncodedTokenV4({ mint: MINT_URL, proofs: result.send, unit: 'usd' });
  await fetch(`${API_URL}/v1/content/${TEST_TRACK}`, {
    headers: { 'X-Ecash-Token': token }
  });
  breakdown.payment = t();
  
  return { breakdown, total: total(), proofs: result.keep };
}

async function warmPlayback(proofs) {
  const breakdown = {};
  const total = timer();
  
  let t = timer();
  const wallet = await getCachedWallet();
  breakdown.walletInit = t();
  
  breakdown.discovery = 0;
  
  t = timer();
  const result = await wallet.send(PRICE, proofs);
  breakdown.swap = t();
  
  t = timer();
  const token = getEncodedTokenV4({ mint: MINT_URL, proofs: result.send, unit: 'usd' });
  await fetch(`${API_URL}/v1/content/${TEST_TRACK}`, {
    headers: { 'X-Ecash-Token': token }
  });
  breakdown.payment = t();
  
  return { breakdown, total: total(), proofs: result.keep };
}

async function singleRequestPlayback() {
  const total = timer();
  
  const token = prebuiltTokens.shift();
  if (!token) throw new Error('No pre-built tokens');
  
  await fetch(`${API_URL}/v1/content/${TEST_TRACK}`, {
    headers: { 'X-Ecash-Token': token }
  });
  
  return { total: total() };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FULL BENCHMARK SUITE');
  console.log(`  ${ITERATIONS} iterations per mode, service pre-warmed`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // ─────────────────────────────────────────────────────────
  // WARM UP EVERYTHING
  // ─────────────────────────────────────────────────────────
  console.log('⏳ Warming up services (simulating production)...\n');
  
  // Warm the mint
  for (let i = 0; i < 3; i++) {
    await fetch(`${MINT_URL}/v1/info`);
    await fetch(`${MINT_URL}/v1/keysets`);
    await fetch(`${MINT_URL}/v1/keys`);
  }
  console.log('   ✓ Mint warmed (3 rounds)');
  
  // Warm the API
  for (let i = 0; i < 3; i++) {
    await fetch(`${API_URL}/v1/content/${TEST_TRACK}`);
  }
  console.log('   ✓ API warmed (3 rounds)');
  
  // Pre-warm wallet cache
  await getCachedWallet();
  console.log('   ✓ Wallet cached');
  
  await sleep(500);
  console.log('   ✓ Ready\n');
  
  // ─────────────────────────────────────────────────────────
  // LOAD WALLET
  // ─────────────────────────────────────────────────────────
  let proofs = [];
  try {
    const walletData = JSON.parse(fs.readFileSync('wallet.json', 'utf-8'));
    proofs = walletData.proofs;
    const balance = proofs.reduce((s, p) => s + p.amount, 0);
    console.log(`💰 Wallet: ${balance} credits`);
    
    const needed = ITERATIONS * 3; // 3 modes × iterations
    if (balance < needed) {
      console.log(`❌ Need ${needed} credits, have ${balance}\n`);
      return;
    }
  } catch {
    console.log('❌ No wallet.json\n');
    return;
  }
  
  // Pre-build tokens for single-request tests
  console.log(`   Pre-building ${ITERATIONS} tokens for single-request mode...`);
  proofs = await prebuildTokens(proofs, ITERATIONS);
  console.log(`   ✓ ${prebuiltTokens.length} tokens ready\n`);
  
  // ─────────────────────────────────────────────────────────
  // RUN BENCHMARKS
  // ─────────────────────────────────────────────────────────
  const results = {
    cold: { totals: [], breakdowns: [] },
    warm: { totals: [], breakdowns: [] },
    single: { totals: [] }
  };
  
  // MODE 1: COLD
  console.log(`═══ MODE 1: COLD PLAYBACK (${ITERATIONS} runs) ═══\n`);
  for (let i = 0; i < ITERATIONS; i++) {
    cachedWallet = null; // Force cold
    await sleep(200);
    
    const r = await coldPlayback(proofs);
    proofs = r.proofs;
    results.cold.totals.push(r.total);
    results.cold.breakdowns.push(r.breakdown);
    
    console.log(`  Run ${i + 1}: ${r.total.toFixed(0)}ms (init: ${r.breakdown.walletInit.toFixed(0)}, 402: ${r.breakdown.discovery.toFixed(0)}, swap: ${r.breakdown.swap.toFixed(0)}, pay: ${r.breakdown.payment.toFixed(0)})`);
  }
  
  // MODE 2: WARM
  console.log(`\n═══ MODE 2: WARM PLAYBACK (${ITERATIONS} runs) ═══\n`);
  await getCachedWallet(); // Ensure warm
  
  for (let i = 0; i < ITERATIONS; i++) {
    await sleep(200);
    
    const r = await warmPlayback(proofs);
    proofs = r.proofs;
    results.warm.totals.push(r.total);
    results.warm.breakdowns.push(r.breakdown);
    
    console.log(`  Run ${i + 1}: ${r.total.toFixed(0)}ms (init: ${r.breakdown.walletInit.toFixed(0)}, swap: ${r.breakdown.swap.toFixed(0)}, pay: ${r.breakdown.payment.toFixed(0)})`);
  }
  
  // MODE 3: SINGLE-REQUEST
  console.log(`\n═══ MODE 3: SINGLE-REQUEST PLAYBACK (${ITERATIONS} runs) ═══\n`);
  for (let i = 0; i < ITERATIONS; i++) {
    await sleep(200);
    
    const r = await singleRequestPlayback();
    results.single.totals.push(r.total);
    
    console.log(`  Run ${i + 1}: ${r.total.toFixed(0)}ms`);
  }
  
  // ─────────────────────────────────────────────────────────
  // COLLATE RESULTS
  // ─────────────────────────────────────────────────────────
  const coldStats = stats(results.cold.totals);
  const warmStats = stats(results.warm.totals);
  const singleStats = stats(results.single.totals);
  
  // Breakdown stats for cold
  const coldBreakdown = {
    walletInit: stats(results.cold.breakdowns.map(b => b.walletInit)),
    discovery: stats(results.cold.breakdowns.map(b => b.discovery)),
    swap: stats(results.cold.breakdowns.map(b => b.swap)),
    payment: stats(results.cold.breakdowns.map(b => b.payment))
  };
  
  // Breakdown stats for warm
  const warmBreakdown = {
    walletInit: stats(results.warm.breakdowns.map(b => b.walletInit)),
    swap: stats(results.warm.breakdowns.map(b => b.swap)),
    payment: stats(results.warm.breakdowns.map(b => b.payment))
  };
  
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Iterations: ${ITERATIONS} per mode | Services: pre-warmed`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  console.log('  TOTAL LATENCY (click to audio URL)');
  console.log('  ───────────────────────────────────────────────────────────');
  console.log(`  Mode             │  Avg     │  Min     │  Max     │ vs Cold`);
  console.log('  ─────────────────┼──────────┼──────────┼──────────┼─────────');
  console.log(`  Cold             │ ${coldStats.avg.toFixed(0).padStart(5)}ms  │ ${coldStats.min.toFixed(0).padStart(5)}ms  │ ${coldStats.max.toFixed(0).padStart(5)}ms  │ baseline`);
  console.log(`  Warm             │ ${warmStats.avg.toFixed(0).padStart(5)}ms  │ ${warmStats.min.toFixed(0).padStart(5)}ms  │ ${warmStats.max.toFixed(0).padStart(5)}ms  │ -${((1 - warmStats.avg/coldStats.avg) * 100).toFixed(0)}%`);
  console.log(`  Single-request   │ ${singleStats.avg.toFixed(0).padStart(5)}ms  │ ${singleStats.min.toFixed(0).padStart(5)}ms  │ ${singleStats.max.toFixed(0).padStart(5)}ms  │ -${((1 - singleStats.avg/coldStats.avg) * 100).toFixed(0)}%`);
  console.log('  ───────────────────────────────────────────────────────────\n');
  
  console.log('  COLD BREAKDOWN (avg)');
  console.log('  ───────────────────────────────────────────────────────────');
  console.log(`  Wallet init (5 HTTP):     ${coldBreakdown.walletInit.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  402 discovery (1 HTTP):   ${coldBreakdown.discovery.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  Mint swap (1 HTTP):       ${coldBreakdown.swap.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  Paid request (1 HTTP):    ${coldBreakdown.payment.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total (8 HTTP):           ${coldStats.avg.toFixed(0).padStart(4)}ms\n`);
  
  console.log('  WARM BREAKDOWN (avg)');
  console.log('  ───────────────────────────────────────────────────────────');
  console.log(`  Wallet init (cached):     ${warmBreakdown.walletInit.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  402 discovery (skipped):     0ms`);
  console.log(`  Mint swap (1 HTTP):       ${warmBreakdown.swap.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  Paid request (1 HTTP):    ${warmBreakdown.payment.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total (2 HTTP):           ${warmStats.avg.toFixed(0).padStart(4)}ms\n`);
  
  console.log('  SINGLE-REQUEST BREAKDOWN (avg)');
  console.log('  ───────────────────────────────────────────────────────────');
  console.log(`  Wallet init:                 0ms (pre-warmed at login)`);
  console.log(`  402 discovery:               0ms (price known)`);
  console.log(`  Mint swap:                   0ms (token pre-built)`);
  console.log(`  Paid request (1 HTTP):    ${singleStats.avg.toFixed(0).padStart(4)}ms`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total (1 HTTP):           ${singleStats.avg.toFixed(0).padStart(4)}ms\n`);
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  KEY FINDINGS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  • Cold→Warm saves ${(coldStats.avg - warmStats.avg).toFixed(0)}ms (${((1 - warmStats.avg/coldStats.avg) * 100).toFixed(0)}%) by caching wallet + skipping 402`);
  console.log(`  • Warm→Single saves ${(warmStats.avg - singleStats.avg).toFixed(0)}ms by pre-building tokens`);
  console.log(`  • Cold→Single saves ${(coldStats.avg - singleStats.avg).toFixed(0)}ms total (${((1 - singleStats.avg/coldStats.avg) * 100).toFixed(0)}% improvement)`);
  console.log(`  • Floor latency: ~${singleStats.min.toFixed(0)}ms (server processing time)`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
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
