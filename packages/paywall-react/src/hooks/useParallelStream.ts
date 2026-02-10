/**
 * useParallelStream Hook
 * 
 * React hook for parallel payment streaming.
 * Manages stream state, payment triggering, and error handling.
 * 
 * @example
 * ```tsx
 * const { play, streamState, triggerPayment, previewDuration } = useParallelStream();
 * 
 * // Start playback
 * const url = await play('track-dtag');
 * audioRef.current.src = url;
 * 
 * // Trigger payment near preview boundary (call from timeupdate)
 * if (currentTime > previewDuration - 3) {
 *   triggerPayment();
 * }
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { usePaywall } from './usePaywall';
import { useWallet } from './useWallet';
import type { PaymentResult } from '@wavlake/paywall-client';

// Local types (avoid import issues during build)
type StreamState = 'idle' | 'streaming' | 'paying' | 'paid' | 'error';

interface StreamHeaders {
  previewEndByte: number;
  priceCredits: number;
  mintUrl?: string;
  durationSeconds?: number;
}

interface SettlementReceipt {
  kind: 30444;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  id: string;
  sig: string;
}

interface PaymentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable?: boolean;
}

export interface UseParallelStreamOptions {
  paymentTriggerOffset?: number;
  paymentDebounceMs?: number;
  paymentTimeoutMs?: number;
  onStateChange?: (state: StreamState) => void;
  onPaymentComplete?: (receipt?: SettlementReceipt) => void;
  onError?: (error: PaymentError) => void;
}

export interface UseParallelStreamReturn {
  streamState: StreamState;
  depositId: string | null;
  streamHeaders: StreamHeaders | null;
  paymentConfirmed: boolean;
  receipt: SettlementReceipt | null;
  previewDuration: number;
  error: PaymentError | null;
  play: (dtag: string) => Promise<string>;
  triggerPayment: () => Promise<boolean>;
  stop: () => void;
  clearError: () => void;
}

// Default config
const DEFAULT_PAYMENT_DEBOUNCE_MS = 1000;
const DEFAULT_PAYMENT_TIMEOUT_MS = 15000;

/**
 * Hook for parallel payment streaming.
 * 
 * Provides:
 * - play(dtag) - Start streaming, returns URL for audio.src
 * - triggerPayment() - Send payment (call near preview boundary)
 * - streamState - Current state (idle/streaming/paying/paid/error)
 * - previewDuration - Seconds until preview ends
 */
