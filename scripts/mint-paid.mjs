import { Wallet, MemoryAdapter } from '../packages/wallet/dist/index.js';
import { getEncodedTokenV4 } from '@cashu/cashu-ts';

const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const QUOTE_ID = process.argv[2] || 'NB__2tqxEvJkA3ZJEc-v_uXr1SfxL7slB9TP5z89';

async function main() {
  const wallet = new Wallet({
    mintUrl: MINT_URL,
    storage: new MemoryAdapter(),
    unit: 'sat',
  });
  
  await wallet.load();
  
  const quote = await wallet.checkMintQuote(QUOTE_ID);
  console.log('Quote:', quote);
  
  if (quote.paid) {
    console.log('Minting...');
    const minted = await wallet.mintTokens({ id: QUOTE_ID, amount: quote.amount, request: '', expiry: 0, paid: true });
    console.log('Minted:', minted, 'sats');
    
    const token = getEncodedTokenV4({ mint: MINT_URL, proofs: wallet.proofs, unit: 'sat' });
    console.log('\n✅ TOKEN:\n' + token);
  } else {
    console.log('Not paid yet');
  }
}
main().catch(e => console.error('Error:', e));
