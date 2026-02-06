'use client';

/**
 * useWalletHealth Hook
 * 
 * Monitor wallet and mint connectivity health with automatic refresh.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  checkWalletHealth,
  quickHealthCheck,
  type WalletHealth,
  type HealthCheckOptions,
} from '@wavlake/wallet';
import { useWalletContext } from '../providers/WalletProvider.js';

// ============================================================================
// Types
// ============================================================================

export interface WalletHealthState {
  /** Full health report (null if not yet checked) */
  health: WalletHealth | null;
  /** Whether a health check is in progress */
  isChecking: boolean;
  /** Quick health indicator (0-100) */
  score: number | null;
  /** Whether the wallet is considered healthy (score >= 70) */
  isHealthy: boolean | null;
  /** Whether the mint is reachable */
  isMintReachable: boolean | null;
  /** Number of spent proofs detected */
  spentProofCount: number;
  /** Most critical issue (if any) */
  topIssue: string | null;
  /** Last successful check timestamp */
  lastCheckedAt: Date | null;
  /** Error from last check attempt */
  error: Error | null;
  /** Manually trigger a health check */
  refresh: () => Promise<void>;
  /** Start automatic periodic checks */
  startAutoRefresh: () => void;
  /** Stop automatic periodic checks */
  stopAutoRefresh: () => void;
  /** Whether auto-refresh is currently active */
  isAutoRefreshActive: boolean;
}

export interface UseWalletHealthOptions {
  /** Mint URL (uses wallet's mintUrl if not provided) */
  mintUrl?: string;
  /** Auto-refresh interval in ms (default: 60000 = 1 minute) */
  refreshIntervalMs?: number;
  /** Start auto-refresh on mount (default: false) */
  autoRefreshOnMount?: boolean;
  /** Include individual proof details (default: false) */
  includeDetails?: boolean;
  /** Timeout for mint connection in ms (default: 5000) */
  timeoutMs?: number;
  /** Skip proof validation for faster connectivity-only check (default: false) */
  skipProofCheck?: boolean;
  /** Check on initial mount (default: true) */
  checkOnMount?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Monitor wallet health with automatic or manual refresh.
 * 
 * Checks:
 * - Mint connectivity and latency
 * - Proof validity (spent vs unspent)
 * - Keyset compatibility
 * 
 * @example
 * ```tsx
 * // Simple usage - mintUrl from context (no config needed)
 * function HealthIndicator() {
 *   const { 
 *     isHealthy, 
 *     isMintReachable, 
 *     score,
 *     topIssue,
 *     isChecking,
 *     refresh 
 *   } = useWalletHealth({ 
 *     autoRefreshOnMount: true,
 *     refreshIntervalMs: 30000 
 *   });
 * 
 *   return (
 *     <div className="health-status">
 *       <span className={`status-dot ${isHealthy ? 'healthy' : 'unhealthy'}`} />
 *       <span>Health: {score ?? '...'}/100</span>
 *       {topIssue && <span className="issue">{topIssue}</span>}
 *       <button onClick={refresh} disabled={isChecking}>
 *         {isChecking ? 'Checking...' : 'Refresh'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // Quick connectivity check only (no proof validation)
 * function MintStatus() {
 *   const { isMintReachable, isChecking, health } = useWalletHealth({
 *     skipProofCheck: true,
 *     refreshIntervalMs: 10000,
 *     autoRefreshOnMount: true,
 *   });
 * 
 *   if (isChecking) return <span>Checking...</span>;
 *   
 *   return (
 *     <span>
 *       Mint: {isMintReachable ? '✅' : '❌'}
 *       {health?.mint.latencyMs && ` (${health.mint.latencyMs}ms)`}
 *     </span>
 *   );
 * }
 * ```
 */
export function useWalletHealth(options: UseWalletHealthOptions = {}): WalletHealthState {
  const {
    mintUrl: customMintUrl,
    refreshIntervalMs = 60000,
    autoRefreshOnMount = false,
    includeDetails = false,
    timeoutMs = 5000,
    skipProofCheck = false,
    checkOnMount = true,
  } = options;

  // Get wallet context - now includes mintUrl
  const { proofs, isReady, mintUrl: contextMintUrl } = useWalletContext();
  
  // Use custom mintUrl if provided, otherwise fall back to wallet context
  const mintUrl = customMintUrl ?? contextMintUrl;

  // State
  const [health, setHealth] = useState<WalletHealth | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(false);

  // Refs for interval management
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Perform health check
  const performCheck = useCallback(async (): Promise<void> => {
    if (!mintUrl) {
      setError(new Error('Mint URL is required for health check'));
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const healthCheckOptions: HealthCheckOptions = {
        includeDetails,
        timeoutMs,
        skipProofCheck,
      };

      const result = await checkWalletHealth(mintUrl, proofs, healthCheckOptions);
      
      if (mountedRef.current) {
        setHealth(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Health check failed'));
      }
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, [mintUrl, proofs, includeDetails, timeoutMs, skipProofCheck]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    await performCheck();
  }, [performCheck]);

  // Start auto-refresh
  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      performCheck();
    }, refreshIntervalMs);
    
    setIsAutoRefreshActive(true);
  }, [performCheck, refreshIntervalMs]);

  // Stop auto-refresh
  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsAutoRefreshActive(false);
  }, []);

  // Initial check on mount (if enabled and wallet is ready)
  useEffect(() => {
    if (checkOnMount && isReady && mintUrl) {
      performCheck();
    }
  }, [checkOnMount, isReady, mintUrl]); // Note: intentionally not including performCheck to avoid re-running

  // Start auto-refresh on mount (if enabled)
  useEffect(() => {
    if (autoRefreshOnMount && isReady && mintUrl) {
      startAutoRefresh();
      return () => stopAutoRefresh();
    }
  }, [autoRefreshOnMount, isReady, mintUrl]); // Note: intentionally not including start/stopAutoRefresh

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Derived state
  const score = health?.score ?? null;
  const isHealthy = score !== null ? score >= 70 : null;
  const isMintReachable = health?.mint.reachable ?? null;
  const spentProofCount = health?.proofs.spent ?? 0;
  const topIssue = health?.issues[0] ?? null;
  const lastCheckedAt = health?.checkedAt ?? null;

  return {
    health,
    isChecking,
    score,
    isHealthy,
    isMintReachable,
    spentProofCount,
    topIssue,
    lastCheckedAt,
    error,
    refresh,
    startAutoRefresh,
    stopAutoRefresh,
    isAutoRefreshActive,
  };
}

