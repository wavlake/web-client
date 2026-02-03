/**
 * Proof inspection utilities
 * 
 * Helpers for examining and summarizing wallet state.
 */

import type { Proof } from '@cashu/cashu-ts';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Functions
// ============================================================================

/**
 * Summarize a set of proofs
 * 
 * Provides a breakdown of proofs by keyset and denomination,
 * useful for debugging and understanding wallet state.
 * 
 * @param proofs - Array of Cashu proofs
 * @returns Summary with totals and breakdowns
 * 
 * @example
 * ```ts
 * const summary = summarizeProofs(wallet.proofs);
 * console.log('Total balance:', summary.totalBalance);
 * console.log('Keysets:', Object.keys(summary.byKeyset));
 * console.log('Denominations:', summary.byAmount);
 * ```
 */
export function summarizeProofs(proofs: Proof[]): ProofSummary {
  const byKeyset: ProofSummary['byKeyset'] = {};
  const byAmount: Record<number, number> = {};
  let totalBalance = 0;

  for (const proof of proofs) {
    // Sum total balance
    totalBalance += proof.amount;

    // Group by keyset
    const keysetId = proof.id;
    if (!byKeyset[keysetId]) {
      byKeyset[keysetId] = {
        proofCount: 0,
        balance: 0,
        amounts: [],
      };
    }
    byKeyset[keysetId].proofCount++;
    byKeyset[keysetId].balance += proof.amount;
    byKeyset[keysetId].amounts.push(proof.amount);

    // Count by amount
    byAmount[proof.amount] = (byAmount[proof.amount] || 0) + 1;
  }

  // Sort amounts in each keyset
  for (const keysetId of Object.keys(byKeyset)) {
    byKeyset[keysetId].amounts.sort((a, b) => a - b);
  }

  return {
    totalProofs: proofs.length,
    totalBalance,
    byKeyset,
    byAmount,
  };
}

/**
 * Get a human-readable proof description
 * 
 * @param proof - Single Cashu proof
 * @returns Human-readable string like "5 credits (keyset: 00ad82...)"
 * 
 * @example
 * ```ts
 * const desc = describeProof(proof);
 * // "5 credits (keyset: 00ad82d4)"
 * ```
 */
export function describeProof(proof: Proof): string {
  const keysetShort = proof.id.slice(0, 8);
  return `${proof.amount} credits (keyset: ${keysetShort})`;
}

/**
 * Check if proofs can cover a specific amount
 * 
 * @param proofs - Available proofs
 * @param amount - Amount to check
 * @returns true if total balance >= amount
 * 
 * @example
 * ```ts
 * if (canCoverAmount(wallet.proofs, 10)) {
 *   console.log('Can afford 10 credits');
 * }
 * ```
 */
export function canCoverAmount(proofs: Proof[], amount: number): boolean {
  const total = proofs.reduce((sum, p) => sum + p.amount, 0);
  return total >= amount;
}

/**
 * Find the optimal proofs to cover an amount (smallest combination)
 * Returns null if not enough balance
 * 
 * Uses a greedy algorithm that prefers smaller denominations
 * to minimize change/waste.
 * 
 * @param proofs - Available proofs
 * @param amount - Target amount
 * @returns Selected proofs or null if insufficient
 * 
 * @example
 * ```ts
 * const selected = findOptimalProofs(wallet.proofs, 7);
 * if (selected) {
 *   const total = selected.reduce((s, p) => s + p.amount, 0);
 *   console.log(`Selected ${selected.length} proofs totaling ${total}`);
 * }
 * ```
 */
export function findOptimalProofs(proofs: Proof[], amount: number): Proof[] | null {
  if (amount <= 0) {
    return [];
  }

  // Check if we have enough total
  if (!canCoverAmount(proofs, amount)) {
    return null;
  }

  // Sort proofs by amount (smallest first)
  const sorted = [...proofs].sort((a, b) => a.amount - b.amount);

  // First, try to find an exact match with a single proof
  const exactMatch = sorted.find(p => p.amount === amount);
  if (exactMatch) {
    return [exactMatch];
  }

  // Greedy selection: smallest first
  const selected: Proof[] = [];
  let remaining = amount;

  for (const proof of sorted) {
    if (remaining <= 0) break;
    selected.push(proof);
    remaining -= proof.amount;
  }

  // Verify we covered the amount
  const total = selected.reduce((sum, p) => sum + p.amount, 0);
  if (total < amount) {
    return null;
  }

  return selected;
}

