/**
 * Mint tokens and save to a file
 * 
 * Usage: npx tsx scripts/mint-and-save.ts <amount>
 */

import { Wallet, MemoryAdapter } from '../packages/wallet/src/index.js';
import { getEncodedTokenV4 } from '@cashu/cashu-ts';
import * as fs from 'fs';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const PROOFS_FILE = './proofs.json';

async function main() {
  const amount = parseInt(process.argv[2] || '11', 10);
  
  // Load existing proofs if any
  let existingProofs: any[] = [];
  if (fs.existsSync(PROOFS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROOFS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        existingProofs = data;
        console.log(`Loaded ${existingProofs.length} existing proofs\n`);
      }
    } catch (e) {
      console.log('No valid existing proofs found\n');
    }
  }
  
  const wallet = new Wallet({
    mintUrl: MINT_URL,
    storage: new MemoryAdapter(existingProofs),
  });
  
  await wallet.load();
  console.log(`Current balance: ${wallet.balance} credits\n`);
  
  // Create quote
  console.log(`Creating mint quote for ${amount} credits...`);
  const quote = await wallet.createMintQuote(amount);
  
  console.log('\n⚡ PAY THIS INVOICE:');
  console.log(quote.request);
  console.log(`\nQuote ID: ${quote.id}`);
  console.log('\nWaiting for payment...');
  
  // Poll for payment
  let paid = false;
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes
  
  while (!paid && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000)); // 5 sec
    attempts++;
    process.stdout.write('.');
    
    try {
      const minted = await wallet.mintTokens(quote);
      if (minted > 0) {
        paid = true;
        console.log(`\n\n✅ Minted ${minted} credits!`);
      }
    } catch (err: any) {
      // Quote not paid yet, keep polling
      if (!err.message?.includes('not paid')) {
        console.log(`\nError: ${err.message}`);
      }
    }
  }
  
  if (!paid) {
    console.log('\n\n❌ Timed out waiting for payment');
    process.exit(1);
  }
  
  // Save proofs
  const allProofs = wallet.proofs;
  fs.writeFileSync(PROOFS_FILE, JSON.stringify(allProofs, null, 2));
  console.log(`Saved ${allProofs.length} proofs to ${PROOFS_FILE}`);
  console.log(`New balance: ${wallet.balance} credits`);
  
  // Also output a token for easy copy/paste
  if (allProofs.length > 0) {
    const token = getEncodedTokenV4({
      mint: MINT_URL,
      proofs: allProofs,
      unit: 'usd',
    });
    console.log('\n📋 Full wallet as token (for import):');
    console.log(token);
  }
}

main().catch(console.error);
