'use client';

/**
 * useTokenPreview Hook
 * 
 * Reactive preview of token creation, updating automatically when
 * wallet state changes.
 */

import { useMemo } from 'react';
import { useWalletContext } from '../providers/WalletProvider.js';
import type { TokenPreview } from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

export interface UseTokenPreviewResult extends TokenPreview {
  /** Whether the wallet is ready */
  isReady: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Get a reactive preview of what would happen when creating a token.
 * 
 * This hook automatically updates when the wallet balance or proofs change,
 * making it ideal for showing payment UI hints in real-time.
 * 
 * @param amount - Amount in credits to preview (can be 0 or undefined for no preview)
 * @returns Preview state that updates reactively
 * 
 * @example
 * ```tsx
 * function PaymentButton({ price }: { price: number }) {
 *   const preview = useTokenPreview(price);
 *   
 *   if (!preview.isReady) return <div>Loading wallet...</div>;
 *   
 *   if (!preview.canCreate) {
 *     return (
 *       <div className="payment-error">
 *         <p>{preview.issue}</p>
 *         {preview.suggestion && <p className="hint">{preview.suggestion}</p>}
 *       </div>
 *     );
 *   }
 *   
 *   return (
 *     <button>
 *       Pay {price} credits
 *       {preview.needsSwap && (
 *         <span className="swap-hint"> (includes mint swap)</span>
 *       )}
 *     </button>
 *   );
 * }
 * ```
 * 
 * @example Show change amount before payment
 * ```tsx
 * function PaymentPreview({ price }: { price: number }) {
 *   const preview = useTokenPreview(price);
 *   
 *   if (!preview.canCreate) return null;
 *   
 *   return (
 *     <div className="preview">
 *       <p>Paying: {price} credits</p>
 *       <p>Using: {preview.selectedProofs.length} proofs ({preview.selectedTotal} total)</p>
 *       {preview.change > 0 && <p>Change: {preview.change} credits</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTokenPreview(amount?: number): UseTokenPreviewResult {
  const { isReady, previewToken, proofs } = useWalletContext();

  // Recompute preview when amount or proofs change
  const preview = useMemo((): TokenPreview => {
    // Return empty preview if wallet not ready or no amount
    if (!isReady || amount === undefined || amount <= 0) {
      return {
        canCreate: false,
        amount: amount ?? 0,
        availableBalance: proofs.reduce((sum, p) => sum + p.amount, 0),
        availableDenominations: [],
        denominationCounts: {},
        selectedProofs: [],
        selectedTotal: 0,
        change: 0,
        needsSwap: false,
        issue: amount === undefined ? 'No amount specified' : 'Invalid amount',
      };
    }

    return previewToken(amount);
  }, [isReady, amount, proofs, previewToken]);

  return {
    ...preview,
    isReady,
  };
}

/**
 * Get preview for multiple amounts at once.
 * 
 * Useful for track lists where you want to show payment feasibility
 * for multiple items.
 * 
 * @param amounts - Array of amounts to preview
 * @returns Map of amount to preview result
 * 
 * @example
 * ```tsx
 * function TrackList({ tracks }: { tracks: Track[] }) {
 *   const prices = tracks.map(t => t.price);
 *   const previews = useTokenPreviews(prices);
 *   
 *   return (
 *     <ul>
 *       {tracks.map((track, i) => (
 *         <li key={track.id}>
 *           {track.title} - {track.price} credits
 *           {!previews[track.price]?.canCreate && (
 *             <span className="unavailable"> (insufficient balance)</span>
 *           )}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useTokenPreviews(amounts: number[]): Record<number, UseTokenPreviewResult> {
  const { isReady, previewToken, proofs } = useWalletContext();

  return useMemo(() => {
    const result: Record<number, UseTokenPreviewResult> = {};

    // Deduplicate amounts
    const uniqueAmounts = [...new Set(amounts)];

    for (const amount of uniqueAmounts) {
      if (!isReady || amount <= 0) {
        result[amount] = {
          canCreate: false,
          amount,
          availableBalance: proofs.reduce((sum, p) => sum + p.amount, 0),
          availableDenominations: [],
          denominationCounts: {},
          selectedProofs: [],
          selectedTotal: 0,
          change: 0,
          needsSwap: false,
          issue: amount <= 0 ? 'Invalid amount' : 'Wallet not ready',
          isReady,
        };
      } else {
        result[amount] = {
          ...previewToken(amount),
          isReady,
        };
      }
    }

    return result;
  }, [isReady, amounts, proofs, previewToken]);
}
