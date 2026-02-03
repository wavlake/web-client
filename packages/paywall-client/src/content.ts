/**
 * Content endpoint functions
 * 
 * JSON-based access with grants from /api/v1/content/{dtag}
 */

import type {
  PaywallClientConfig,
  ContentResult,
  RequestContentOptions,
  ContentApiData,
  ApiResponse,
} from './types.js';
import { PaywallError, NetworkError, TimeoutError, parseApiError } from './errors.js';

/**
 * Request content access via the content endpoint.
 * 
 * The content endpoint returns a signed URL + grant. The grant allows replay
 * within a 10-minute window without re-payment.
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @param token - Cashu token (cashuA/B encoded)
 * @param options - Additional options (grant replay, NIP-98 auth)
 * @returns Content result with URL and grant
 * 
 * @example
 * ```ts
 * // Initial request with payment
 * const result = await requestContent(config, 'track-123', token);
 * console.log(`Grant expires at: ${result.grant.expiresAt}`);
 * 
 * // Replay within grant window (no token needed)
 * const replay = await requestContent(config, 'track-123', '', {
 *   grantId: result.grant.id,
 * });
 * ```
 */
export async function requestContent(
  config: PaywallClientConfig,
  dtag: string,
  token: string,
  options: RequestContentOptions = {}
): Promise<ContentResult> {
  const url = `${config.apiUrl}/api/v1/content/${encodeURIComponent(dtag)}`;

  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    'Accept': 'application/json',
  };

  // Add token if provided
  if (token) {
    headers['X-Ecash-Token'] = token;
  }

  // Add grant ID for replay
  if (options.grantId) {
    headers['X-Grant-ID'] = options.grantId;
  }

  // Add NIP-98 auth for spending caps
  if (options.nostrAuth) {
    headers['Authorization'] = `Nostr ${options.nostrAuth}`;
  }

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

    const body = await response.json() as ApiResponse<ContentApiData>;

    if (!response.ok) {
      throw parseApiError(response.status, body);
    }

    // Handle both nested and flat response formats
    const data = 'data' in body && body.data ? body.data : body as unknown as ContentApiData;

    if (!data.url) {
      throw new PaywallError({
        code: 'CONTENT_NOT_FOUND',
        message: 'No URL in response',
        details: {},
      });
    }

    // Note: Server no longer returns change (Phase 5 of Sat-to-USD PRD).
    // Overpayment becomes artist tip.
    return {
      url: data.url,
      grant: {
        id: data.grant?.id || '',
        expiresAt: data.grant?.expires_at 
          ? new Date(data.grant.expires_at)
          : new Date(Date.now() + 10 * 60 * 1000), // Default 10 min
        streamType: data.grant?.stream_type || 'paid',
      },
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
      `Failed to fetch content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Request content using an existing grant (replay).
 * 
 * Convenience method that doesn't require a token.
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @param grantId - Grant ID from previous request
 * @returns Content result with refreshed URL
 * 
 * @example
 * ```ts
 * // Save grant ID from initial request
 * const { grant } = await requestContent(config, 'track-123', token);
 * localStorage.setItem('grant', grant.id);
 * 
 * // Later, replay without payment
 * const replay = await replayGrant(config, 'track-123', grant.id);
 * ```
 */
export async function replayGrant(
  config: PaywallClientConfig,
  dtag: string,
  grantId: string
): Promise<ContentResult> {
  return requestContent(config, dtag, '', { grantId });
}

/**
 * Check if a track requires payment (without paying).
 * 
 * Makes a request without a token to get pricing info.
 * Free tracks will return content, paywalled tracks return 402.
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @param nostrAuth - Optional NIP-98 auth to check spending cap status
 * @returns Price in credits (0 if free or cap reached)
 * 
 * @example
 * ```ts
 * const price = await getContentPrice(config, 'track-123');
 * if (price > 0) {
 *   // Show purchase UI
 * } else {
 *   // Play for free
 * }
 * ```
 */
export async function getContentPrice(
  config: PaywallClientConfig,
  dtag: string,
  nostrAuth?: string
): Promise<number> {
  const url = `${config.apiUrl}/api/v1/content/${encodeURIComponent(dtag)}`;

  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    'Accept': 'application/json',
  };

  if (nostrAuth) {
    headers['Authorization'] = `Nostr ${nostrAuth}`;
  }

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

    // Free track or cap reached
    if (response.ok) {
      return 0;
    }

    // Payment required - extract price
    if (response.status === 402) {
      const body = await response.json();
      return body.error?.details?.required 
        ?? body.error?.details?.price_credits 
        ?? body.price_credits 
        ?? 1;
    }

    // Other error
    const body = await response.json();
    throw parseApiError(response.status, body);

  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    if (error instanceof PaywallError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TimeoutError(config.timeout || 30000);
    }

    throw new NetworkError(
      `Failed to check content price: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}
