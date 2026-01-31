/**
 * Mint tokens from a paid quote and save to proofs.json
 */

import { Wallet, Mint, getEncodedTokenV4 } from '@cashu/cashu-ts';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const PROOFS_FILE = './proofs.json';
const BACKUP_FILE = './proofs.backup.json';

async function mintTokens(quoteId, amount) {
  console.log(`Minting ${amount} credits from quote ${quoteId}...`);
  
  // Initialize mint and wallet
  const mint = new Mint(MINT_URL);
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  
  console.log('Wallet initialized');
  
  // Use mintProofsBolt11 which is the correct method for bolt11 quotes
  console.log('Calling wallet.mintProofsBolt11()...');
  const result = await wallet.mintProofsBolt11(amount, quoteId);
  console.log('Result type:', typeof result);
  console.log('Result keys:', result ? Object.keys(result) : 'null');
  console.log('Result:', JSON.stringify(result, null, 2).slice(0, 500));
  
  // Handle different result structures
  const proofs = Array.isArray(result) ? result : (result?.proofs || result?.send || []);
  
  if (!proofs || proofs.length === 0) {
    throw new Error('No proofs received from mint');
  }
  
  console.log(`Minted ${proofs.length} proofs:`);
  proofs.forEach(p => console.log(`  - ${p.amount} credits (keyset: ${p.id})`));
  
  const totalMinted = proofs.reduce((s, p) => s + p.amount, 0);
  console.log(`Total minted: ${totalMinted} credits`);
  
  // Load existing proofs
  let existingProofs = [];
  if (existsSync(PROOFS_FILE)) {
    // Backup existing file first
    const existing = readFileSync(PROOFS_FILE, 'utf-8');
    writeFileSync(BACKUP_FILE, existing);
    console.log(`Backed up existing proofs to ${BACKUP_FILE}`);
    existingProofs = JSON.parse(existing);
  }
  
  // Merge and save
  const allProofs = [...existingProofs, ...proofs];
  writeFileSync(PROOFS_FILE, JSON.stringify(allProofs, null, 2));
  
  const totalBalance = allProofs.reduce((s, p) => s + p.amount, 0);
  console.log(`\nSaved to ${PROOFS_FILE}`);
  console.log(`Total balance: ${totalBalance} credits (${allProofs.length} proofs)`);
  
  // Also output as token for verification
  const token = getEncodedTokenV4({ mint: MINT_URL, proofs, unit: 'usd' });
  console.log(`\nToken (for backup):\n${token}`);
}

// Get args
const quoteId = process.argv[2];
const amount = parseInt(process.argv[3], 10);

if (!quoteId || !amount) {
  console.error('Usage: node mint-tokens.mjs <quoteId> <amount>');
  process.exit(1);
}

mintTokens(quoteId, amount).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
