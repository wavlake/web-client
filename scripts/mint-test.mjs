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
  console.log('Wallet loaded');
  
  // Check quote 
  const quote = await wallet.getMintQuote(QUOTE_ID);
  console.log('Quote state:', quote.state);
  
  if (quote.state === 'PAID') {
    console.log('Minting from quote...');
    await wallet.mintFromQuote(quote);
    console.log('Balance:', wallet.balance);
    console.log('Proofs:', wallet.proofs.length);
    
    if (wallet.proofs.length > 0) {
      const token = getEncodedTokenV4({ mint: MINT_URL, proofs: wallet.proofs, unit: 'sat' });
      console.log('\n✅ TOKEN:\n' + token);
    }
  }
}

main().catch(e => console.error('Error:', e));
