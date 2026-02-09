'use client';

/**
 * useDefragmentation Hook
 * 
 * Monitor and manage wallet proof fragmentation.
 */

import { useState, useCallback, useMemo } from 'react';
import { useWalletContext } from '../providers/WalletProvider.js';
import type { DefragStats } from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

export interface DefragmentationResult {
  previousProofCount: number;
  newProofCount: number;
  previousBalance: number;
  newBalance: number;
  saved: number;
}

export interface UseDefragmentationResult {
  /** Current defragmentation statistics (null before calculation) */
  stats: DefragStats | null;
  /** Fragmentation score as a decimal (0-1) */
  fragmentation: number;
  /** Whether defragmentation is recommended */
  needsDefragmentation: boolean;
  /** Recommendation level: 'none' | 'low' | 'recommended' | 'urgent' */
  recommendation: 'none' | 'low' | 'recommended' | 'urgent';
  /** Whether a defragmentation operation is in progress */
  isDefragmenting: boolean;
  /** Last defragmentation result */
  lastResult: DefragmentationResult | null;
  /** Error from last defragmentation attempt */
  error: Error | null;
  /** Execute defragmentation */
  defragment: () => Promise<DefragmentationResult>;
  /** Clear the error state */
  clearError: () => void;
  /** Refresh stats calculation */
  refreshStats: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Monitor and manage wallet proof fragmentation.
 * 
 * Fragmentation occurs when a wallet accumulates many small proofs
 * from repeated change operations. This hook provides tools to
 * monitor fragmentation and consolidate proofs when needed.
 * 
 * @returns Defragmentation state and actions
 * 
 * @example Basic usage with auto-defrag prompt
 * ```tsx
 * function WalletMaintenance() {
 *   const { stats, needsDefragmentation, defragment, isDefragmenting } = useDefragmentation();
 *   
 *   if (!needsDefragmentation) return null;
 *   
 *   return (
 *     <div className="defrag-prompt">
 *       <p>Your wallet has {stats?.proofCount} proofs and is {(stats?.fragmentation ?? 0) * 100}% fragmented.</p>
 *       <p>Consolidating will reduce this to ~{stats?.estimatedNewProofCount} proofs.</p>
 *       <button onClick={defragment} disabled={isDefragmenting}>
 *         {isDefragmenting ? 'Consolidating...' : 'Consolidate Now'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example Show fragmentation status in wallet UI
 * ```tsx
 * function WalletStatus() {
 *   const { balance } = useWallet();
 *   const { stats, fragmentation, needsDefragmentation } = useDefragmentation();
 *   
 *   return (
 *     <div>
 *       <p>Balance: {balance} credits</p>
 *       <p>Proofs: {stats?.proofCount ?? 0}</p>
 *       <p>
 *         Fragmentation: {(fragmentation * 100).toFixed(0)}%
 *         {needsDefragmentation && <span className="warning"> ⚠️ Consider consolidating</span>}
 *       </p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useDefragmentation(): UseDefragmentationResult {
  const {
    getDefragStats,
    needsDefragmentation: checkNeedsDefrag,
    defragment: walletDefragment,
    proofs,
    isReady,
  } = useWalletContext();

  const [isDefragmenting, setIsDefragmenting] = useState(false);
  const [lastResult, setLastResult] = useState<DefragmentationResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Compute stats when proofs change or on refresh
  const stats = useMemo((): DefragStats | null => {
    if (!isReady || proofs.length === 0) {
      return null;
    }
    // Include refreshKey to allow manual refresh
    void refreshKey;
    return getDefragStats();
  }, [isReady, proofs, getDefragStats, refreshKey]);

  // Extract fragmentation value
  const fragmentation = stats?.fragmentation ?? 0;

  // Check if defragmentation is needed
  const needsDefragmentation = useMemo(() => {
    if (!isReady || proofs.length === 0) return false;
    return checkNeedsDefrag();
  }, [isReady, proofs, checkNeedsDefrag, refreshKey]);

  // Get recommendation level
  const recommendation = stats?.recommendation ?? 'none';

  const defragment = useCallback(async (): Promise<DefragmentationResult> => {
    setIsDefragmenting(true);
    setError(null);
    
    try {
      const result = await walletDefragment();
      setLastResult(result);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsDefragmenting(false);
    }
  }, [walletDefragment]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshStats = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return {
    stats,
    fragmentation,
    needsDefragmentation,
    recommendation,
    isDefragmenting,
    lastResult,
    error,
    defragment,
    clearError,
    refreshStats,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export interface UseNeedsDefragmentationResult {
  /** Whether defragmentation is needed */
  needsIt: boolean;
  /** Recommendation level */
  level: 'none' | 'low' | 'recommended' | 'urgent';
}

/**
 * Simple hook to check if defragmentation is needed.
 * 
 * @returns Object with needsIt boolean and level
 * 
 * @example
 * ```tsx
 * function DefragIndicator() {
 *   const { needsIt, level } = useNeedsDefragmentation();
 *   
 *   if (!needsIt) return null;
 *   
 *   return (
 *     <span className={`defrag-indicator ${level}`}>
 *       {level === 'urgent' ? '⚠️ Defrag recommended' : 'Consider defrag'}
 *     </span>
 *   );
 * }
 * ```
 */
export function useNeedsDefragmentation(): UseNeedsDefragmentationResult {
  const { getDefragStats, needsDefragmentation, proofs, isReady } = useWalletContext();

  return useMemo(() => {
    if (!isReady || proofs.length === 0) {
      return { needsIt: false, level: 'none' as const };
    }

    const stats = getDefragStats();
    const needsIt = needsDefragmentation();

    return {
      needsIt,
      level: stats.recommendation,
    };
  }, [isReady, proofs, getDefragStats, needsDefragmentation]);
}

/**
 * Get fragmentation percentage (0-100).
 * 
 * @returns Fragmentation as a percentage
 * 
 * @example
 * ```tsx
 * function FragmentationBadge() {
 *   const percentage = useFragmentationPercentage();
 *   
 *   return (
 *     <span className={percentage > 50 ? 'warning' : ''}>
 *       {percentage.toFixed(0)}% fragmented
 *     </span>
 *   );
 * }
 * ```
 */
export function useFragmentationPercentage(): number {
  const { getDefragStats, proofs, isReady } = useWalletContext();

  return useMemo(() => {
    if (!isReady || proofs.length === 0) {
      return 0;
    }

    const stats = getDefragStats();
    return Math.round(stats.fragmentation * 100);
  }, [isReady, proofs, getDefragStats]);
}
