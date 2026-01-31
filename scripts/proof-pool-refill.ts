#!/usr/bin/env npx tsx
/**
 * Proof Pool Refill
 * 
 * Claim minted tokens after paying a Lightning invoice.
 * 
 * Usage:
 *   npx tsx scripts/proof-pool-refill.ts <quote-id> <amount>
 *   npx tsx scripts/proof-pool-refill.ts --poll <quote-id> <amount>  # Poll until paid
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { Wallet, Mint, type Proof } from '@cashu/cashu-ts';

const PROOFS_FILE = resolve(import.meta.dirname, '../proofs.json');
const BACKUP_FILE = resolve(import.meta.dirname, '../proofs.backup.json');
const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';

async function checkQuoteAndMint(quoteId: string, amount: number): Promise<Proof[] | null> {
  const mint = new Mint(MINT_URL);
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  
  // Check quote status
  const quote = await wallet.checkMintQuoteBolt11(quoteId);
  
  if (quote.state !== 'PAID') {
    return null;
  }
  
  // Mint the proofs
  console.log('✅ Quote paid! Minting proofs...');
  const proofs = await wallet.mintProofsBolt11(amount, quoteId);
  
  return proofs;
}

function addProofsToPool(newProofs: Proof[]) {
  // Backup current pool
  if (existsSync(PROOFS_FILE)) {
    copyFileSync(PROOFS_FILE, BACKUP_FILE);
  }
  
  // Load existing proofs
  const existing: Proof[] = existsSync(PROOFS_FILE)
    ? JSON.parse(readFileSync(PROOFS_FILE, 'utf-8'))
    : [];
  
  // Merge
  const merged = [...existing, ...newProofs];
  writeFileSync(PROOFS_FILE, JSON.stringify(merged, null, 2));
  
  const oldBalance = existing.reduce((s, p) => s + p.amount, 0);
  const newBalance = merged.reduce((s, p) => s + p.amount, 0);
  const added = newProofs.reduce((s, p) => s + p.amount, 0);
  
  console.log(`\n🏦 Pool Updated`);
  console.log(`   Previous: ${oldBalance} credits (${existing.length} proofs)`);
  console.log(`   Added:    ${added} credits (${newProofs.length} proofs)`);
  console.log(`   New:      ${newBalance} credits (${merged.length} proofs)`);
}

async function pollUntilPaid(quoteId: string, amount: number, timeoutMs = 300000) {
  const startTime = Date.now();
  const pollInterval = 3000; // 3 seconds
  
  console.log(`\n⏳ Waiting for payment (timeout: ${timeoutMs / 1000}s)...`);
  console.log('   Press Ctrl+C to cancel\n');
  
  while (Date.now() - startTime < timeoutMs) {
    process.stdout.write('.');
    
    const proofs = await checkQuoteAndMint(quoteId, amount);
    
    if (proofs) {
      console.log('\n');
      addProofsToPool(proofs);
      return true;
    }
    
    await new Promise(r => setTimeout(r, pollInterval));
  }
  
  console.log('\n\n⏰ Timeout waiting for payment');
  console.log('   You can try again later with:');
  console.log(`   npx tsx scripts/proof-pool-refill.ts ${quoteId} ${amount}`);
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const poll = args.includes('--poll');
  const filteredArgs = args.filter(a => a !== '--poll');
  
  if (filteredArgs.length < 2) {
    console.log('Usage: npx tsx scripts/proof-pool-refill.ts [--poll] <quote-id> <amount>');
    console.log('');
    console.log('Options:');
    console.log('  --poll    Poll until the invoice is paid (5 min timeout)');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx scripts/proof-pool-refill.ts abc123 100');
    console.log('  npx tsx scripts/proof-pool-refill.ts --poll abc123 100');
    process.exit(1);
  }
  
  const [quoteId, amountStr] = filteredArgs;
  const amount = parseInt(amountStr);
  
  if (isNaN(amount) || amount <= 0) {
    console.error('Invalid amount');
    process.exit(1);
  }
  
  console.log(`\n🔍 Checking quote: ${quoteId}`);
  console.log(`   Amount: ${amount} sats`);
  
  if (poll) {
    await pollUntilPaid(quoteId, amount);
  } else {
    const proofs = await checkQuoteAndMint(quoteId, amount);
    
    if (!proofs) {
      console.log('\n⏳ Quote not yet paid');
      console.log('   Pay the invoice and run this command again, or use --poll');
      process.exit(1);
    }
    
    addProofsToPool(proofs);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
