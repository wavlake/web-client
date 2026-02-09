'use client';

/**
 * useTokenPreview Hook
 * 
 * Preview token creation before committing to the operation.
 * Shows users what proofs will be used, expected change, and any issues.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Wallet, TokenPreview, Proof } from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

/**
 * Simplified preview result for UI display
 */
export interface TokenPreviewState {
  /** Whether a token can be created for this amount */
  canCreate: boolean;
  /** Requested payment amount */
  amount: number;
  /** Current wallet balance */
  balance: number;
  /** Number of proofs that would be used */
  proofCount: number;
  /** Total value of proofs to be used */
  proofTotal: number;
  /** Change amount (returned to wallet after swap) */
  change: number;
  /** Whether a mint swap is required (proofTotal > amount) */
  needsSwap: boolean;
  /** Human-readable issue if payment can't be made */
  issue: string | null;
  /** Actionable suggestion for resolving issues */
  suggestion: string | null;
  /** Detailed proof breakdown (if includeDetails is true) */
  proofDetails: ProofDetail[] | null;
  /** Full preview object from wallet */
  raw: TokenPreview | null;
}

/**
 * Detailed information about a proof to be used
 */
export interface ProofDetail {
  /** Proof amount */
  amount: number;
  /** Whether this is exact match for payment */
  isExact: boolean;
}

/**
 * Hook options
 */
export interface UseTokenPreviewOptions {
  /** Debounce delay in ms for amount changes (default: 150) */
  debounceMs?: number;
  /** Include detailed proof breakdown (default: false) */
  includeDetails?: boolean;
  /** Minimum amount to trigger preview (default: 0) */
  minAmount?: number;
}

/**
 * Hook return value
 */
export interface UseTokenPreviewResult extends TokenPreviewState {
  /** Update the preview amount */
  setAmount: (amount: number) => void;
  /** Refresh the preview (e.g., after balance change) */
  refresh: () => void;
  /** Whether a preview calculation is pending */
  isPending: boolean;
}

// ============================================================================
// Helper
// ============================================================================

/**
 * Create empty preview state
 */
function createEmptyState(amount: number = 0): TokenPreviewState {
  return {
    canCreate: false,
    amount,
    balance: 0,
    proofCount: 0,
    proofTotal: 0,
    change: 0,
    needsSwap: false,
    issue: null,
    suggestion: null,
    proofDetails: null,
    raw: null,
  };
}

/**
 * Convert wallet preview to hook state
 */
