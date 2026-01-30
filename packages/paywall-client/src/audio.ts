/**
 * Audio endpoint functions
 * 
 * Direct binary streaming from /v1/audio/{dtag}
 */

import type {
  PaywallClientConfig,
  AudioResult,
  RequestAudioOptions,
} from './types.js';
import { PaywallError, NetworkError, TimeoutError, parseApiError } from './errors.js';

/**
 * Request audio binary directly from the audio endpoint.
 * 
 * The audio endpoint streams bytes directly - suitable for embedded players
 * and simple integrations. Does NOT support grant replay (each request needs a token).
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @param token - Cashu token (cashuA/B encoded)
 * @param options - Additional options (range header for seeking)
 * @returns Audio blob with metadata
 * 
 * @example
 * ```ts
 * const result = await requestAudio(config, 'track-123', token);
 * const url = URL.createObjectURL(result.audio);
 * audio.src = url;
 * audio.play();
 * ```
 */
export async function requestAudio(
  config: PaywallClientConfig,
  dtag: string,
  token: string,
  options: RequestAudioOptions = {}
): Promise<AudioResult> {
  const url = `${config.apiUrl}/v1/audio/${encodeURIComponent(dtag)}`;

  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    'X-Ecash-Token': token,
  };

  if (options.range) {
    headers['Range'] = options.range;
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

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw parseApiError(response.status, body);
    }

    const audio = await response.blob();
    const contentType = response.headers.get('Content-Type') || 'audio/mpeg';
    
    // Extract change from headers if present
    const change = response.headers.get('X-Ecash-Change') || undefined;
    const changeAmountHeader = response.headers.get('X-Ecash-Change-Amount');
    const changeAmount = changeAmountHeader ? parseInt(changeAmountHeader, 10) : undefined;

    return {
      audio,
      contentType,
      change,
      changeAmount,
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
      `Failed to fetch audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Generate a URL with embedded token for native HTML audio elements.
 * 
 * Use this when you need a URL string (e.g., for `<audio src="...">`).
 * The token is passed as a query parameter.
 * 
 * **Security note:** URL tokens are burned immediately on use - no leak risk.
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @param token - Cashu token (cashuA/B encoded)
 * @param paymentId - Optional payment ID for change recovery
 * @returns URL string with token embedded
 * 
 * @example
 * ```ts
 * const audioEl = document.querySelector('audio');
 * audioEl.src = getAudioUrl(config, 'track-123', token);
 * audioEl.play();
 * ```
 */
export function getAudioUrl(
  config: PaywallClientConfig,
  dtag: string,
  token: string,
  paymentId?: string
): string {
  const url = new URL(`${config.apiUrl}/v1/audio/${encodeURIComponent(dtag)}`);
  url.searchParams.set('token', token);
  
  if (paymentId) {
    url.searchParams.set('paymentId', paymentId);
  }

  return url.toString();
}

/**
 * Check if a track requires payment (without paying).
 * 
 * Makes a request without a token to get pricing info.
 * Free tracks will return 200, paywalled tracks return 402.
 * 
 * @param config - Client configuration
 * @param dtag - Track d-tag identifier
 * @returns Price in credits, or 0 if free
 * 
 * @example
 * ```ts
 * const price = await getAudioPrice(config, 'track-123');
 * if (price > 0) {
 *   console.log(`Track costs ${price} credits`);
 * }
 * ```
 */
export async function getAudioPrice(
  config: PaywallClientConfig,
  dtag: string
): Promise<number> {
  const url = `${config.apiUrl}/v1/audio/${encodeURIComponent(dtag)}`;

  const controller = new AbortController();
  const timeoutId = config.timeout
    ? setTimeout(() => controller.abort(), config.timeout)
    : undefined;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: config.defaultHeaders,
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    // Free track
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
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
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
      `Failed to check audio price: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}
