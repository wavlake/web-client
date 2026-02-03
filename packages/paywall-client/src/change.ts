/**
 * Change recovery endpoint functions
 * 
 * @deprecated The change endpoint was removed in Phase 5 of Sat-to-USD PRD.
 * Server-side change breaks ecash privacy. Clients should prepare exact
 * denominations via mint swap before payment. Overpayment becomes artist tip.
 * 
 * These functions are kept for backwards compatibility but will throw errors
 * as the server endpoint no longer exists.
 */

import type {
  PaywallClientConfig,
  ChangeResult,
  ChangeApiData,
  ApiResponse,
} from './types.js';
import { PaywallError, NetworkError, TimeoutError, parseApiError } from './errors.js';

/**
 * Fetch change from a previous payment.
 * 
 * @deprecated This endpoint was removed. Server no longer returns change.
 * Overpayment becomes artist tip. Prepare exact token denominations instead.
 * 
 * @param config - Client configuration
 * @param paymentId - Payment ID from the original request
 * @returns Change result (will always be null as endpoint removed)
 */
export async function fetchChange(
  config: PaywallClientConfig,
  paymentId: string
): Promise<ChangeResult> {
  const url = `${config.apiUrl}/api/v1/change/${encodeURIComponent(paymentId)}`;

  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    'Accept': 'application/json',
  };

  const controller = new AbortController();
  const timeoutId = config.timeout
    ? setTimeout(() => controller.abort(), config.timeout)
    : undefined;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    const body = await response.json() as ApiResponse<ChangeApiData>;

    if (!response.ok) {
      throw parseApiError(response.status, body);
    }

    // Handle both nested and flat response formats
    const data = 'data' in body && body.data ? body.data : body as unknown as ChangeApiData;

    return {
      paymentId: data.payment_id || paymentId,
      change: data.change,
      changeAmount: data.change_amount,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    if (error instanceof PaywallError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TimeoutError(config.timeout || 30000);
    }

    throw new NetworkError(
      `Failed to fetch change: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Check if change is available for a payment.
 * 
 * @deprecated This endpoint was removed. Server no longer returns change.
 * Overpayment becomes artist tip. Prepare exact token denominations instead.
 * 
 * @param config - Client configuration
 * @param paymentId - Payment ID to check
 * @returns Always false as endpoint was removed
 */
export async function hasChange(
  config: PaywallClientConfig,
  paymentId: string
): Promise<boolean> {
  try {
    const result = await fetchChange(config, paymentId);
    return result.change !== null;
  } catch {
    return false;
  }
}
