/**
 * Largest First Selector
 * 
 * Select largest proofs first to minimize proof count.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { ProofSelector } from '../types.js';

/**
 * Select largest proofs first.
 * 
 * This strategy minimizes the number of proofs used in a transaction,
 * which can reduce transaction size but may result in more change.
 * 
 * @param proofs - Available proofs
 * @param amount - Target amount
 * @returns Selected proofs or null if insufficient balance
 */
export const largestFirst: ProofSelector = (proofs: Proof[], amount: number): Proof[] | null => {
  if (amount <= 0) {
    return [];
  }

  // Sort by amount descending
  const sorted = [...proofs].sort((a, b) => b.amount - a.amount);
  
  const selected: Proof[] = [];
  let total = 0;

  for (const proof of sorted) {
    if (total >= amount) {
      break;
    }
    selected.push(proof);
    total += proof.amount;
  }

  // Check if we have enough
  if (total < amount) {
    return null;
  }

  return selected;
};