export function useParallelStream(
  options: UseParallelStreamOptions = {}
): UseParallelStreamReturn {
  const paywall = usePaywall();
  const wallet = useWallet();

  const {
    paymentDebounceMs = DEFAULT_PAYMENT_DEBOUNCE_MS,
    paymentTimeoutMs = DEFAULT_PAYMENT_TIMEOUT_MS,
    onStateChange,
    onPaymentComplete,
    onError,
  } = options;

  // State
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [depositId, setDepositId] = useState<string | null>(null);
  const [streamHeaders, setStreamHeaders] = useState<StreamHeaders | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [error, setError] = useState<PaymentError | null>(null);

  // Refs for debouncing
  const paymentInFlightRef = useRef(false);
  const lastPaymentAttemptRef = useRef(0);
  const currentDtagRef = useRef<string | null>(null);

  // Update state with callback
  const updateStreamState = useCallback(
    (newState: StreamState) => {
      setStreamState(newState);
      onStateChange?.(newState);
    },
    [onStateChange]
  );

  // Compute preview duration from headers
  // Fallback to 60s if no headers
  const previewDuration = streamHeaders?.durationSeconds
    ? (streamHeaders.previewEndByte / (streamHeaders.durationSeconds * 128000 / 8)) * streamHeaders.durationSeconds
    : 60;

  /**
   * Start playing a track.
   * Returns the stream URL to set on audio.src.
   */
  const play = useCallback(
    async (dtag: string): Promise<string> => {
      // Reset state
      setError(null);
      setPaymentConfirmed(false);
      setReceipt(null);
      updateStreamState('idle');

      currentDtagRef.current = dtag;

      try {
        // Create parallel stream (generates depositId, fetches headers)
        const stream = await paywall.createParallelStream(dtag);

        setDepositId(stream.depositId);
        setStreamHeaders(stream.headers);

        if (stream.isFree) {
          // Free track - no payment needed
          updateStreamState('paid');
          setPaymentConfirmed(true);
        } else {
          updateStreamState('streaming');
        }

        return stream.streamUrl;
      } catch (err) {
        const paymentError: PaymentError = {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Failed to start stream',
        };
        setError(paymentError);
        updateStreamState('error');
        onError?.(paymentError);
        throw err;
      }
    },
    [paywall, updateStreamState, onError]
  );

  /**
   * Trigger payment for the current stream.
   * Call this near the preview boundary (e.g., from timeupdate).
   */
  const triggerPayment = useCallback(async (): Promise<boolean> => {
    // Debounce
    if (paymentInFlightRef.current) return false;
    const now = Date.now();
    if (now - lastPaymentAttemptRef.current < paymentDebounceMs) {
      return false;
    }

    // Guard: must have active stream
    if (!currentDtagRef.current || !depositId || !streamHeaders) {
      return false;
    }

    // Guard: don't pay twice
    if (paymentConfirmed) return false;

    paymentInFlightRef.current = true;
    lastPaymentAttemptRef.current = now;

    updateStreamState('paying');

    try {
      // Check balance
      const price = streamHeaders.priceCredits;
      if (wallet.balance < price) {
        const paymentError: PaymentError = {
          code: 'INSUFFICIENT_PAYMENT',
          message: `Insufficient balance: need ${price}, have ${wallet.balance}`,
        };
        setError(paymentError);
        updateStreamState('error');
        onError?.(paymentError);
        return false;
      }

      // Create token
      const token = await wallet.createToken(price);

      // Send payment
      const result: PaymentResult = await paywall.sendPayment(
        currentDtagRef.current,
        depositId,
        token,
        { timeout: paymentTimeoutMs }
      );

      if (result.success) {
        setPaymentConfirmed(true);
        if ('receipt' in result && result.receipt) {
          setReceipt(result.receipt as SettlementReceipt);
        }
        updateStreamState('paid');
        onPaymentComplete?.('receipt' in result ? result.receipt as SettlementReceipt : undefined);
        return true;
      } else {
        const err = 'error' in result ? result.error as PaymentError : { code: 'UNKNOWN', message: 'Payment failed' };
        setError(err);
        updateStreamState('error');
        onError?.(err);
        return false;
      }
    } catch (err) {
      const paymentError: PaymentError = {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Payment failed',
        recoverable: true,
      };
      setError(paymentError);
      updateStreamState('error');
      onError?.(paymentError);
      return false;
    } finally {
      paymentInFlightRef.current = false;
    }
  }, [
    depositId,
    streamHeaders,
    paymentConfirmed,
    paymentDebounceMs,
    paymentTimeoutMs,
    wallet,
    paywall,
    updateStreamState,
    onPaymentComplete,
    onError,
  ]);

  /**
   * Stop the current stream and reset state.
   */
  const stop = useCallback(() => {
    currentDtagRef.current = null;
    setDepositId(null);
    setStreamHeaders(null);
    setPaymentConfirmed(false);
    setReceipt(null);
    setError(null);
    updateStreamState('idle');
  }, [updateStreamState]);

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setError(null);
    if (streamState === 'error') {
      updateStreamState(paymentConfirmed ? 'paid' : 'streaming');
    }
  }, [streamState, paymentConfirmed, updateStreamState]);

  return {
    streamState,
    depositId,
    streamHeaders,
    paymentConfirmed,
    receipt,
    previewDuration,
    error,
    play,
    triggerPayment,
    stop,
    clearError,
  };
}
