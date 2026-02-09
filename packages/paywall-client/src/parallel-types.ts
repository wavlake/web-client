/**
 * Parallel Payment Streaming Types
 * 
 * Types for the parallel payment with streaming hold protocol.
 */

// ============================================================================
// Stream Types
// ============================================================================

/**
 * Stream state for parallel payment protocol.
 * 
 * - 'idle': No stream active
 * - 'streaming': Stream connection open, preview bytes flowing
 * - 'paying': Payment POST in flight
 * - 'paid': Payment confirmed, paid bytes flowing
 * - 'error': Stream or payment error
 */
export type StreamState = 'idle' | 'streaming' | 'paying' | 'paid' | 'error';

/**
 * Response headers from the stream endpoint.
 * 
 * GET /v1/audio/{dtag}?d={depositID}
 */
export interface StreamHeaders {
  /** Byte offset where preview ends (X-Preview-End-Byte) */
  previewEndByte: number;
  /** Track price in credits (X-Price-Credits) */
  priceCredits: number;
  /** Cashu mint URL for token validation (X-Mint-URL) */
  mintUrl?: string;
  /** Total track duration in seconds (X-Duration-Seconds) */
  durationSeconds?: number;
}

/**
 * Configuration for a parallel stream.
 * 
 * Returned by createParallelStream().
 */
export interface ParallelStreamConfig {
  /** Track d-tag identifier */
  dtag: string;
  /** UUID for this stream deposit */
  depositId: string;
  /** Full stream URL with ?d={depositId} */
  streamUrl: string;
  /** Stream headers (null for free tracks) */
  headers: StreamHeaders | null;
  /** True if track is free (no payment needed) */
  isFree: boolean;
}

// ============================================================================
// Payment Types
// ============================================================================

/**
 * Payment request body for POST /v1/audio/{dtag}/pay
 */
export interface PaymentRequest {
  depositId: string;
  token: string;
}

/**
 * Kind 30444 settlement receipt from POST /pay response.
 * 
 * Nostr event signed by the server confirming payment.
 */
export interface SettlementReceipt {
  kind: 30444;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  id: string;
  sig: string;
}

/**
 * Payment error from POST /pay endpoint.
 */
export interface PaymentError {
  code: 
    | 'INSUFFICIENT_PAYMENT'
    | 'DEPOSIT_NOT_FOUND'
    | 'PAYMENT_FAILED'
    | 'NETWORK_ERROR';
  message: string;
  details?: Record<string, unknown>;
  /** True if proofs may not have been spent (network error) */
  recoverable?: boolean;
}

/**
 * Result from sendPayment().
 */
export type PaymentResult =
  | { success: true; receipt?: SettlementReceipt; alreadyPaid?: boolean }
  | { success: false; error: PaymentError };

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Options for useParallelStream hook.
 */
export interface UseParallelStreamOptions {
  /** Seconds before preview end to trigger payment (default: 3) */
  paymentTriggerOffset?: number;
  /** Minimum ms between payment attempts (default: 1000) */
  paymentDebounceMs?: number;
  /** Payment POST timeout ms (default: 15000) */
  paymentTimeoutMs?: number;
  /** Callback when stream state changes */
  onStateChange?: (state: StreamState) => void;
  /** Callback when payment completes */
  onPaymentComplete?: (receipt?: SettlementReceipt) => void;
  /** Callback on error */
  onError?: (error: PaymentError) => void;
}

/**
 * Return type for useParallelStream hook.
 */
export interface UseParallelStreamReturn {
  /** Current stream state */
  streamState: StreamState;
  /** Active deposit ID */
  depositId: string | null;
  /** Stream headers (preview boundary, price, etc.) */
  streamHeaders: StreamHeaders | null;
  /** True after payment confirmed */
  paymentConfirmed: boolean;
  /** Settlement receipt from POST /pay */
  receipt: SettlementReceipt | null;
  /** Preview duration in seconds (computed from headers) */
  previewDuration: number;
  /** Error if any */
  error: PaymentError | null;

  /**
   * Start playing a track.
   * Returns the stream URL to set on audio.src
   */
  play: (dtag: string) => Promise<string>;

  /**
   * Trigger payment for the current stream.
   * Call this near the preview boundary (e.g., from timeupdate).
   */
  triggerPayment: () => Promise<boolean>;

  /**
   * Stop the current stream and reset state.
   */
  stop: () => void;

  /**
   * Clear error state.
   */
  clearError: () => void;
}
