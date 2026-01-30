/**
 * Single-Request Benchmark
 * 
 * Compares three playback modes:
 * 1. Cold - full init + 402 discovery + swap + pay
 * 2. Warm - cached wallet + skip 402 + swap + pay  
 * 3. Single-Request - pre-built token + pay only
 */

import { Wallet, Mint, getEncodedTokenV4 } from '@cashu/cashu-ts';
import * as fs from 'fs';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app/api';
const TEST_TRACK = 'staging-test-paywall-track';
const PRICE = 1; // Known price for test track

function timer() {
  const start = performance.now();
  return () => performance.now() - start;
}

// ============================================================
// WALLET & TOKEN CACHE
// ============================================================

let cachedWallet = null;
let prebuiltTokens = []; // Array of ready-to-use tokens

async function getWallet() {
  if (cachedWallet) return cachedWallet;
  
  const mint = new Mint(MINT_URL);
  cachedWallet = new Wallet(mint, { unit: 'usd' });
  await cachedWallet.loadMint();
  return cachedWallet;
}

function clearCache() {
  cachedWallet = null;
  prebuiltTokens = [];
}

// Pre-mint exact denomination tokens
async function prebuildTokens(proofs, count = 5) {
  const wallet = await getWallet();
  const tokens = [];
  let remaining = proofs;
  
  for (let i = 0; i < count && remaining.reduce((s, p) => s + p.amount, 0) >= PRICE; i++) {
    const result = await wallet.send(PRICE, remaining);
    
    const token = getEncodedTokenV4({
      mint: MINT_URL,
      proofs: result.send,
      unit: 'usd'
    });
    
    tokens.push(token);
    remaining = result.keep;
  }
  
  prebuiltTokens = tokens;
  return { tokens, remaining };
}

function popToken() {
  return prebuiltTokens.shift();
}

// ============================================================
// MODE 1: COLD PLAYBACK (Current Implementation)
// ============================================================

async function coldPlayback(dtag, proofs) {
  const breakdown = {};
  const total = timer();
  
  // Cold wallet init with redundant calls (current impl)
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
    return { breakdown, total: total(), status: 'free', proofs };
  }
  
  // Mint swap
  t = timer();
  const result = await wallet.send(info.price_credits, proofs);
  breakdown.swap = t();
  
  // Payment
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
    proofs: result.keep
  };
}

// ============================================================
// MODE 2: WARM PLAYBACK (Skip 402)
// ============================================================

async function warmPlayback(dtag, proofs, priceHint) {
  const breakdown = {};
  const total = timer();
  
  // Cached wallet
  let t = timer();
  const wallet = await getWallet();
  breakdown.walletInit = t();
  
  // Skip 402
  breakdown.discovery = 0;
  
  // Mint swap (still needed - proofs may not be exact)
  t = timer();
  const result = await wallet.send(priceHint, proofs);
  breakdown.swap = t();
  
  // Payment
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
    proofs: result.keep
  };
}

// ============================================================
// MODE 3: SINGLE REQUEST (Pre-built Token)
// ============================================================

