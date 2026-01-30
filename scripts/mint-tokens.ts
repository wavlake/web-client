#!/usr/bin/env npx tsx
/**
 * Mint tokens from a paid quote
 */
import { Mint, Wallet, getEncodedTokenV4 } from '@cashu/cashu-ts';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const QUOTE_ID = process.argv[2] || '1Rc4vh1bucuBjeZDBUxveI9rrNvqDRbScOMyd8sx';

async function main() {
  console.log('🔧 Initializing wallet...');
  const mint = new Mint(MINT_URL);
  const wallet = new Wallet(mint, { unit: 'usd' });
  
  // Load mint keys
  await wallet.loadMint();
  console.log(`✓ Keyset ID: ${wallet.keysetId}`);
  
  // Check quote status
  console.log(`\n📋 Checking quote: ${QUOTE_ID}`);
  const quote = await wallet.checkMintQuote(QUOTE_ID);
  console.log(`   State: ${quote.state}`);
  console.log(`   Amount: ${quote.amount} usd`);
  
  if (quote.state !== 'PAID') {
    console.error('❌ Quote not paid yet');
    process.exit(1);
  }
  
  // Mint tokens
  console.log('\n⚡ Minting tokens...');
  const proofs = await wallet.mintProofs(quote.amount, QUOTE_ID);
  
  console.log(`✓ Minted ${proofs.length} proofs`);
  console.log(`   Amounts: ${proofs.map(p => p.amount).join(', ')}`);
  console.log(`   Total: ${proofs.reduce((s, p) => s + p.amount, 0)} credits`);
  
  // Encode as token
  const token = getEncodedTokenV4({
    mint: MINT_URL,
    proofs,
    unit: 'usd',
  });
  
  console.log(`\n🎫 Token (cashuB...):`);
  console.log(token);
  
  // Save proofs to file
  const fs = await import('fs');
  const data = {
    mintUrl: MINT_URL,
    unit: 'usd',
    keysetId: wallet.keysetId,
    proofs,
    token,
    mintedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync('proofs.json', JSON.stringify(data, null, 2));
  console.log('\n💾 Saved to proofs.json');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
