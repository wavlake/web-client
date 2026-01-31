#!/usr/bin/env npx tsx
/**
 * Proof Pool Status & Management
 * 
 * Check balance, create refill quotes, monitor health.
 * 
 * Usage:
 *   npx tsx scripts/proof-pool-status.ts           # Check status
 *   npx tsx scripts/proof-pool-status.ts --refill  # Create refill quote
 *   npx tsx scripts/proof-pool-status.ts --ci      # CI mode (exit 1 if low)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Wallet, Mint } from '@cashu/cashu-ts';

const PROOFS_FILE = resolve(import.meta.dirname, '../proofs.json');
const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';

// Thresholds
const LOW_BALANCE_THRESHOLD = 50;  // Warn below this
const CRITICAL_THRESHOLD = 20;     // CI fails below this
const REFILL_AMOUNT = 100;         // Default refill amount (sats)

interface Proof {
  amount: number;
  C: string;
  id: string;
  secret: string;
}

function getPoolStatus(): { balance: number; count: number; proofs: Proof[] } {
  if (!existsSync(PROOFS_FILE)) {
    return { balance: 0, count: 0, proofs: [] };
  }
  
  const proofs: Proof[] = JSON.parse(readFileSync(PROOFS_FILE, 'utf-8'));
  const balance = proofs.reduce((sum, p) => sum + p.amount, 0);
  
  return { balance, count: proofs.length, proofs };
}

function printStatus(status: { balance: number; count: number; proofs: Proof[] }) {
  console.log('\n🏦 Proof Pool Status');
  console.log('═'.repeat(40));
  console.log(`Balance:     ${status.balance} credits`);
  console.log(`Proofs:      ${status.count}`);
  
  if (status.proofs.length > 0) {
    const denominations = status.proofs.map(p => p.amount).sort((a, b) => b - a);
    console.log(`Denominations: ${denominations.join(', ')}`);
  }
  
  console.log('');
  
  if (status.balance < CRITICAL_THRESHOLD) {
    console.log('🔴 CRITICAL: Balance too low for tests!');
    console.log(`   Run: npx tsx scripts/proof-pool-status.ts --refill`);
  } else if (status.balance < LOW_BALANCE_THRESHOLD) {
    console.log('🟡 WARNING: Balance getting low');
    console.log(`   Consider refilling soon`);
  } else {
    console.log('🟢 OK: Balance healthy');
  }
  
  console.log('');
}

async function createRefillQuote(amount: number = REFILL_AMOUNT) {
  console.log(`\n⚡ Creating mint quote for ${amount} sats...`);
  console.log(`   Mint: ${MINT_URL}`);
  
  try {
    const mint = new Mint(MINT_URL);
    const wallet = new Wallet(mint);
    await wallet.loadMint();
    
    const quote = await wallet.createMintQuoteBolt11(amount);
    
    console.log('\n📋 Pay this Lightning invoice to refill:');
    console.log('═'.repeat(60));
    console.log(quote.request);
    console.log('═'.repeat(60));
    console.log(`\nQuote ID: ${quote.quote}`);
    console.log(`Amount:   ${amount} sats`);
    console.log(`\nAfter paying, run:`);
    console.log(`  npx tsx scripts/proof-pool-refill.ts ${quote.quote} ${amount}`);
    
    return quote;
  } catch (err) {
    console.error('Failed to create quote:', err);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const status = getPoolStatus();
  
  if (args.includes('--ci')) {
    // CI mode: just check and exit with code
    console.log(`Pool balance: ${status.balance} credits`);
    if (status.balance < CRITICAL_THRESHOLD) {
      console.error(`FAIL: Balance ${status.balance} < ${CRITICAL_THRESHOLD} threshold`);
      process.exit(1);
    }
    console.log('OK');
    process.exit(0);
  }
  
  if (args.includes('--refill')) {
    const amountArg = args.find(a => a.match(/^\d+$/));
    const amount = amountArg ? parseInt(amountArg) : REFILL_AMOUNT;
    await createRefillQuote(amount);
    return;
  }
  
  if (args.includes('--json')) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  
  // Default: print status
  printStatus(status);
}

main().catch(console.error);
