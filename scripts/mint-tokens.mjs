import { Wallet, MemoryAdapter } from '../packages/wallet/dist/index.js';
import { getEncodedTokenV4 } from '@cashu/cashu-ts';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const QUOTE_ID = 'dRuuwEz3ffBIgKgFzXHdISrrqhqO_8znMETSZe8L';

async function main() {
  const wallet = new Wallet({
    mintUrl: MINT_URL,
    storage: new MemoryAdapter(),
    unit: 'sat',
  });
  
  await wallet.load();
  console.log('Wallet loaded, balance:', wallet.balance);
  
  // Check the quote
  console.log('Checking quote:', QUOTE_ID);
  const quote = await wallet.checkMintQuote(QUOTE_ID);
  console.log('Quote state:', quote);
  
  if (quote.paid) {
    console.log('Quote is PAID! Minting tokens...');
    const minted = await wallet.mintTokens({ id: QUOTE_ID, amount: 11, request: '', expiry: 0, paid: true });
    console.log('Minted:', minted, 'sats');
    console.log('New balance:', wallet.balance);
    console.log('Proofs:', wallet.proofs.length);
    
    // Create token string
    const token = getEncodedTokenV4({ mint: MINT_URL, proofs: wallet.proofs, unit: 'sat' });
    console.log('\n✅ TOKEN:\n' + token);
  } else {
    console.log('Quote not paid');
  }
}

main().catch(e => console.error('Error:', e));
