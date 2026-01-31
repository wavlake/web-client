/**
 * Proof inspection utilities
 * 
 * Helpers for examining and summarizing wallet state.
 */

import type { Proof } from '@cashu/cashu-ts';

/**
 * Summary of proofs by keyset
 */
export interface ProofSummary {
  /** Total number of proofs */
  totalProofs: number;
  /** Total balance across all proofs */
  totalBalance: number;
  /** Breakdown by keyset ID */
  byKeyset: Record<string, {
    proofCount: number;
    balance: number;
    amounts: number[];
  }>;
  /** Breakdown by amount denomination */
  byAmount: Record<number, number>;
}

/**
 * Summarize a set of proofs
 * 
 * @example
 * ```ts
 * const summary = summarizeProofs(wallet.proofs);
 * console.log('Total balance:', summary.totalBalance);
 * console.log('Keysets:', Object.keys(summary.byKeyset));
 * ```
 */
export function summarizeProofs(proofs: Proof[]): ProofSummary {
  const summary: ProofSummary = {
    totalProofs: proofs.length,
    totalBalance: 0,
    byKeyset: {},
    byAmount: {},
  };

  for (const proof of proofs) {
    summary.totalBalance += proof.amount;

    // By keyset
    if (!summary.byKeyset[proof.id]) {
      summary.byKeyset[proof.id] = {
        proofCount: 0,
        balance: 0,
        amounts: [],
      };
    }
    summary.byKeyset[proof.id].proofCount++;
    summary.byKeyset[proof.id].balance += proof.amount;
    summary.byKeyset[proof.id].amounts.push(proof.amount);

    // By amount
    summary.byAmount[proof.amount] = (summary.byAmount[proof.amount] || 0) + 1;
  }

  return summary;
}

/**
 * Get a human-readable proof description
 */
export function describeProof(proof: Proof): string {
  return `${proof.amount} (keyset: ${proof.id.slice(0, 8)}...)`;
}

/**
 * Check if proofs can cover a specific amount
 */
export function canCoverAmount(proofs: Proof[], amount: number): boolean {
  const total = proofs.reduce((sum, p) => sum + p.amount, 0);
  return total >= amount;
}

/**
 * Find the optimal proofs to cover an amount (smallest combination)
 * Returns null if not enough balance
 */
export function findOptimalProofs(proofs: Proof[], amount: number): Proof[] | null {
  // Sort by amount ascending
  const sorted = [...proofs].sort((a, b) => a.amount - b.amount);
  
  const selected: Proof[] = [];
  let total = 0;

  for (const proof of sorted) {
    if (total >= amount) break;
    selected.push(proof);
    total += proof.amount;
  }

  return total >= amount ? selected : null;
}

/**
 * Calculate the change that would result from a payment
 */
export function calculateChange(proofs: Proof[], amount: number): number {
  const total = proofs.reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, total - amount);
}
