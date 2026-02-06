'use client';

/**
 * usePaymentPreview Hook
 * 
 * Preview what will happen when making a payment before committing.
 * Helps users understand proof selection, change, and efficiency.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  analyzePayment,
  analyzeDenominationHealth,
  type PaymentAnalysis,
  type DenominationHealth,
} from '@wavlake/wallet';
import { useWalletContext } from '../providers/WalletProvider.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Payment preview with analysis and recommendations
 */
export interface PaymentPreview {
  /** Amount being previewed */
  amount: number;
  /** Total wallet balance */
  walletBalance: number;
  /** Whether the payment can be made */
  canAfford: boolean;
  /** Whether exact payment is possible (no swap needed) */
  canPayExact: boolean;
  /** Proofs that would be selected */
  selectedProofCount: number;
  /** Total value of selected proofs */
  selectedTotal: number;
  /** Change that would need to be swapped back */
  changeAmount: number;
  /** Whether a mint swap operation is required */
  requiresSwap: boolean;
  /**
   * Payment efficiency (1.0 = perfect, lower = more wasteful)
   * - 1.0 means exact payment, no change
   * - 0.5 means only half of selected proofs are needed
   */
  efficiency: number;
  /** User-friendly explanation of what will happen */
  explanation: string;
  /** Actionable suggestion if payment isn't optimal */
  suggestion?: string;
  /** Raw payment analysis for advanced use */
  analysis: PaymentAnalysis;
}

/**
 * Wallet denomination health summary
 */
export interface WalletHealthSummary {
  /** Overall health score (0-100) */
  score: number;
  /** Whether the wallet is considered healthy */
  isHealthy: boolean;
  /** Available denominations */
  denominations: number[];
  /** Count of each denomination */
  denominationCounts: Record<number, number>;
  /** Common amounts that can be paid exactly */
  exactPayableAmounts: number[];
  /** Recommendations for improving wallet health */
  recommendations: string[];
  /** Raw health report for advanced use */
  health: DenominationHealth;
}

/**
 * Result of usePaymentPreview hook
 */
export interface UsePaymentPreviewResult {
  /** Preview a payment for a specific amount */
  previewPayment: (amount: number) => PaymentPreview | null;
  /** Get current wallet health summary */
  getWalletHealth: () => WalletHealthSummary | null;
  /** Check if a specific amount can be paid exactly */
  canPayExact: (amount: number) => boolean;
  /** Get the maximum amount that can be paid */
  maxPayableAmount: number;
  /** Current wallet balance */
  balance: number;
  /** Whether the wallet is ready */
  isReady: boolean;
}

/**
 * Options for usePaymentPreview
 */
