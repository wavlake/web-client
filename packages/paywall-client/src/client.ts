/**
 * PaywallClient - Main client class
 * 
 * Unified interface for all paywall operations.
 */

import type {
  PaywallClientConfig,
  AudioResult,
  RequestAudioOptions,
  ContentResult,
  RequestContentOptions,
  ChangeResult,
} from './types.js';
import { PaywallError } from './errors.js';
import { requestAudio, getAudioUrl, getAudioPrice } from './audio.js';
import { requestContent, replayGrant, getContentPrice } from './content.js';
import { fetchChange, hasChange } from './change.js';
import { createLogger, type Logger } from './logger.js';

/**
 * Stateless client for interacting with Wavlake paywall endpoints.
 * 
 * This client provides methods for:
 * - Audio streaming (direct binary via /v1/audio)
 * - Content access (JSON with grants via /v1/content)
 * - Change recovery
 * 
 * @example
 * ```ts
 * const client = new PaywallClient({
 *   apiUrl: 'https://api.wavlake.com',
 * });
 * 
 * // Stream audio directly
 * const audio = await client.requestAudio('track-123', token);
 * 
 * // Or get a signed URL with grant
 * const content = await client.requestContent('track-123', token);
 * // Replay within 10 minutes:
 * const replay = await client.replayGrant('track-123', content.grant.id);
 * ```
 */
export class PaywallClient {
  private readonly config: PaywallClientConfig;
  private readonly log: Logger;

  constructor(config: PaywallClientConfig) {
    // Normalize API URL (remove trailing slash)
    this.config = {
      ...config,
      apiUrl: config.apiUrl.replace(/\/+$/, ''),
      timeout: config.timeout ?? 30000,
    };
    this.log = createLogger(config.debug);
    this.log.info('PaywallClient initialized', { apiUrl: this.config.apiUrl });
  }

  // ==========================================================================
  // Audio Endpoint Methods
  // ==========================================================================

  /**
   * Request audio binary directly.
   * 
   * Use this for simple playback where you want the raw audio bytes.
   * Does NOT support grant replay - each request needs a token.
   * 
   * @see {@link requestAudio} for full documentation
   */
  async requestAudio(
    dtag: string,
    token: string,
    options?: RequestAudioOptions
  ): Promise<AudioResult> {
    this.log.info('Requesting audio', { dtag, tokenPrefix: token.substring(0, 20) + '...', options });
    try {
      const result = await requestAudio(this.config, dtag, token, options);
      this.log.info('Audio received', { 
        dtag, 
        contentType: result.contentType, 
        size: result.audio.size,
        hasChange: !!result.change,
        changeAmount: result.changeAmount,
      });
      return result;
    } catch (error) {
      this.log.error('Audio request failed', { dtag, error: String(error) });
      throw error;
    }
  }

  /**
   * Generate a URL with embedded token for native audio elements.
   * 
   * Token is passed as query parameter. Burned immediately on use.
   * 
   * @see {@link getAudioUrl} for full documentation
   */
  getAudioUrl(dtag: string, token: string, paymentId?: string): string {
    const url = getAudioUrl(this.config, dtag, token, paymentId);
    this.log.debug('Generated audio URL', { dtag, urlLength: url.length });
    return url;
  }

  /**
   * Check the price of a track via audio endpoint.
   * 
   * @see {@link getAudioPrice} for full documentation
   */
  async getAudioPrice(dtag: string): Promise<number> {
    return getAudioPrice(this.config, dtag);
  }

  // ==========================================================================
  // Content Endpoint Methods
  // ==========================================================================

  /**
   * Request content access with grant.
   * 
   * Returns a signed URL + grant ID for replay. The grant allows
   * replaying within a 10-minute window without re-payment.
   * 
   * @see {@link requestContent} for full documentation
   */
  async requestContent(
    dtag: string,
    token: string,
    options?: RequestContentOptions
  ): Promise<ContentResult> {
    this.log.info('Requesting content', { dtag, tokenPrefix: token.substring(0, 20) + '...', options });
    try {
      const result = await requestContent(this.config, dtag, token, options);
      this.log.info('Content received', { 
        dtag, 
        grantId: result.grant.id,
        expiresAt: result.grant.expiresAt,
        streamType: result.grant.streamType,
        hasChange: !!result.change,
        changeAmount: result.changeAmount,
      });
      return result;
    } catch (error) {
      this.log.error('Content request failed', { dtag, error: String(error) });
      throw error;
    }
  }

  /**
   * Replay access using an existing grant.
   * 
   * No token required if grant is still valid.
   * 
   * @see {@link replayGrant} for full documentation
   */
  async replayGrant(dtag: string, grantId: string): Promise<ContentResult> {
    return replayGrant(this.config, dtag, grantId);
  }

  /**
   * Check the price of a track via content endpoint.
   * 
   * Can include NIP-98 auth to check spending cap status.
   * 
   * @see {@link getContentPrice} for full documentation
   */
  async getContentPrice(dtag: string, nostrAuth?: string): Promise<number> {
    return getContentPrice(this.config, dtag, nostrAuth);
  }

  // ==========================================================================
  // Change Endpoint Methods
  // ==========================================================================

  /**
   * Fetch change from a previous overpayment.
   * 
   * @see {@link fetchChange} for full documentation
   */
  async fetchChange(paymentId: string): Promise<ChangeResult> {
    return fetchChange(this.config, paymentId);
  }

  /**
   * Check if change is available for a payment.
   * 
   * @see {@link hasChange} for full documentation
   */
  async hasChange(paymentId: string): Promise<boolean> {
    return hasChange(this.config, paymentId);
  }

  // ==========================================================================
  // Static Utilities
  // ==========================================================================

  /**
   * Type guard to check if an error is a PaywallError
   */
  static isPaymentError(error: unknown): error is PaywallError {
    return PaywallError.isPaywallError(error);
  }

  /**
   * Type guard to check if an error requires payment (402)
   */
  static isPaymentRequired(error: unknown): error is PaywallError {
    return PaywallError.isPaymentRequired(error);
  }

  /**
   * Type guard to check if a token was already spent
   */
  static isTokenSpent(error: unknown): error is PaywallError {
    return PaywallError.isTokenSpent(error);
  }

  /**
   * Type guard to check if there's a mint/keyset mismatch
   */
  static isKeysetMismatch(error: unknown): error is PaywallError {
    return PaywallError.isKeysetMismatch(error);
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get the configured API URL
   */
  get apiUrl(): string {
    return this.config.apiUrl;
  }

  /**
   * Get the configured timeout
   */
  get timeout(): number {
    return this.config.timeout!;
  }

  /**
   * Create a new client with different configuration
   */
  withConfig(overrides: Partial<PaywallClientConfig>): PaywallClient {
    return new PaywallClient({
      ...this.config,
      ...overrides,
    });
  }
}
