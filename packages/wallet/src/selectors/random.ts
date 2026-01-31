/**
 * Random Selector
 * 
 * Random selection for privacy.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { ProofSelector } from '../types.js';

/**
 * Select proofs randomly.
 * 
 * This strategy provides some privacy by making proof selection
 * less predictable. Useful when you don't want your spending
 * patterns to be easily analyzed.
 * 
 * @param proofs - Available proofs
 * @param amount - Target amount
 * @returns Selected proofs or null if insufficient balance
 */
export const random: ProofSelector = (proofs: Proof[], amount: number): Proof[] | null => {
  if (amount <= 0) {
    return [];
  }

  // Check total balance first
  const totalBalance = proofs.reduce((sum, p) => sum + p.amount, 0);
  if (totalBalance < amount) {
    return null;
  }

  // Shuffle proofs using Fisher-Yates
  const shuffled = [...proofs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Select until we have enough
  const selected: Proof[] = [];
  let total = 0;

  for (const proof of shuffled) {
    if (total >= amount) {
      break;
    }
    selected.push(proof);
    total += proof.amount;
  }

  return selected;
};