/**
 * Calculate the change that would result from a payment
 * 
 * @param proofs - Proofs to use for payment
 * @param amount - Payment amount
 * @returns Change amount (0 if exact, negative if insufficient)
 * 
 * @example
 * ```ts
 * const change = calculateChange(selectedProofs, 5);
 * if (change > 0) {
 *   console.log(`Will receive ${change} credits change`);
 * } else if (change < 0) {
 *   console.log(`Need ${Math.abs(change)} more credits`);
 * }
 * ```
 */
export function calculateChange(proofs: Proof[], amount: number): number {
  const total = proofs.reduce((sum, p) => sum + p.amount, 0);
  return total - amount;
}

/**
 * Group proofs by their keyset ID
 * 
 * @param proofs - Array of proofs
 * @returns Map of keyset ID to proofs
 * 
 * @example
 * ```ts
 * const grouped = groupByKeyset(wallet.proofs);
 * for (const [keysetId, keysetProofs] of Object.entries(grouped)) {
 *   console.log(`Keyset ${keysetId}: ${keysetProofs.length} proofs`);
 * }
 * ```
 */
export function groupByKeyset(proofs: Proof[]): Record<string, Proof[]> {
  const groups: Record<string, Proof[]> = {};
  
  for (const proof of proofs) {
    const keysetId = proof.id;
    if (!groups[keysetId]) {
      groups[keysetId] = [];
    }
    groups[keysetId].push(proof);
  }
  
  return groups;
}

/**
 * Get unique denominations present in proofs
 * 
 * @param proofs - Array of proofs
 * @returns Sorted array of unique amounts
 * 
 * @example
 * ```ts
 * const denoms = getDenominations(wallet.proofs);
 * // [1, 2, 4, 8, 16, ...]
 * ```
 */
export function getDenominations(proofs: Proof[]): number[] {
  const amounts = new Set<number>();
  for (const proof of proofs) {
    amounts.add(proof.amount);
  }
  return [...amounts].sort((a, b) => a - b);
}

/**
 * Format a balance for display
 * 
 * @param amount - Balance in credits
 * @param options - Formatting options
 * @returns Formatted string
 * 
 * @example
 * ```ts
 * formatBalance(1234)  // "1,234"
 * formatBalance(1234, { unit: 'USD' })  // "1,234 USD"
 * formatBalance(0.5, { decimals: 2 })  // "0.50"
 * ```
 */
export function formatBalance(
  amount: number, 
  options?: { unit?: string; decimals?: number }
): string {
  const { unit, decimals = 0 } = options || {};
  
  const formatted = decimals > 0
    ? amount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : amount.toLocaleString();
  
  return unit ? `${formatted} ${unit}` : formatted;
}

// ============================================================================
// Defragmentation Analysis
// ============================================================================

/**
 * Defragmentation analysis result
 */
export interface DefragStats {
  /** Total number of proofs */
  proofCount: number;
  /** Total balance */
  balance: number;
  /** Average proof size */
  averageProofSize: number;
  /** Fragmentation score (0-1, higher = more fragmented) */
  fragmentation: number;
  /** Number of "small" proofs (below threshold) */
  smallProofCount: number;
  /** Recommended action */
  recommendation: 'none' | 'low' | 'recommended' | 'urgent';
  /** Estimated proof count after defragmentation */
  estimatedNewProofCount: number;
}

/**
 * Options for defragmentation analysis
 */
export interface DefragOptions {
  /** 
   * Proofs smaller than this are considered "small" (default: 4)
   * Based on typical Cashu power-of-2 denominations
   */
  smallThreshold?: number;
  /**
   * Target denominations for optimal proof set (default: [1, 2, 4, 8, 16, 32, 64])
   */
  targetDenominations?: number[];
}