async function singleRequestPlayback(dtag) {
  const breakdown = {};
  const total = timer();
  
  // No wallet init needed
  breakdown.walletInit = 0;
  
  // No 402 discovery
  breakdown.discovery = 0;
  
  // No mint swap
  breakdown.swap = 0;
  
  // Just the payment - grab pre-built token
  const t = timer();
  const token = popToken();
  
  if (!token) {
    return { breakdown, total: total(), status: 'no-token', proofs: null };
  }
  
  const paidResp = await fetch(`${API_URL}/v1/content/${dtag}`, {
    headers: { 'X-Ecash-Token': token }
  });
  breakdown.payment = t();
  
  const data = await paidResp.json();
  
  return { 
    breakdown, 
    total: total(), 
    status: paidResp.status === 200 ? 'paid' : 'failed',
    proofs: null, // tokens are consumed, not returned
    audioUrl: data.data?.url || data.url
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SINGLE-REQUEST BENCHMARK');
  console.log('  Three modes: Cold → Warm → Single-Request');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Network warm-up (not counted)
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
  
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  if (balance < 3) {
    console.log(`❌ Need at least 3 credits (have ${balance})\n`);
    return;
  }
  
  // ─────────────────────────────────────────────────────────
  // MODE 1: Cold Playback
  // ─────────────────────────────────────────────────────────
  console.log('═══ MODE 1: COLD PLAYBACK ═══');
  console.log('(New wallet + 402 discovery + swap + pay)\n');
  
  clearCache();
  
  const cold = await coldPlayback(TEST_TRACK, proofs);
  proofs = cold.proofs || proofs;
  
  console.log(`  Wallet init:   ${cold.breakdown.walletInit.toFixed(0).padStart(4)}ms`);
  console.log(`  402 discovery: ${cold.breakdown.discovery.toFixed(0).padStart(4)}ms`);
  console.log(`  Mint swap:     ${cold.breakdown.swap.toFixed(0).padStart(4)}ms`);
  console.log(`  Payment:       ${cold.breakdown.payment.toFixed(0).padStart(4)}ms`);
  console.log(`  ─────────────────────`);
  console.log(`  TOTAL:         ${cold.total.toFixed(0).padStart(4)}ms  [${cold.status}]\n`);
  
  // ─────────────────────────────────────────────────────────
  // MODE 2: Warm Playback
  // ─────────────────────────────────────────────────────────
  console.log('═══ MODE 2: WARM PLAYBACK ═══');
  console.log('(Cached wallet + skip 402 + swap + pay)\n');
  
  // Pre-warm happens at app load
  console.log('  [Pre-warming wallet...]');
  const prewarmT = timer();
  await getWallet();
  console.log(`  [Pre-warm: ${prewarmT().toFixed(0)}ms - happens at login]\n`);
  
  const warm = await warmPlayback(TEST_TRACK, proofs, PRICE);
  proofs = warm.proofs || proofs;
  
  console.log(`  Wallet init:   ${warm.breakdown.walletInit.toFixed(0).padStart(4)}ms (cached)`);
  console.log(`  402 discovery: ${warm.breakdown.discovery.toFixed(0).padStart(4)}ms (skipped)`);
  console.log(`  Mint swap:     ${warm.breakdown.swap.toFixed(0).padStart(4)}ms`);
  console.log(`  Payment:       ${warm.breakdown.payment.toFixed(0).padStart(4)}ms`);
  console.log(`  ─────────────────────`);
  console.log(`  TOTAL:         ${warm.total.toFixed(0).padStart(4)}ms  [${warm.status}]\n`);
  
  // ─────────────────────────────────────────────────────────
  // MODE 3: Single-Request Playback
  // ─────────────────────────────────────────────────────────
  console.log('═══ MODE 3: SINGLE-REQUEST PLAYBACK ═══');
  console.log('(Pre-built token + pay only)\n');
  
  // Pre-build tokens at app load
  console.log('  [Pre-building tokens...]');
  const prebuildT = timer();
  const { remaining } = await prebuildTokens(proofs, 1);
  proofs = remaining;
  console.log(`  [Pre-build: ${prebuildT().toFixed(0)}ms - happens at login]\n`);
  
  const single = await singleRequestPlayback(TEST_TRACK);
  
  console.log(`  Wallet init:   ${single.breakdown.walletInit.toFixed(0).padStart(4)}ms (none)`);
  console.log(`  402 discovery: ${single.breakdown.discovery.toFixed(0).padStart(4)}ms (none)`);
  console.log(`  Mint swap:     ${single.breakdown.swap.toFixed(0).padStart(4)}ms (none)`);
  console.log(`  Payment:       ${single.breakdown.payment.toFixed(0).padStart(4)}ms ← only this`);
  console.log(`  ─────────────────────`);
  console.log(`  TOTAL:         ${single.total.toFixed(0).padStart(4)}ms  [${single.status}]\n`);
  
  if (single.audioUrl) {
    console.log(`  Audio URL: ${single.audioUrl.slice(0, 60)}...\n`);
  }
  
  // ─────────────────────────────────────────────────────────
  // COMPARISON
  // ─────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMPARISON');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Cold playback:    ${cold.total.toFixed(0).padStart(4)}ms  (baseline)`);
  console.log(`  Warm playback:    ${warm.total.toFixed(0).padStart(4)}ms  (${((1 - warm.total/cold.total) * 100).toFixed(0)}% faster)`);
  console.log(`  Single-request:   ${single.total.toFixed(0).padStart(4)}ms  (${((1 - single.total/cold.total) * 100).toFixed(0)}% faster)`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  HTTP requests:    8 → 2 → 1`);
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
