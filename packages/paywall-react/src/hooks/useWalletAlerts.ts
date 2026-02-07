'use client';

/**
 * useWalletAlerts Hook
 * 
 * Proactive wallet monitoring with actionable alerts.
 * Watches wallet state and provides warnings/recommendations.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWalletContext } from '../providers/WalletProvider.js';
import type { DefragStats } from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert types
 */
export type AlertType = 
  | 'low_balance'
  | 'empty_wallet'
  | 'defrag_recommended'
  | 'defrag_urgent'
  | 'large_proofs_only'
  | 'insufficient_for_payment';

/**
 * Individual wallet alert
 */
export interface WalletAlert {
  /** Unique identifier for this alert */
  id: string;
  /** Type of alert */
  type: AlertType;
  /** Severity level */
  severity: AlertSeverity;
  /** Human-readable title */
  title: string;
  /** Detailed message */
  message: string;
  /** Suggested action */
  suggestion: string;
  /** Whether the alert can be dismissed */
  dismissible: boolean;
  /** Timestamp when alert was created */
  createdAt: Date;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Options for wallet alerts
 */
export interface UseWalletAlertsOptions {
  /** Balance threshold for low balance warning (default: 10) */
  lowBalanceThreshold?: number;
  /** Expected payment amount for payment warnings */
  expectedPaymentAmount?: number;
  /** Whether to auto-dismiss alerts when conditions improve */
  autoDismiss?: boolean;
  /** Interval in ms to check for alerts (default: 5000) */
  checkInterval?: number;
}

/**
 * Result of useWalletAlerts hook
 */
export interface UseWalletAlertsResult {
  /** Current active alerts */
  alerts: WalletAlert[];
  /** Whether there are any critical alerts */
  hasCritical: boolean;
  /** Whether there are any warnings */
  hasWarnings: boolean;
  /** Highest severity level among current alerts */
  highestSeverity: AlertSeverity | null;
  /** Dismiss a specific alert */
  dismissAlert: (alertId: string) => void;
  /** Dismiss all dismissible alerts */
  dismissAll: () => void;
  /** Force re-check alerts */
  refresh: () => void;
  /** Get alerts by type */
  getAlertsByType: (type: AlertType) => WalletAlert[];
  /** Check if a specific alert type is active */
  hasAlertType: (type: AlertType) => boolean;
}

// ============================================================================
// Alert Generators
// ============================================================================

function generateAlerts(
  balance: number,
  proofCount: number,
  defragStats: DefragStats | null,
  options: UseWalletAlertsOptions,
  dismissedIds: Set<string>
): WalletAlert[] {
  const alerts: WalletAlert[] = [];
  const {
    lowBalanceThreshold = 10,
    expectedPaymentAmount,
  } = options;

  // Empty wallet
  if (balance === 0) {
    const alert: WalletAlert = {
      id: 'empty_wallet',
      type: 'empty_wallet',
      severity: 'critical',
      title: 'Wallet Empty',
      message: 'Your wallet has no credits.',
      suggestion: 'Add credits to your wallet to play tracks.',
      dismissible: false,
      createdAt: new Date(),
      context: { balance: 0 },
    };
    if (!dismissedIds.has(alert.id)) {
      alerts.push(alert);
    }
  }
  // Low balance warning
  else if (balance < lowBalanceThreshold && balance > 0) {
    const alert: WalletAlert = {
      id: `low_balance_${lowBalanceThreshold}`,
      type: 'low_balance',
      severity: 'warning',
      title: 'Low Balance',
      message: `Only ${balance} credit${balance === 1 ? '' : 's'} remaining.`,
      suggestion: `Consider adding more credits. You can play approximately ${balance} more track${balance === 1 ? '' : 's'}.`,
      dismissible: true,
      createdAt: new Date(),
      context: { balance, threshold: lowBalanceThreshold },
    };
    if (!dismissedIds.has(alert.id)) {
      alerts.push(alert);
    }
  }

  // Insufficient for expected payment
  if (expectedPaymentAmount && balance < expectedPaymentAmount) {
    const shortfall = expectedPaymentAmount - balance;
    const alert: WalletAlert = {
      id: `insufficient_${expectedPaymentAmount}`,
      type: 'insufficient_for_payment',
      severity: 'warning',
      title: 'Insufficient Balance',
      message: `Need ${shortfall} more credit${shortfall === 1 ? '' : 's'} for this payment.`,
      suggestion: `Add at least ${shortfall} credits to continue.`,
      dismissible: true,
      createdAt: new Date(),
      context: { 
        balance, 
        required: expectedPaymentAmount, 
        shortfall,
      },
    };
    if (!dismissedIds.has(alert.id)) {
      alerts.push(alert);
    }
  }

  // Defragmentation alerts
  if (defragStats && proofCount > 0) {
    if (defragStats.recommendation === 'urgent') {
      const alert: WalletAlert = {
        id: 'defrag_urgent',
        type: 'defrag_urgent',
        severity: 'warning',
        title: 'Wallet Needs Optimization',
        message: `Your wallet has ${proofCount} fragmented proofs. Payments may be slower.`,
        suggestion: 'Run wallet optimization to consolidate proofs and improve performance.',
        dismissible: true,
        createdAt: new Date(),
        context: {
          proofCount,
          fragmentation: defragStats.fragmentation,
          smallProofCount: defragStats.smallProofCount,
        },
      };
      if (!dismissedIds.has(alert.id)) {
        alerts.push(alert);
      }
    } else if (defragStats.recommendation === 'recommended') {
      const alert: WalletAlert = {
        id: 'defrag_recommended',
        type: 'defrag_recommended',
        severity: 'info',
        title: 'Optimization Available',
        message: `Your wallet could be optimized (${proofCount} proofs can be consolidated).`,
        suggestion: 'Consider running wallet optimization for better performance.',
        dismissible: true,
        createdAt: new Date(),
        context: {
          proofCount,
          fragmentation: defragStats.fragmentation,
          estimatedNewCount: defragStats.estimatedNewProofCount,
        },
      };
      if (!dismissedIds.has(alert.id)) {
        alerts.push(alert);
      }
    }
  }

  // Large proofs only warning
  if (proofCount > 0 && proofCount <= 3) {
    const avgSize = proofCount > 0 && defragStats?.balance 
      ? defragStats.balance / proofCount 
      : 0;
    
    // If average proof size is very large, warn about potential swap overhead
    if (avgSize > 50 && expectedPaymentAmount && expectedPaymentAmount < avgSize * 0.5) {
      const alert: WalletAlert = {
        id: 'large_proofs_only',
        type: 'large_proofs_only',
        severity: 'info',
        title: 'Large Denomination Proofs',
        message: 'Your wallet contains only large denomination proofs.',
        suggestion: 'Small payments may require a swap operation. This is handled automatically but may add slight latency.',
        dismissible: true,
        createdAt: new Date(),
        context: {
          proofCount,
          averageSize: avgSize,
          expectedPayment: expectedPaymentAmount,
        },
      };
      if (!dismissedIds.has(alert.id)) {
        alerts.push(alert);
      }
    }
  }

  return alerts;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Monitor wallet state and get proactive alerts.
 * 
 * Watches balance, proof fragmentation, and other wallet health
 * indicators to provide actionable warnings and recommendations.
 * 
 * @example Basic usage
 * ```tsx
 * function WalletStatus() {
 *   const { alerts, hasCritical, dismissAlert } = useWalletAlerts();
 *   
 *   return (
 *     <div>
 *       {alerts.map(alert => (
 *         <div key={alert.id} className={`alert-${alert.severity}`}>
 *           <strong>{alert.title}</strong>
 *           <p>{alert.message}</p>
 *           <p><em>{alert.suggestion}</em></p>
 *           {alert.dismissible && (
 *             <button onClick={() => dismissAlert(alert.id)}>Dismiss</button>
 *           )}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example With custom thresholds
 * ```tsx
 * function PremiumWalletStatus() {
 *   const { alerts, hasWarnings } = useWalletAlerts({
 *     lowBalanceThreshold: 50,  // Warn at 50 credits
 *     expectedPaymentAmount: 5, // Track costs 5 credits
 *   });
 *   
 *   if (!hasWarnings) return null;
 *   
 *   return (
 *     <div className="warning-banner">
 *       {alerts.length} alert{alerts.length !== 1 ? 's' : ''} need attention
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example Payment flow integration
 * ```tsx
 * function PlayButton({ price }: { price: number }) {
 *   const { hasAlertType, getAlertsByType } = useWalletAlerts({
 *     expectedPaymentAmount: price,
 *   });
 *   
 *   if (hasAlertType('insufficient_for_payment')) {
 *     const [alert] = getAlertsByType('insufficient_for_payment');
 *     return (
 *       <div>
 *         <button disabled>Insufficient Balance</button>
 *         <p>{alert.suggestion}</p>
 *       </div>
 *     );
 *   }
 *   
 *   return <button onClick={handlePlay}>Play</button>;
 * }
 * ```
 */
export function useWalletAlerts(
  options: UseWalletAlertsOptions = {}
): UseWalletAlertsResult {
  const { autoDismiss = true, checkInterval = 5000 } = options;
  
  const wallet = useWalletContext();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [lastCheck, setLastCheck] = useState<number>(Date.now());

  // Get defrag stats (memoized to avoid recalculation)
  const defragStats = useMemo(() => {
    if (!wallet.isReady || wallet.proofCount === 0) {
      return null;
    }
    return wallet.getDefragStats();
  }, [wallet.isReady, wallet.proofCount, wallet.balance, lastCheck]);

  // Generate alerts based on current state
  const alerts = useMemo(() => {
    if (!wallet.isReady) {
      return [];
    }
    
    return generateAlerts(
      wallet.balance,
      wallet.proofCount,
      defragStats,
      options,
      dismissedIds
    );
  }, [
    wallet.isReady,
    wallet.balance,
    wallet.proofCount,
    defragStats,
    options.lowBalanceThreshold,
    options.expectedPaymentAmount,
    dismissedIds,
    lastCheck,
  ]);

  // Auto-dismiss alerts when conditions improve
  useEffect(() => {
    if (!autoDismiss) return;
    
    // If balance is now above threshold, auto-dismiss low balance alert
    const threshold = options.lowBalanceThreshold ?? 10;
    if (wallet.balance >= threshold) {
      setDismissedIds(prev => {
        const next = new Set(prev);
        next.delete(`low_balance_${threshold}`);
        return next;
      });
    }
    
    // If balance is no longer empty, auto-dismiss empty wallet alert
    if (wallet.balance > 0) {
      setDismissedIds(prev => {
        const next = new Set(prev);
        next.delete('empty_wallet');
        return next;
      });
    }
    
    // If sufficient for payment, auto-dismiss insufficient alert
    if (options.expectedPaymentAmount && wallet.balance >= options.expectedPaymentAmount) {
      setDismissedIds(prev => {
        const next = new Set(prev);
        next.delete(`insufficient_${options.expectedPaymentAmount}`);
        return next;
      });
    }
  }, [wallet.balance, autoDismiss, options.lowBalanceThreshold, options.expectedPaymentAmount]);

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setLastCheck(Date.now());
    }, checkInterval);
    
    return () => clearInterval(interval);
  }, [checkInterval]);

