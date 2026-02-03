/**
 * Denomination Analyzer
 * 
 * Utilities for analyzing wallet denomination distribution and payment feasibility.
 * Helps understand what operations will be needed for a given payment.
 */

import type { Proof } from '@cashu/cashu-ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of analyzing if a payment can be made without swapping
 */
export interface ExactPaymentAnalysis {
  /** Whether exact payment is possible (no swap needed) */
  canPayExact: boolean;
  /** Proofs that would be used for exact payment (if possible) */
  exactProofs: Proof[] | null;
  /** Total balance available */
  totalBalance: number;
  /** Whether there's sufficient balance at all */
  hasSufficientBalance: boolean;
}

/**
 * Comprehensive payment analysis
 */
export interface PaymentAnalysis {
  /** Amount being analyzed */
  amount: number;
  /** Total wallet balance */
  totalBalance: number;
  /** Whether payment is possible at all */
  canAfford: boolean;
  /** Whether payment can be made without swap */
  canPayExact: boolean;
  /** Proofs that would be used */
  selectedProofs: Proof[];
  /** Total of selected proofs */
  selectedTotal: number;
  /** Change that would need to be swapped back */
  changeAmount: number;
  /** Whether a mint swap operation is needed */
  requiresSwap: boolean;
  /** Estimated efficiency (1.0 = perfect, lower = more wasteful) */
  efficiency: number;
}

/**
 * Wallet denomination health report
 */
export interface DenominationHealth {
  /** Total balance */
  totalBalance: number;
  /** Number of proofs */
  proofCount: number;
  /** Denominations present (sorted ascending) */
  denominations: number[];
  /** Count of each denomination */
  denominationCounts: Record<number, number>;
  /** Average proof size */
  averageProofSize: number;
  /** Smallest denomination */
  smallestDenom: number | null;
  /** Largest denomination */
  largestDenom: number | null;
  /** Common payment amounts this wallet can pay exactly */
  exactPayableAmounts: number[];
  /** Recommended actions to improve wallet health */
  recommendations: string[];
  /** Health score (0-100) */
  score: number;
}

/**
 * Options for denomination analysis
 */
