/**
 * @wavlake/paywall-client
 * 
 * Stateless API client for Wavlake paywall endpoints.
 * 
 * @example
 * ```ts
 * import { PaywallClient } from '@wavlake/paywall-client';
 * 
 * const client = new PaywallClient({
 *   apiUrl: 'https://api.wavlake.com',
 * });
 * 
 * // Request content with payment
 * const result = await client.requestContent('track-dtag', cashuToken);
 * console.log('Audio URL:', result.url);
 * console.log('Grant expires:', result.grant.expiresAt);
 * 
 * // Replay within grant window (no payment needed)
 * const replay = await client.replayGrant('track-dtag', result.grant.id);
 * ```
 * 
 * @packageDocumentation
 */

// Main client class
export { PaywallClient } from './client.js';

// Standalone functions (for tree-shaking)
export {
  requestAudio,
  getAudioUrl,
  getAudioPrice,
} from './audio.js';

export {
  requestContent,
  replayGrant,
  getContentPrice,
} from './content.js';

export {
  fetchChange,
  hasChange,
} from './change.js';

// Error classes
export {
  PaywallError,
  NetworkError,
  TimeoutError,
} from './errors.js';

// Types
export type {
  PaywallClientConfig,
  AudioResult,
  RequestAudioOptions,
  ContentResult,
  RequestContentOptions,
  AccessGrant,
  ChangeResult,
  PaymentError,
  PaymentErrorCode,
} from './types.js';
