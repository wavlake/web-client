/**
 * Exact Match Selector
 * 
 * Try to find an exact match first, then fall back to smallest first.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { ProofSelector } from '../types.js';
import { smallestFirst } from './smallest.js';

/**
 * Try to find exact match, fall back to smallest first.
 * 
 * This strategy first attempts to find a combination of proofs
 * that exactly matches the target amount (zero change). If no
 * exact match is found, it falls back to selecting smallest first.
 * 
 * Uses a simple subset sum approach with early termination.
 * For very large proof sets, this may be slower than other strategies.
 * 
 * @param proofs - Available proofs
 * @param amount - Target amount
 * @returns Selected proofs or null if insufficient balance
 */
export const exactMatch: ProofSelector = (proofs: Proof[], amount: number): Proof[] | null => {
  if (amount <= 0) {
    return [];
  }

  // Check total balance first
  const totalBalance = proofs.reduce((sum, p) => sum + p.amount, 0);
  if (totalBalance < amount) {
    return null;
  }

  // Try to find exact match using subset sum
  const exact = findExactSubset(proofs, amount);
  if (exact) {
    return exact;
  }

  // Fall back to smallest first
  return smallestFirst(proofs, amount);
};

/**
 * Find a subset of proofs that exactly matches the target amount.
 * Uses dynamic programming with memoization.
 */
function findExactSubset(proofs: Proof[], target: number): Proof[] | null {
  // Limit search to prevent performance issues
  const MAX_PROOFS = 50;
  const MAX_TARGET = 10000;
  
  if (proofs.length > MAX_PROOFS || target > MAX_TARGET) {
    // Too many proofs or target too large, skip exact match
    return null;
  }

  // dp[i] = indices of proofs that sum to i, or undefined if not possible
  const dp: Map<number, number[]> = new Map();
  dp.set(0, []);

  for (let i = 0; i < proofs.length; i++) {
    const proofAmount = proofs[i].amount;
    
    // Iterate in reverse to avoid using same proof twice
    const entries = Array.from(dp.entries()).reverse();
    
    for (const [sum, indices] of entries) {
      const newSum = sum + proofAmount;
      
      if (newSum === target) {
        // Found exact match!
        return [...indices, i].map(idx => proofs[idx]);
      }
      
      if (newSum < target && !dp.has(newSum)) {
        dp.set(newSum, [...indices, i]);
      }
    }
  }

  return null;
}