function previewToState(preview: TokenPreview, includeDetails: boolean): TokenPreviewState {
  const proofDetails = includeDetails && preview.selectedProofs.length > 0
    ? preview.selectedProofs.map(p => ({
        amount: p.amount,
        isExact: p.amount === preview.amount,
      }))
    : null;

  return {
    canCreate: preview.canCreate,
    amount: preview.amount,
    balance: preview.availableBalance,
    proofCount: preview.selectedProofs.length,
    proofTotal: preview.selectedTotal,
    change: preview.change,
    needsSwap: preview.needsSwap,
    issue: preview.issue ?? null,
    suggestion: preview.suggestion ?? null,
    proofDetails,
    raw: preview,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Preview token creation before committing.
 * 
 * Shows users:
 * - Whether they can afford the payment
 * - How many proofs will be used
 * - Expected change amount
 * - Whether a mint swap is needed
 * - Any issues preventing payment
 * 
 * @example
 * ```tsx
 * function PaymentPreview({ price, wallet }: { price: number; wallet: Wallet }) {
 *   const preview = useTokenPreview(wallet, price);
 *   
 *   if (!preview.canCreate) {
 *     return (
 *       <div className="error">
 *         <p>{preview.issue}</p>
 *         {preview.suggestion && <p className="hint">{preview.suggestion}</p>}
 *       </div>
 *     );
 *   }
 *   
 *   return (
 *     <div className="preview">
 *       <p>Pay {preview.amount} credits</p>
 *       {preview.needsSwap && (
 *         <p className="info">
 *           Using {preview.proofCount} proofs ({preview.proofTotal} total)
 *           → {preview.change} credits change
 *         </p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // With dynamic amount input
 * function DonationInput({ wallet }: { wallet: Wallet }) {
 *   const { 
 *     setAmount, 
 *     canCreate, 
 *     issue,
 *     isPending 
 *   } = useTokenPreview(wallet, 0, { debounceMs: 300 });
 *   
 *   return (
 *     <div>
 *       <input 
 *         type="number" 
 *         onChange={(e) => setAmount(Number(e.target.value))}
 *         placeholder="Enter amount"
 *       />
 *       {isPending && <span>Calculating...</span>}
 *       {!isPending && !canCreate && issue && (
 *         <span className="error">{issue}</span>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // With proof details for advanced UI
 * function DetailedPreview({ wallet, price }: { wallet: Wallet; price: number }) {
 *   const preview = useTokenPreview(wallet, price, { includeDetails: true });
 *   
 *   return (
 *     <div>
 *       <p>Payment: {price} credits</p>
 *       {preview.proofDetails && (
 *         <ul>
 *           {preview.proofDetails.map((p, i) => (
 *             <li key={i}>
 *               {p.amount} credit proof {p.isExact && '(exact match)'}
 *             </li>
 *           ))}
 *         </ul>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTokenPreview(
  wallet: Wallet,
  initialAmount: number = 0,
  options: UseTokenPreviewOptions = {}
): UseTokenPreviewResult {
  const {
    debounceMs = 150,
    includeDetails = false,
    minAmount = 0,
  } = options;

  // State
  const [amount, setAmountState] = useState(initialAmount);
  const [state, setState] = useState<TokenPreviewState>(() => createEmptyState(initialAmount));
  const [isPending, setIsPending] = useState(false);

  // Refs
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAmountRef = useRef(initialAmount);

  // Calculate preview
  const calculatePreview = useCallback((targetAmount: number) => {
    // Skip if amount below minimum
    if (targetAmount < minAmount) {
      setState(createEmptyState(targetAmount));
      return;
    }

    // Skip if wallet not loaded
    if (!walletRef.current.isLoaded) {
      setState({
        ...createEmptyState(targetAmount),
        issue: 'Wallet not loaded',
        suggestion: 'Wait for wallet to initialize',
      });
      return;
    }

    try {
      const preview = walletRef.current.previewToken(targetAmount);
      setState(previewToState(preview, includeDetails));
    } catch (err) {
      setState({
        ...createEmptyState(targetAmount),
        balance: walletRef.current.balance,
        issue: err instanceof Error ? err.message : 'Preview failed',
        suggestion: 'Try a different amount',
      });
    }
  }, [includeDetails, minAmount]);

  // Debounced amount setter
  const setAmount = useCallback((newAmount: number) => {
    setAmountState(newAmount);
    lastAmountRef.current = newAmount;
    
    // Clear pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Mark as pending during debounce
    setIsPending(true);

    // Debounce the calculation
    debounceRef.current = setTimeout(() => {
      calculatePreview(newAmount);
      setIsPending(false);
    }, debounceMs);
  }, [debounceMs, calculatePreview]);

  // Refresh without debounce
  const refresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setIsPending(false);
    calculatePreview(lastAmountRef.current);
  }, [calculatePreview]);

  // Initial calculation and sync with initial amount changes
  useEffect(() => {
    if (initialAmount !== lastAmountRef.current) {
      lastAmountRef.current = initialAmount;
      setAmountState(initialAmount);
      calculatePreview(initialAmount);
    }
  }, [initialAmount, calculatePreview]);

  // Subscribe to wallet balance changes
  useEffect(() => {
    const currentWallet = wallet;
    
    const handleBalanceChange = () => {
      // Recalculate preview when balance changes
      calculatePreview(lastAmountRef.current);
    };

    currentWallet.on('balance-change', handleBalanceChange);

    return () => {
      currentWallet.off('balance-change', handleBalanceChange);
    };
  }, [wallet, calculatePreview]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Calculate on mount
  useEffect(() => {
    calculatePreview(initialAmount);
  }, []); // Run once on mount

  return {
    ...state,
    setAmount,
    refresh,
    isPending,
  };
}

/**
 * Simple hook for one-time preview (no state management).
 * 
 * @example
 * ```tsx
 * function PayButton({ wallet, price }: { wallet: Wallet; price: number }) {
 *   const preview = useSimplePreview(wallet, price);
 *   
 *   return (
 *     <button disabled={!preview.canCreate}>
 *       {preview.canCreate ? `Pay ${price}` : preview.issue}
 *     </button>
 *   );
 * }
 * ```
 */
export function useSimplePreview(
  wallet: Wallet,
  amount: number
): TokenPreviewState {
  return useMemo(() => {
    if (!wallet.isLoaded || amount <= 0) {
      return createEmptyState(amount);
    }
    
    try {
      const preview = wallet.previewToken(amount);
      return previewToState(preview, false);
    } catch {
      return {
        ...createEmptyState(amount),
        balance: wallet.balance,
        issue: 'Preview failed',
        suggestion: null,
      };
    }
  }, [wallet, wallet.balance, amount]);
}