/**
 * Analyze proof fragmentation and get defragmentation recommendations
 * 
 * Fragmentation happens when a wallet accumulates many small proofs
 * from repeated change operations. This slows down payment flows
 * because more proofs need to be selected and swapped.
 * 
 * @param proofs - Current wallet proofs
 * @param options - Analysis options
 * @returns Defragmentation statistics and recommendation
 * 
 * @example
 * ```ts
 * const stats = getDefragStats(wallet.proofs);
 * 
 * console.log(`Fragmentation: ${(stats.fragmentation * 100).toFixed(0)}%`);
 * console.log(`Recommendation: ${stats.recommendation}`);
 * 
 * if (stats.recommendation === 'recommended' || stats.recommendation === 'urgent') {
 *   await wallet.defragment();
 * }
 * ```
 */
export function getDefragStats(proofs: Proof[], options: DefragOptions = {}): DefragStats {
  const {
    smallThreshold = 4,
    targetDenominations = [1, 2, 4, 8, 16, 32, 64],
  } = options;

  if (proofs.length === 0) {
    return {
      proofCount: 0,
      balance: 0,
      averageProofSize: 0,
      fragmentation: 0,
      smallProofCount: 0,
      recommendation: 'none',
      estimatedNewProofCount: 0,
    };
  }

  const balance = proofs.reduce((sum, p) => sum + p.amount, 0);
  const proofCount = proofs.length;
  const averageProofSize = balance / proofCount;
  const smallProofCount = proofs.filter(p => p.amount < smallThreshold).length;

  // Calculate optimal proof count for this balance
  // Using power-of-2 denominations, we can represent any amount with log2(amount) proofs
  const optimalProofCount = calculateOptimalProofCount(balance, targetDenominations);

  // Fragmentation score: how many extra proofs we have vs optimal
  // 0 = optimal, 1 = very fragmented
  const fragmentation = Math.min(1, Math.max(0, 
    (proofCount - optimalProofCount) / Math.max(proofCount, 1)
  ));

  // Determine recommendation based on fragmentation and proof count
  let recommendation: DefragStats['recommendation'] = 'none';
  
  if (proofCount <= 3) {
    recommendation = 'none';
  } else if (fragmentation > 0.7 || smallProofCount > 10) {
    recommendation = 'urgent';
  } else if (fragmentation > 0.5 || smallProofCount > 5) {
    recommendation = 'recommended';
  } else if (fragmentation > 0.3 || smallProofCount > 2) {
    recommendation = 'low';
  }

  return {
    proofCount,
    balance,
    averageProofSize,
    fragmentation,
    smallProofCount,
    recommendation,
    estimatedNewProofCount: optimalProofCount,
  };
}

/**
 * Check if defragmentation is recommended
 * 
 * @param proofs - Current wallet proofs
 * @param options - Analysis options
 * @returns true if defragmentation is recommended or urgent
 * 
 * @example
 * ```ts
 * if (needsDefragmentation(wallet.proofs)) {
 *   console.log('Consider running wallet.defragment()');
 * }
 * ```
 */
export function needsDefragmentation(proofs: Proof[], options: DefragOptions = {}): boolean {
  const stats = getDefragStats(proofs, options);
  return stats.recommendation === 'recommended' || stats.recommendation === 'urgent';
}

/**
 * Calculate the optimal number of proofs for a given balance
 * using power-of-2 denominations
 */
function calculateOptimalProofCount(balance: number, denominations: number[]): number {
  if (balance <= 0) return 0;
  
  // Sort denominations descending
  const sorted = [...denominations].sort((a, b) => b - a);
  
  let remaining = balance;
  let count = 0;
  
  for (const denom of sorted) {
    while (remaining >= denom) {
      remaining -= denom;
      count++;
    }
  }
  
  // If there's a remainder, we need proofs for that too
  // (this handles edge cases where balance doesn't divide evenly)
  if (remaining > 0) {
    count += Math.ceil(Math.log2(remaining + 1));
  }
  
  return Math.max(1, count);
}
