/**
 * Parallel Payment Streaming
 * 
 * Protocol for seamless audio streaming with deferred payment:
 * 
 * 1. Client generates depositID = crypto.randomUUID()
 * 2. Stream URL: GET /v1/audio/{dtag}?d={depositID}
 * 3. Server streams preview bytes, then holds connection
 * 4. Response headers: X-Preview-End-Byte, X-Price-Credits, X-Mint-URL, X-Duration-Seconds
 * 5. Client triggers payment near preview boundary via timeupdate
 * 6. Payment: POST /v1/audio/{dtag}/pay with { depositId, token }
 * 7. On 200: proofs spent, server signals stream to continue
 * 8. Kind 30444 receipt returned in POST /pay response
 * 
 * Benefits:
 * - Single <audio src> connection (no audible gap)
 * - 2 proof states (available/spent) instead of 4
 * - No wall-clock gate, recovery timers, or Redis deposits
 * - Any Nostr client can implement with 1 GET + 1 POST
 */

import type { PaywallClientConfig } from './types.js';
import type {
  StreamHeaders,
  PaymentResult,
  ParallelStreamConfig,
  SettlementReceipt,
} from './parallel-types.js';
import { PaywallError } from './errors.js';
import { createLogger } from './logger.js';

// Default payment timeout
const DEFAULT_PAYMENT_TIMEOUT_MS = 15000;

/**
 * Generate a unique deposit ID for parallel streaming.
 */
export function generateDepositId(): string {
  return crypto.randomUUID();
}

/**
 * Build the stream URL with deposit ID query parameter.
 * 
 * @param apiUrl - Base API URL
 * @param dtag - Track d-tag identifier
 * @param depositId - UUID for this stream deposit
 * @returns Full stream URL with ?d={depositId}
 */
export function buildStreamUrl(apiUrl: string, dtag: string, depositId: string): string {
  const url = new URL(`${apiUrl}/api/v1/audio/${dtag}`);
  url.searchParams.set('d', depositId);
  return url.toString();
}

/**
 * Fetch stream headers via HEAD request.
 * 
 * Returns preview boundary, price, mint URL, and duration.
 * Returns null for free tracks (no paywall headers).
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @param depositId - UUID for this stream deposit
 */
export async function fetchStreamHeaders(
  config: PaywallClientConfig,
  dtag: string,
  depositId: string
): Promise<StreamHeaders | null> {
  const log = createLogger(config.debug);
  const url = buildStreamUrl(config.apiUrl, dtag, depositId);

  log.info('Fetching stream headers', { dtag, depositId: depositId.slice(0, 8) + '...' });

  const response = await fetch(url, {
    method: 'HEAD',
    headers: config.defaultHeaders,
    signal: AbortSignal.timeout(config.timeout ?? 30000),
  });

  if (!response.ok) {
    log.error('Stream headers request failed', { status: response.status });
    throw new PaywallError({
      code: response.status === 404 ? 'CONTENT_NOT_FOUND' : 'PAYMENT_REQUIRED',
      message: `Failed to fetch stream headers: ${response.status}`,
      details: {},
    });
  }

  const previewEndByte = response.headers.get('X-Preview-End-Byte');
  const priceCredits = response.headers.get('X-Price-Credits');
  const mintUrl = response.headers.get('X-Mint-URL');
  const durationSeconds = response.headers.get('X-Duration-Seconds');

  // No paywall headers = free track
  if (!previewEndByte || !priceCredits) {
    log.info('No stream headers (free track)', { dtag });
    return null;
  }

  const headers: StreamHeaders = {
    previewEndByte: parseInt(previewEndByte, 10),
    priceCredits: parseInt(priceCredits, 10),
    mintUrl: mintUrl || undefined,
    durationSeconds: durationSeconds ? parseFloat(durationSeconds) : undefined,
  };

  log.info('Stream headers received', { dtag, ...headers });
  return headers;
}

/**
 * Send payment for an active stream.
 * 
 * POST /v1/audio/{dtag}/pay with { depositId, token }
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @param depositId - UUID from the stream request
 * @param token - Cashu V4 token with payment proofs
 * @param options - Optional payment configuration
 */
export async function sendPayment(
  config: PaywallClientConfig,
  dtag: string,
  depositId: string,
  token: string,
  options?: { timeout?: number }
): Promise<PaymentResult> {
  const log = createLogger(config.debug);
  const payUrl = `${config.apiUrl}/api/v1/audio/${dtag}/pay`;
  const timeout = options?.timeout ?? DEFAULT_PAYMENT_TIMEOUT_MS;

  log.info('Sending payment', { 
    dtag, 
    depositId: depositId.slice(0, 8) + '...',
    tokenLength: token.length,
  });

  const startTime = performance.now();

  try {
    const response = await fetch(payUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.defaultHeaders,
      },
      body: JSON.stringify({ depositId, token }),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = performance.now() - startTime;
    log.info('Payment response', { status: response.status, elapsed: `${elapsed.toFixed(0)}ms` });

    if (response.ok) {
      // Parse receipt from response
      let receipt: SettlementReceipt | undefined;
      try {
        const data = await response.json();
        if (data.success && data.data?.receipt) {
          receipt = data.data.receipt;
          log.info('Receipt received', { receiptId: receipt?.id });
        }
      } catch {
        log.warn('Could not parse receipt from response');
      }

      return { success: true, receipt };
    }

    // Handle error responses
    if (response.status === 402) {
      const data = await response.json().catch(() => ({}));
      log.warn('Payment rejected (402)', data);
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_PAYMENT',
          message: 'Payment rejected: proofs invalid or insufficient',
          details: data,
        },
      };
    }

    if (response.status === 404) {
      log.warn('Deposit not found (404)');
      return {
        success: false,
        error: {
          code: 'DEPOSIT_NOT_FOUND',
          message: 'Stream timed out or deposit not found. Please restart playback.',
        },
      };
    }

    if (response.status === 409) {
      // Already paid - treat as success
      log.info('Deposit already paid (409)');
      return { success: true, alreadyPaid: true };
    }

    const text = await response.text().catch(() => '');
    log.error('Payment failed', { status: response.status, body: text });
    return {
      success: false,
      error: {
        code: 'PAYMENT_FAILED',
        message: `Payment failed: ${response.status}`,
        details: { status: response.status, body: text },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    log.error('Payment network error', { error: message });
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message,
        recoverable: true, // Proofs may not have been spent
      },
    };
  }
}

/**
 * Create a parallel stream configuration.
 * 
 * Convenience function that generates deposit ID, builds URL, and fetches headers.
 * Returns everything needed to start streaming and trigger payment.
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 */
export async function createParallelStream(
  config: PaywallClientConfig,
  dtag: string
): Promise<ParallelStreamConfig> {
  const depositId = generateDepositId();
  const streamUrl = buildStreamUrl(config.apiUrl, dtag, depositId);
  const headers = await fetchStreamHeaders(config, dtag, depositId);

  return {
    dtag,
    depositId,
    streamUrl,
    headers,
    isFree: headers === null,
  };
}