/**
 * Simplified hook for just checking if the wallet is healthy.
 * Uses quickHealthCheck for faster results.
 * 
 * @example
 * ```tsx
 * function QuickStatus() {
 *   const { isHealthy, score, issue } = useQuickHealth('https://mint.example.com');
 *   
 *   return (
 *     <span className={isHealthy ? 'ok' : 'warn'}>
 *       {isHealthy ? '✓' : '!'} {score}/100
 *       {issue && <small> - {issue}</small>}
 *     </span>
 *   );
 * }
 * ```
 */
export function useQuickHealth(mintUrl: string): {
  score: number | null;
  isHealthy: boolean | null;
  issue: string | null;
  isChecking: boolean;
  refresh: () => Promise<void>;
} {
  const { proofs, isReady } = useWalletContext();
  const [result, setResult] = useState<{
    score: number;
    healthy: boolean;
    issue?: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const refresh = useCallback(async () => {
    if (!mintUrl) return;
    
    setIsChecking(true);
    try {
      const health = await quickHealthCheck(mintUrl, proofs);
      setResult(health);
    } catch {
      setResult({ score: 0, healthy: false, issue: 'Health check failed' });
    } finally {
      setIsChecking(false);
    }
  }, [mintUrl, proofs]);

  // Check on mount when ready
  useEffect(() => {
    if (isReady && mintUrl) {
      refresh();
    }
  }, [isReady, mintUrl]); // Note: intentionally not including refresh

  return {
    score: result?.score ?? null,
    isHealthy: result?.healthy ?? null,
    issue: result?.issue ?? null,
    isChecking,
    refresh,
  };
}
