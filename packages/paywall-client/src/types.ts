/**
 * Wavlake Paywall Client Types
 * 
 * Core interfaces for interacting with Wavlake paywall endpoints.
 */

// ============================================================================
// Configuration
// ============================================================================

import type { Logger } from './logger.js';

/**
 * Configuration for PaywallClient
 */
export interface PaywallClientConfig {
  /** Base URL for the Wavlake API (e.g., 'https://api.wavlake.com') */
  apiUrl: string;
  /** Default headers to include with every request */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable debug logging (true for console, or provide custom Logger) */
  debug?: boolean | Logger;
}

export type { Logger, LogEntry, LogLevel } from './logger.js';

// ============================================================================
// Audio Endpoint Types
// ============================================================================

/**
 * Options for requestAudio
 */
export interface RequestAudioOptions {
  /** HTTP Range header for seeking (e.g., 'bytes=0-1048575') */
  range?: string;
}

/**
 * Result from requestAudio
 */
export interface AudioResult {
  /** Binary audio data */
  audio: Blob;
  /** Content-Type header (e.g., 'audio/mpeg') */
  contentType: string;
  /** Change token if overpayment (cashuB encoded) */
  change?: string;
  /** Amount of change returned in credits */
  changeAmount?: number;
}

// ============================================================================
// Content Endpoint Types
// ============================================================================

/**
 * Options for requestContent
 */
export interface RequestContentOptions {
  /** Replay existing grant (skip payment) */
  grantId?: string;
  /** NIP-98 auth header for spending caps */
  nostrAuth?: string;
}

/**
 * Access grant returned from content endpoint
 */
export interface AccessGrant {
  /** Unique grant identifier for replay */
  id: string;
  /** When the grant expires */
  expiresAt: Date;
  /** How access was obtained */
  streamType: 'paid' | 'free' | 'honor';
}

/**
 * Result from requestContent
 */
export interface ContentResult {
  /** Signed URL to fetch audio from */
  url: string;
  /** Access grant for replay */
  grant: AccessGrant;
  /** Change token if overpayment (cashuB encoded) */
  change?: string;
  /** Amount of change returned in credits */
  changeAmount?: number;
}

// ============================================================================
// Change Endpoint Types
// ============================================================================

/**
 * Result from fetchChange
 */
export interface ChangeResult {
  /** Payment ID the change is for */
  paymentId: string;
  /** Change token (null if already claimed or expired) */
  change: string | null;
  /** Amount of change in credits */
  changeAmount?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes from paywall API
 */
export type PaymentErrorCode =
  | 'PAYMENT_REQUIRED'
  | 'INVALID_TOKEN'
  | 'TOKEN_ALREADY_SPENT'
  | 'KEYSET_MISMATCH'
  | 'INSUFFICIENT_PAYMENT'
  | 'CONTENT_NOT_FOUND'
  | 'INVALID_GRANT'
  | 'RATE_LIMITED';

/**
 * Structured error from paywall API
 */
export interface PaymentError {
  /** Error code */
  code: PaymentErrorCode;
  /** Human-readable message */
  message: string;
  /** Additional error details */
  details: {
    /** Credits required for access */
    required?: number;
    /** Credits provided in token */
    provided?: number;
    /** Expected mint URL */
    mintUrl?: string;
    /** Supported payment methods */
    paymentMethods?: string[];
  };
}

// ============================================================================
// API Response Types (internal)
// ============================================================================

/** @internal */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** @internal */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** @internal */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** @internal */
export interface ContentApiData {
  url: string;
  grant?: {
    id: string;
    expires_at: string;
    stream_type: 'paid' | 'free' | 'honor';
  };
  change?: string;
  change_amount?: number;
}

/** @internal */
export interface ChangeApiData {
  payment_id: string;
  change: string | null;
  change_amount?: number;
}
