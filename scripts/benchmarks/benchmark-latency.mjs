/**
 * Latency Benchmark for Streaming Optimization
 * 
 * Tests the approaches from PRD: Streaming Latency Optimization
 * @see wavlake/monorepo PR #626
 * 
 * Usage: node benchmark-latency.mjs
 */

import { Wallet, Mint, getEncodedTokenV4 } from '@cashu/cashu-ts';
import * as fs from 'fs';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app/api';
const TEST_TRACK = 'staging-test-paywall-track';

// ============================================================
// BENCHMARK HELPERS
// ============================================================

function timer() {
  const start = performance.now();
  return () => performance.now() - start;
}

async function runMultiple(name, fn, iterations = 3) {
  console.log(`\n📊 ${name} (${iterations} runs)`);
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    // Small delay between runs
    if (i > 0) await sleep(500);
    
    const elapsed = timer();
    await fn();
    const ms = elapsed();
    times.push(ms);
    console.log(`  Run ${i + 1}: ${ms.toFixed(0)}ms`);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  console.log(`  → Avg: ${avg.toFixed(0)}ms (min: ${min.toFixed(0)}, max: ${max.toFixed(0)})`);
  return { name, avg, min, max, times };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// APPROACH 1: Compare Wallet Initialization
// ============================================================

async function benchmarkCurrentInit() {
  // Current implementation: redundant calls
  const mint = new Mint(MINT_URL);
  await mint.getInfo();           // Redundant
  await mint.getKeySets();        // Redundant
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();        // Fetches info, keysets, keys again
}

async function benchmarkOptimizedInit() {
  // Optimized: skip redundant calls
  const mint = new Mint(MINT_URL);
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();        // Only call needed
  
  // Validate keyset exists
  const keyset = wallet.getKeyset();
  if (!keyset) throw new Error('No keyset');
}

async function benchmarkIndividualCalls() {
  // Measure each mint call individually
  const mint = new Mint(MINT_URL);
  
  const results = {};
  
  let t = timer();
  await mint.getInfo();
  results.getInfo = t();
  
  t = timer();
  await mint.getKeySets();
  results.getKeySets = t();
  
  t = timer();
  await mint.getKeys();
  results.getKeys = t();
  
  console.log('  Individual calls:');
  console.log(`    getInfo(): ${results.getInfo.toFixed(0)}ms`);
  console.log(`    getKeySets(): ${results.getKeySets.toFixed(0)}ms`);
  console.log(`    getKeys(): ${results.getKeys.toFixed(0)}ms`);
  
  return results;
}

// ============================================================
// APPROACH 2: Pre-warmed vs Cold Wallet
// ============================================================

let cachedWallet = null;

async function getPrewarmedWallet() {
  if (cachedWallet) return cachedWallet;
  
  const mint = new Mint(MINT_URL);
  cachedWallet = new Wallet(mint, { unit: 'usd' });
  await cachedWallet.loadMint();
  return cachedWallet;
}

async function benchmarkColdWalletPayment(proofs) {
  // Simulate cold start: create new wallet, then pay
  const mint = new Mint(MINT_URL);
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  
  // Now do the payment (would use wallet.send but we're timing init)
}

async function benchmarkWarmWalletPayment(proofs) {
  // Pre-warmed: wallet already initialized
  const wallet = await getPrewarmedWallet();
  // Payment would be instant (no init time)
}

// ============================================================
// APPROACH 3: Skip 402 Round-Trip
// ============================================================

async function benchmark402Flow(dtag) {
  // Current flow: Request → 402 → Read price → Pay
  const t = timer();
  const resp = await fetch(`${API_URL}/v1/content/${dtag}`);
  const data = await resp.json();
  return { status: resp.status, time: t(), data };
}

async function benchmarkDirectPayment(dtag, priceHint, proofs, wallet) {
  // Optimized: Skip 402, use price hint directly
  if (!proofs || proofs.length === 0) {
    console.log('  (Skipping - no proofs available)');
    return null;
  }
  
  const t = timer();
  
  // Select proofs for the price hint
  const result = await wallet.send(priceHint, proofs);
  
  // Create token
  const token = getEncodedTokenV4({
    mint: MINT_URL,
    proofs: result.send,
    unit: 'usd'
  });
  
  // Send directly without 402
  const resp = await fetch(`${API_URL}/v1/content/${dtag}`, {
    headers: { 'X-Ecash-Token': token }
  });
  
  return { status: resp.status, time: t() };
}

// ============================================================
// FULL FLOW COMPARISON
// ============================================================

async function benchmarkFullFlow(dtag, proofs) {
  console.log('\n🔬 FULL FLOW: Cold Wallet + 402 Discovery');
  
  const totalTime = timer();
  const breakdown = {};
  
  // Step 1: Initialize wallet (cold)
  let t = timer();
  const mint = new Mint(MINT_URL);
  await mint.getInfo();
  await mint.getKeySets();
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  breakdown.walletInit = t();
  
  // Step 2: Request content (get 402)
  t = timer();
  const resp = await fetch(`${API_URL}/v1/content/${dtag}`);
  const info = await resp.json();
  breakdown.discovery402 = t();
  
  if (resp.status !== 402) {
    console.log(`  Track is free (${resp.status}), skipping payment`);
    return { breakdown, total: totalTime() };
  }
  
  const price = info.price_credits;
  console.log(`  Price: ${price} credits`);
  
  if (!proofs || proofs.length === 0) {
    console.log('  (No proofs - skipping payment)');
    return { breakdown, total: totalTime() };
  }
  
  // Step 3: Swap at mint
  t = timer();
  const sendResult = await wallet.send(price, proofs);
  breakdown.mintSwap = t();
  
  // Step 4: Create token
  t = timer();
  const token = getEncodedTokenV4({
    mint: MINT_URL,
    proofs: sendResult.send,
    unit: 'usd'
  });
  breakdown.tokenCreate = t();
  
  // Step 5: Paid request
  t = timer();
  const paidResp = await fetch(`${API_URL}/v1/content/${dtag}`, {
    headers: { 'X-Ecash-Token': token }
  });
  breakdown.paidRequest = t();
  
  const total = totalTime();
  
  console.log('\n  Breakdown:');
  console.log(`    Wallet init:    ${breakdown.walletInit.toFixed(0)}ms`);
  console.log(`    402 discovery:  ${breakdown.discovery402.toFixed(0)}ms`);
  console.log(`    Mint swap:      ${breakdown.mintSwap.toFixed(0)}ms`);
  console.log(`    Token create:   ${breakdown.tokenCreate.toFixed(0)}ms`);
  console.log(`    Paid request:   ${breakdown.paidRequest.toFixed(0)}ms`);
  console.log(`    ─────────────────────────`);
  console.log(`    TOTAL:          ${total.toFixed(0)}ms`);
  
  return { breakdown, total, keepProofs: sendResult.keep };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  STREAMING LATENCY BENCHMARK');
  console.log('  Mint:', MINT_URL);
  console.log('  Track:', TEST_TRACK);
  console.log('═══════════════════════════════════════════════════════');
  
  // Warm up connection
  console.log('\n⏳ Warming up connection...');
  await fetch(`${MINT_URL}/v1/info`);
  console.log('   Done');
  
  // Load wallet if available
  let proofs = [];
  try {
    const walletData = JSON.parse(fs.readFileSync('wallet.json', 'utf-8'));
    proofs = walletData.proofs;
    console.log(`\n💰 Wallet loaded: ${proofs.reduce((s, p) => s + p.amount, 0)} credits`);
  } catch {
    console.log('\n⚠️  No wallet.json - payment benchmarks will be skipped');
  }
  
  // ─────────────────────────────────────────────────────────
  // BENCHMARK 1: Wallet Initialization
  // ─────────────────────────────────────────────────────────
  console.log('\n\n═══ APPROACH 1: Remove Redundant Mint Calls ═══');
  
  // Individual call timing
  await benchmarkIndividualCalls();
  
  const currentInit = await runMultiple('Current Init (with redundant calls)', benchmarkCurrentInit);
  const optimizedInit = await runMultiple('Optimized Init (no redundant calls)', benchmarkOptimizedInit);
  
  const initSavings = currentInit.avg - optimizedInit.avg;
  console.log(`\n  💡 Potential savings: ${initSavings.toFixed(0)}ms (${((initSavings/currentInit.avg)*100).toFixed(0)}%)`);
  
  // ─────────────────────────────────────────────────────────
  // BENCHMARK 2: 402 Round-Trip
  // ─────────────────────────────────────────────────────────
  console.log('\n\n═══ APPROACH 3: Skip 402 Round-Trip ═══');
  
  const discovery = await runMultiple('402 Discovery Request', async () => {
    await fetch(`${API_URL}/v1/content/${TEST_TRACK}`);
  });
  
  console.log(`\n  💡 Skipping 402 saves: ~${discovery.avg.toFixed(0)}ms per play`);
  
  // ─────────────────────────────────────────────────────────
  // BENCHMARK 3: Full Flow Comparison
  // ─────────────────────────────────────────────────────────
  if (proofs.length > 0) {
    console.log('\n\n═══ FULL PAYMENT FLOW ═══');
    const fullResult = await benchmarkFullFlow(TEST_TRACK, proofs);
    
    // Update wallet with remaining proofs
    if (fullResult.keepProofs) {
      proofs = fullResult.keepProofs;
      const walletData = {
        mintUrl: MINT_URL,
        unit: 'usd',
        proofs,
        balance: proofs.reduce((s, p) => s + p.amount, 0),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
      console.log(`\n  💾 Wallet saved: ${walletData.balance} credits remaining`);
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Approach 1 (Skip redundant calls): ~${initSavings.toFixed(0)}ms savings`);
  console.log(`  Approach 2 (Pre-warm wallet):      ~${currentInit.avg.toFixed(0)}ms off critical path`);
  console.log(`  Approach 3 (Skip 402):             ~${discovery.avg.toFixed(0)}ms savings`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Combined potential:                ~${(initSavings + discovery.avg).toFixed(0)}ms`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(e => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