export interface AnalysisOptions {
  /** Common payment amounts to check for exact payability (default: [1, 2, 3, 5, 10]) */
  commonAmounts?: number[];
  /** Maximum subset search depth for exact match (default: 50 proofs) */
  maxSubsetSearch?: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Analyze if a specific amount can be paid exactly (without swap)
 * 
 * @param proofs - Available proofs
 * @param amount - Target payment amount
 * @param options - Analysis options
 * @returns Analysis result
 * 
 * @example
 * ```ts
 * const analysis = analyzeExactPayment(wallet.proofs, 5);
 * if (analysis.canPayExact) {
 *   console.log('Can pay exactly with', analysis.exactProofs!.length, 'proofs');
 * } else if (analysis.hasSufficientBalance) {
 *   console.log('Can pay but will need swap');
 * } else {
 *   console.log('Insufficient balance');
 * }
 * ```
 */
export function analyzeExactPayment(
  proofs: Proof[],
  amount: number,
  options: AnalysisOptions = {}
): ExactPaymentAnalysis {
  const totalBalance = proofs.reduce((sum, p) => sum + p.amount, 0);
  const hasSufficientBalance = totalBalance >= amount;

  if (!hasSufficientBalance || amount <= 0) {
    return {
      canPayExact: false,
      exactProofs: null,
      totalBalance,
      hasSufficientBalance,
    };
  }

  const { maxSubsetSearch = 50 } = options;
  const exactProofs = findExactSubset(proofs, amount, maxSubsetSearch);

  return {
    canPayExact: exactProofs !== null,
    exactProofs,
    totalBalance,
    hasSufficientBalance,
  };
}

/**
 * Comprehensive payment analysis
 * 
 * Analyzes what would happen if you tried to pay a specific amount,
 * including proof selection, change, and efficiency.
 * 
 * @param proofs - Available proofs
 * @param amount - Target payment amount
 * @param options - Analysis options
 * @returns Detailed payment analysis
 * 
 * @example
 * ```ts
 * const analysis = analyzePayment(wallet.proofs, 7);
 * 
 * console.log('Can afford:', analysis.canAfford);
 * console.log('Requires swap:', analysis.requiresSwap);
 * console.log('Change amount:', analysis.changeAmount);
 * console.log('Efficiency:', (analysis.efficiency * 100).toFixed(1) + '%');
 * ```
 */
export function analyzePayment(
  proofs: Proof[],
  amount: number,
  options: AnalysisOptions = {}
): PaymentAnalysis {
  const totalBalance = proofs.reduce((sum, p) => sum + p.amount, 0);
  const canAfford = totalBalance >= amount;

  if (!canAfford || amount <= 0) {
    return {
      amount,
      totalBalance,
      canAfford,
      canPayExact: false,
      selectedProofs: [],
      selectedTotal: 0,
      changeAmount: 0,
      requiresSwap: false,
      efficiency: 0,
    };
  }

  // Try to find exact match first
  const { maxSubsetSearch = 50 } = options;
  const exactProofs = findExactSubset(proofs, amount, maxSubsetSearch);

  if (exactProofs) {
    return {
      amount,
      totalBalance,
      canAfford: true,
      canPayExact: true,
      selectedProofs: exactProofs,
      selectedTotal: amount,
      changeAmount: 0,
      requiresSwap: false,
      efficiency: 1.0,
    };
  }

  // Fall back to smallest-first selection
  const sorted = [...proofs].sort((a, b) => a.amount - b.amount);
  const selectedProofs: Proof[] = [];
  let selectedTotal = 0;

  for (const proof of sorted) {
    if (selectedTotal >= amount) break;
    selectedProofs.push(proof);
    selectedTotal += proof.amount;
  }

  const changeAmount = selectedTotal - amount;
  // Efficiency: how much of selected proofs is actually used
  const efficiency = amount / selectedTotal;

  return {
    amount,
    totalBalance,
    canAfford: true,
    canPayExact: false,
    selectedProofs,
    selectedTotal,
    changeAmount,
    requiresSwap: true,
    efficiency,
  };
}

/**
 * Analyze wallet denomination health
 * 
 * Provides insights into the denomination distribution and
 * recommendations for improving wallet efficiency.
 * 
 * @param proofs - Wallet proofs
 * @param options - Analysis options
 * @returns Denomination health report
 * 
 * @example
 * ```ts
 * const health = analyzeDenominationHealth(wallet.proofs);
 * 
 * console.log('Denominations:', health.denominations);
 * console.log('Health score:', health.score);
 * 
 * for (const rec of health.recommendations) {
 *   console.log('Recommendation:', rec);
 * }
 * ```
 */
export function analyzeDenominationHealth(
  proofs: Proof[],
  options: AnalysisOptions = {}
): DenominationHealth {
  const { commonAmounts = [1, 2, 3, 5, 10, 20, 50, 100] } = options;

  const totalBalance = proofs.reduce((sum, p) => sum + p.amount, 0);
  const proofCount = proofs.length;

  // Count denominations
  const denominationCounts: Record<number, number> = {};
  for (const proof of proofs) {
    denominationCounts[proof.amount] = (denominationCounts[proof.amount] || 0) + 1;
  }

  const denominations = Object.keys(denominationCounts)
    .map(Number)
    .sort((a, b) => a - b);

  const smallestDenom = denominations.length > 0 ? denominations[0] : null;
  const largestDenom = denominations.length > 0 ? denominations[denominations.length - 1] : null;
  const averageProofSize = proofCount > 0 ? totalBalance / proofCount : 0;

  // Find which common amounts can be paid exactly
  const exactPayableAmounts = commonAmounts
    .filter(amount => amount <= totalBalance)
    .filter(amount => {
      const analysis = analyzeExactPayment(proofs, amount, options);
      return analysis.canPayExact;
    });

  // Generate recommendations and calculate score
  const recommendations: string[] = [];
  let score = 100;

  // Check for denomination variety
  if (denominations.length === 1 && proofCount > 3) {
    recommendations.push(
      `All proofs are ${denominations[0]} credits. Consider splitting some for more payment flexibility.`
    );
    score -= 15;
  }

  // Check for very large proofs
  if (largestDenom && largestDenom > 100 && totalBalance > largestDenom) {
    const largeCount = denominationCounts[largestDenom] || 0;
    if (largeCount > 0) {
      recommendations.push(
        `You have ${largeCount} proof(s) of ${largestDenom} credits. Large proofs require swaps for small payments.`
      );
      score -= 10;
    }
  }

  // Check for too many tiny proofs
  const tinyProofCount = denominations
    .filter(d => d <= 1)
    .reduce((sum, d) => sum + (denominationCounts[d] || 0), 0);
  
  if (tinyProofCount > proofCount * 0.5 && proofCount > 10) {
    recommendations.push(
      `${tinyProofCount} of ${proofCount} proofs are tiny (≤1 credit). Consider consolidating.`
    );
    score -= 10;
  }

  // Check exact payability of common amounts
  const commonNotPayable = commonAmounts.filter(
    a => a <= totalBalance && !exactPayableAmounts.includes(a)
  );
  if (commonNotPayable.length > 3) {
    recommendations.push(
      `Cannot pay common amounts (${commonNotPayable.slice(0, 3).join(', ')}...) without swapping.`
    );
    score -= 5;
  }

  // Check if empty
  if (proofCount === 0) {
    recommendations.push('Wallet is empty. Fund your wallet to make payments.');
    score = 0;
  }

  // Check for good variety
  const hasSmall = smallestDenom !== null && smallestDenom <= 2;
  const hasMedium = denominations.some(d => d >= 5 && d <= 20);
  const hasLarge = largestDenom !== null && largestDenom >= 50;
  
  if (proofCount >= 5 && hasSmall && hasMedium && hasLarge) {
    // Good variety - no penalty
  } else if (proofCount >= 5) {
    if (!hasSmall) {
      recommendations.push('No small denominations (1-2). May need swaps for small payments.');
      score -= 5;
    }
  }

  return {
    totalBalance,
    proofCount,
    denominations,
    denominationCounts,
    averageProofSize: Math.round(averageProofSize * 100) / 100,
    smallestDenom,
    largestDenom,
    exactPayableAmounts,
    recommendations,
    score: Math.max(0, score),
  };
}

/**
 * Calculate what denominations would be ideal for a given balance
 * 
 * Returns suggested breakdown using powers of 2 (Cashu standard)
 * for optimal payment flexibility.
 * 
 * @param targetBalance - Total balance to distribute
 * @returns Suggested denomination distribution
 * 
 * @example
 * ```ts
 * const suggestion = suggestDenominations(25);
 * // Returns { 1: 1, 2: 0, 4: 1, 8: 0, 16: 1 } = 1 + 4 + 16 = 21
 * // Actually: { 1: 1, 8: 1, 16: 1 } = 1 + 8 + 16 = 25
 * ```
 */
export function suggestDenominations(targetBalance: number): Record<number, number> {
  if (targetBalance <= 0) {
    return {};
  }

  // Standard Cashu denominations (powers of 2)
  const denoms = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  const result: Record<number, number> = {};
  let remaining = targetBalance;

  // Greedy algorithm: largest denominations first
  for (let i = denoms.length - 1; i >= 0 && remaining > 0; i--) {
    const denom = denoms[i];
    const count = Math.floor(remaining / denom);
    if (count > 0) {
      result[denom] = count;
      remaining -= count * denom;
    }
  }

  return result;
}

/**
 * Check multiple payment amounts at once
 * 
 * Efficiently batch-check which amounts can be paid exactly.
 * 
 * @param proofs - Available proofs
 * @param amounts - Amounts to check
 * @returns Map of amount to whether it can be paid exactly
 * 
 * @example
 * ```ts
 * const payable = batchCheckExactPayments(wallet.proofs, [1, 5, 10, 20, 50]);
 * // { 1: true, 5: true, 10: false, 20: true, 50: false }
 * ```
 */
export function batchCheckExactPayments(
  proofs: Proof[],
  amounts: number[]
): Record<number, boolean> {
  const result: Record<number, boolean> = {};
  const totalBalance = proofs.reduce((sum, p) => sum + p.amount, 0);

  for (const amount of amounts) {
    if (amount > totalBalance) {
      result[amount] = false;
      continue;
    }
    
    const analysis = analyzeExactPayment(proofs, amount);
    result[amount] = analysis.canPayExact;
  }

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find a subset of proofs that exactly matches the target amount.
 * Uses dynamic programming with early termination.
 */
function findExactSubset(
  proofs: Proof[],
  target: number,
  maxProofs: number = 50
): Proof[] | null {
  if (proofs.length === 0 || target <= 0) {
    return target === 0 ? [] : null;
  }

  // Limit search space
  const searchProofs = proofs.length > maxProofs 
    ? proofs.slice(0, maxProofs) 
    : proofs;

  // Check for single proof match first (common case)
  const singleMatch = searchProofs.find(p => p.amount === target);
  if (singleMatch) {
    return [singleMatch];
  }

  // Check for two-proof match (also common)
  for (let i = 0; i < searchProofs.length; i++) {
    const needed = target - searchProofs[i].amount;
    if (needed > 0) {
      const match = searchProofs.find((p, j) => j !== i && p.amount === needed);
      if (match) {
        return [searchProofs[i], match];
      }
    }
  }

  // Full subset sum with DP (for larger combinations)
  // dp[sum] = indices of proofs
  const dp: Map<number, number[]> = new Map();
  dp.set(0, []);

  for (let i = 0; i < searchProofs.length; i++) {
    const proofAmount = searchProofs[i].amount;
    const entries = Array.from(dp.entries());
    
    for (const [sum, indices] of entries) {
      const newSum = sum + proofAmount;
      
      if (newSum === target) {
        return [...indices, i].map(idx => searchProofs[idx]);
      }
      
      if (newSum < target && !dp.has(newSum)) {
        dp.set(newSum, [...indices, i]);
      }
    }
  }

  return null;
}