export interface UsePaymentPreviewOptions {
  /** Common amounts to check for exact payability (default: [1, 2, 3, 5, 10, 20, 50, 100]) */
  commonAmounts?: number[];
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Preview payments before committing to understand what will happen.
 * 
 * This hook provides detailed analysis of how a payment would be processed,
 * including proof selection, efficiency, and recommendations. Use it to:
 * 
 * - Show users what will happen before they pay
 * - Display efficiency metrics
 * - Provide actionable suggestions
 * - Debug payment issues
 * 
 * @example
 * ```tsx
 * function PaymentButton({ dtag, price }: { dtag: string; price: number }) {
 *   const { previewPayment, getWalletHealth } = usePaymentPreview();
 *   const { play } = useTrackPlayer();
 *   
 *   const preview = previewPayment(price);
 *   const health = getWalletHealth();
 *   
 *   if (!preview) return <div>Loading...</div>;
 *   
 *   if (!preview.canAfford) {
 *     return (
 *       <div>
 *         <p>Insufficient balance: need {price}, have {preview.walletBalance}</p>
 *         <p>{preview.suggestion}</p>
 *       </div>
 *     );
 *   }
 *   
 *   return (
 *     <div>
 *       <p>{preview.explanation}</p>
 *       {preview.requiresSwap && (
 *         <p className="warning">
 *           Swap needed: {Math.round(preview.efficiency * 100)}% efficient
 *         </p>
 *       )}
 *       {preview.suggestion && <p className="tip">{preview.suggestion}</p>}
 *       <button onClick={() => play(dtag, price)}>
 *         Pay {price} credit{price !== 1 ? 's' : ''}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // Show wallet health status
 * function WalletStatus() {
 *   const { getWalletHealth, balance } = usePaymentPreview();
 *   const health = getWalletHealth();
 *   
 *   if (!health) return null;
 *   
 *   return (
 *     <div>
 *       <h3>Wallet Health: {health.score}/100</h3>
 *       <p>Balance: {balance} credits</p>
 *       <p>Denominations: {health.denominations.join(', ')}</p>
 *       {health.recommendations.map((rec, i) => (
 *         <p key={i} className="recommendation">{rec}</p>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePaymentPreview(options: UsePaymentPreviewOptions = {}): UsePaymentPreviewResult {
  const { commonAmounts = [1, 2, 3, 5, 10, 20, 50, 100] } = options;
  
  const { proofs, balance, isReady } = useWalletContext();

  /**
   * Preview a payment for a specific amount
   */
  const previewPayment = useCallback((amount: number): PaymentPreview | null => {
    if (!isReady || amount <= 0) {
      return null;
    }

    const analysis = analyzePayment(proofs, amount);
    
    // Build explanation
    let explanation: string;
    let suggestion: string | undefined;
    
    if (!analysis.canAfford) {
      const shortfall = amount - analysis.totalBalance;
      explanation = `Cannot afford: need ${amount}, have ${analysis.totalBalance} credits`;
      suggestion = `Add ${shortfall} more credit${shortfall !== 1 ? 's' : ''} to your wallet.`;
    } else if (analysis.canPayExact) {
      explanation = `Will pay exactly ${amount} credit${amount !== 1 ? 's' : ''} with ${analysis.selectedProofs.length} proof${analysis.selectedProofs.length !== 1 ? 's' : ''}`;
    } else {
      const efficiencyPct = Math.round(analysis.efficiency * 100);
      explanation = `Will use ${analysis.selectedTotal} credits to pay ${amount} (${analysis.changeAmount} change)`;
      
      if (efficiencyPct < 50) {
        suggestion = `Payment is only ${efficiencyPct}% efficient. Consider consolidating your wallet proofs.`;
      } else if (efficiencyPct < 80) {
        suggestion = `A mint swap will be needed to make change.`;
      }
    }

    return {
      amount,
      walletBalance: analysis.totalBalance,
      canAfford: analysis.canAfford,
      canPayExact: analysis.canPayExact,
      selectedProofCount: analysis.selectedProofs.length,
      selectedTotal: analysis.selectedTotal,
      changeAmount: analysis.changeAmount,
      requiresSwap: analysis.requiresSwap,
      efficiency: analysis.efficiency,
      explanation,
      suggestion,
      analysis,
    };
  }, [proofs, isReady]);

  /**
   * Get current wallet denomination health
   */
  const getWalletHealth = useCallback((): WalletHealthSummary | null => {
    if (!isReady) {
      return null;
    }

    const health = analyzeDenominationHealth(proofs, { commonAmounts });
    
    return {
      score: health.score,
      isHealthy: health.score >= 70,
      denominations: health.denominations,
      denominationCounts: health.denominationCounts,
      exactPayableAmounts: health.exactPayableAmounts,
      recommendations: health.recommendations,
      health,
    };
  }, [proofs, isReady, commonAmounts]);

  /**
   * Check if a specific amount can be paid exactly (no swap)
   */
  const canPayExact = useCallback((amount: number): boolean => {
    if (!isReady || amount <= 0) {
      return false;
    }
    const analysis = analyzePayment(proofs, amount);
    return analysis.canPayExact;
  }, [proofs, isReady]);

  /**
   * Maximum payable amount (wallet balance)
   */
  const maxPayableAmount = useMemo(() => {
    return isReady ? balance : 0;
  }, [isReady, balance]);

  return {
    previewPayment,
    getWalletHealth,
    canPayExact,
    maxPayableAmount,
    balance,
    isReady,
  };
}

/**
 * Format efficiency as a user-friendly percentage string
 */
export function formatEfficiency(efficiency: number): string {
  const pct = Math.round(efficiency * 100);
  if (pct >= 100) return 'Perfect';
  if (pct >= 90) return `${pct}% (excellent)`;
  if (pct >= 70) return `${pct}% (good)`;
  if (pct >= 50) return `${pct}% (fair)`;
  return `${pct}% (inefficient)`;
}

/**
 * Get an emoji indicator for payment efficiency
 */
export function getEfficiencyEmoji(efficiency: number): string {
  if (efficiency >= 1) return '✨';
  if (efficiency >= 0.9) return '👍';
  if (efficiency >= 0.7) return '👌';
  if (efficiency >= 0.5) return '🔄';
  return '⚠️';
}
