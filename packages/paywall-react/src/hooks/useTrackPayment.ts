'use client';

/**
 * useTrackPayment Hook
 * 
 * Complete payment flow for track access.
 * Combines wallet token creation with paywall content request.
 */

import { useState, useCallback } from 'react';
import { usePaywallContext } from '../providers/PaywallProvider.js';
import { useWalletContext } from '../providers/WalletProvider.js';
import { PaywallError } from '@wavlake/paywall-client';
import type { ContentResult } from '@wavlake/paywall-client';

export type PaymentStatus = 
  | 'idle'
  | 'checking-price'
  | 'creating-token'
  | 'requesting-content'
  | 'success'
  | 'error';

export interface TrackPaymentState {
  /** Current payment status */
  status: PaymentStatus;
  /** Content result if successful */
  result: ContentResult | null;
  /** Error if failed */
  error: Error | null;
  /** User-friendly error message */
  errorMessage: string | null;
  /** Whether payment is in progress */
  isProcessing: boolean;
  /** Pay for and access a track */
  pay: (dtag: string, amount?: number) => Promise<ContentResult | null>;
  /** Replay existing grant (no payment) */
  replay: (dtag: string, grantId: string) => Promise<ContentResult | null>;
  /** Reset state */
  reset: () => void;
}

/**
 * Complete payment flow for track access.
 * 
 * Handles:
 * - Price checking
 * - Token creation
 * - Content request
 * - Change handling
 * - Error recovery
 * 
 * @example
 * ```tsx
 * function PlayButton({ dtag, price }: { dtag: string; price: number }) {
 *   const { pay, status, errorMessage, result } = useTrackPayment();
 *   const { balance } = useWallet();
 *   
 *   const handleClick = async () => {
 *     const content = await pay(dtag, price);
 *     if (content) {
 *       playAudio(content.url);
 *     }
 *   };
 *   
 *   if (status === 'success' && result) {
 *     return <span>Playing!</span>;
 *   }
 *   
 *   if (status === 'error') {
 *     return <span className="error">{errorMessage}</span>;
 *   }
 *   
 *   return (
 *     <button 
 *       onClick={handleClick}
 *       disabled={status !== 'idle' || balance < price}
 *     >
 *       {status === 'idle' ? `Pay ${price}` : 'Processing...'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useTrackPayment(): TrackPaymentState {
  const { requestContent, replayGrant, getContentPrice } = usePaywallContext();
  const { createToken, receiveToken } = useWalletContext();

  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [result, setResult] = useState<ContentResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  const pay = useCallback(async (
    dtag: string,
    amount?: number
  ): Promise<ContentResult | null> => {
    try {
      setError(null);
      setResult(null);

      // Step 1: Check price if not provided
      let price = amount;
      if (price === undefined) {
        setStatus('checking-price');
        price = await getContentPrice(dtag);
      }

      // Free content - no payment needed
      if (price === 0) {
        setStatus('requesting-content');
        const content = await requestContent(dtag, '');
        setResult(content);
        setStatus('success');
        return content;
      }

      // Step 2: Create token
      setStatus('creating-token');
      const token = await createToken(price);

      // Step 3: Request content
      setStatus('requesting-content');
      const content = await requestContent(dtag, token);

      // Step 4: Handle change if present
      if (content.change) {
        try {
          await receiveToken(content.change);
        } catch (changeErr) {
          // Log but don't fail - change handling is best-effort
          console.warn('Failed to receive change:', changeErr);
        }
      }

      setResult(content);
      setStatus('success');
      return content;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Payment failed'));
      setStatus('error');
      return null;
    }
  }, [getContentPrice, requestContent, createToken, receiveToken]);

  const replay = useCallback(async (
    dtag: string,
    grantId: string
  ): Promise<ContentResult | null> => {
    try {
      setError(null);
      setResult(null);
      setStatus('requesting-content');

      const content = await replayGrant(dtag, grantId);
      setResult(content);
      setStatus('success');
      return content;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Replay failed'));
      setStatus('error');
      return null;
    }
  }, [replayGrant]);

  // Derive user-friendly error message
  let errorMessage: string | null = null;
  if (error) {
    if (PaywallError.isPaywallError(error)) {
      errorMessage = error.userMessage;
    } else {
      errorMessage = error.message;
    }
  }

  return {
    status,
    result,
    error,
    errorMessage,
    isProcessing: !['idle', 'success', 'error'].includes(status),
    pay,
    replay,
    reset,
  };
}