  // Computed properties
  const hasCritical = useMemo(
    () => alerts.some(a => a.severity === 'critical'),
    [alerts]
  );

  const hasWarnings = useMemo(
    () => alerts.some(a => a.severity === 'warning' || a.severity === 'critical'),
    [alerts]
  );

  const highestSeverity = useMemo((): AlertSeverity | null => {
    if (alerts.length === 0) return null;
    if (alerts.some(a => a.severity === 'critical')) return 'critical';
    if (alerts.some(a => a.severity === 'warning')) return 'warning';
    return 'info';
  }, [alerts]);

  // Actions
  const dismissAlert = useCallback((alertId: string) => {
    setDismissedIds(prev => new Set([...prev, alertId]));
  }, []);

  const dismissAll = useCallback(() => {
    const dismissibleIds = alerts
      .filter(a => a.dismissible)
      .map(a => a.id);
    setDismissedIds(prev => new Set([...prev, ...dismissibleIds]));
  }, [alerts]);

  const refresh = useCallback(() => {
    setLastCheck(Date.now());
  }, []);

  const getAlertsByType = useCallback(
    (type: AlertType) => alerts.filter(a => a.type === type),
    [alerts]
  );

  const hasAlertType = useCallback(
    (type: AlertType) => alerts.some(a => a.type === type),
    [alerts]
  );

  return {
    alerts,
    hasCritical,
    hasWarnings,
    highestSeverity,
    dismissAlert,
    dismissAll,
    refresh,
    getAlertsByType,
    hasAlertType,
  };
}
