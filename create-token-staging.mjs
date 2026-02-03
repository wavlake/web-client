import { getEncodedTokenV4 } from '@cashu/cashu-ts';
import fs from 'fs';

// Use the STAGING mint URL that POC v2 uses
const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';

// Load proofs from file
const proofs = JSON.parse(fs.readFileSync('./proofs.json', 'utf-8'));
console.log(`Loaded ${proofs.length} proofs, total: ${proofs.reduce((s, p) => s + p.amount, 0)} credits`);

// Take 6 credits worth
let amount = 0;
const selected = [];
for (const p of proofs) {
  if (amount >= 6) break;
  selected.push(p);
  amount += p.amount;
}

console.log(`Selected ${selected.length} proofs for ${amount} credits`);

// Create token with STAGING mint
const token = getEncodedTokenV4({
  mint: MINT_URL,
  proofs: selected,
  unit: 'usd',
});

console.log('\n=== TOKEN (STAGING MINT) ===');
console.log(token);
console.log('============================\n');

// Update proofs.json to remove used proofs
const remaining = proofs.filter(p => !selected.includes(p));
fs.writeFileSync('./proofs.json', JSON.stringify(remaining, null, 2));
console.log(`Remaining: ${remaining.length} proofs, ${remaining.reduce((s, p) => s + p.amount, 0)} credits`);
