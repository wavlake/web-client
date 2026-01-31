/**
 * Smallest First Selector
 * 
 * Select smallest proofs first to minimize change.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { ProofSelector } from '../types.js';

/**
 * Select smallest proofs first.
 * 
 * This strategy minimizes the amount of change returned,
 * which can help consolidate proofs over time.
 * 
 * @param proofs - Available proofs
 * @param amount - Target amount
 * @returns Selected proofs or null if insufficient balance
 */
export const smallestFirst: ProofSelector = (proofs: Proof[], amount: number): Proof[] | null => {
  if (amount <= 0) {
    return [];
  }

  // Sort by amount ascending
  const sorted = [...proofs].sort((a, b) => a.amount - b.amount);
  
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
