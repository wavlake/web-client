/**
 * Wavlake Paywall Client Errors
 * 
 * Custom error classes for paywall-specific errors.
 */

import type { PaymentError, PaymentErrorCode } from './types.js';

/**
 * Error thrown when the paywall API returns a payment-related error.
 * 
 * @example
 * ```ts
 * try {
 *   await client.requestContent(dtag, token);
 * } catch (err) {
 *   if (PaywallError.isPaymentError(err)) {
 *     console.log(`Need ${err.details.required} credits`);
 *   }
 * }
 * ```
 */
export class PaywallError extends Error implements PaymentError {
  readonly code: PaymentErrorCode;
  readonly details: PaymentError['details'];

  constructor(error: PaymentError) {
    super(error.message);
    this.name = 'PaywallError';
    this.code = error.code;
    this.details = error.details;

    // Maintains proper stack trace in V8 environments
    if ('captureStackTrace' in Error) {
      (Error as { captureStackTrace: (target: object, constructor: Function) => void })
        .captureStackTrace(this, PaywallError);
    }
  }

  /**
   * Type guard to check if an error is a PaywallError
   */
  static isPaywallError(error: unknown): error is PaywallError {
    return error instanceof PaywallError;
  }

  /**
   * Type guard to check if an error represents a payment requirement (402)
   */
  static isPaymentRequired(error: unknown): error is PaywallError {
    return (
      error instanceof PaywallError &&
      error.code === 'PAYMENT_REQUIRED'
    );
  }

  /**
   * Type guard to check if an error is a spent token error
   */
  static isTokenSpent(error: unknown): error is PaywallError {
    return (
      error instanceof PaywallError &&
      error.code === 'TOKEN_ALREADY_SPENT'
    );
  }

  /**
   * Type guard to check if an error is a keyset mismatch (wrong mint)
   */
  static isKeysetMismatch(error: unknown): error is PaywallError {
    return (
      error instanceof PaywallError &&
      error.code === 'KEYSET_MISMATCH'
    );
  }

  /**
   * Get the required payment amount, if applicable
   */
  get requiredAmount(): number | undefined {
    return this.details.required;
  }

  /**
   * Get the expected mint URL, if applicable
   */
  get expectedMint(): string | undefined {
    return this.details.mintUrl;
  }

  toJSON(): PaymentError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Error thrown when a network request fails
 */
export class NetworkError extends Error {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;

    if ('captureStackTrace' in Error) {
      (Error as { captureStackTrace: (target: object, constructor: Function) => void })
        .captureStackTrace(this, NetworkError);
    }
  }

  static isNetworkError(error: unknown): error is NetworkError {
    return error instanceof NetworkError;
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;

    if ('captureStackTrace' in Error) {
      (Error as { captureStackTrace: (target: object, constructor: Function) => void })
        .captureStackTrace(this, TimeoutError);
    }
  }

  static isTimeoutError(error: unknown): error is TimeoutError {
    return error instanceof TimeoutError;
  }
}

/**
 * Parse an API error response into a PaywallError
 * @internal
 */
export function parseApiError(
  status: number,
  body: unknown
): PaywallError {
  // Handle structured error response
  if (isErrorResponse(body)) {
    const details = body.error?.details;
    return new PaywallError({
      code: mapErrorCode(body.error?.code || String(status)),
      message: body.error?.message || `HTTP ${status}`,
      details: {
        required: (details?.required ?? details?.price_credits) as number | undefined,
        provided: details?.provided as number | undefined,
        mintUrl: (details?.mint_url ?? details?.mintUrl) as string | undefined,
        paymentMethods: details?.payment_methods as string[] | undefined,
      },
    });
  }

  // Handle unknown error format
  return new PaywallError({
    code: mapErrorCode(String(status)),
    message: typeof body === 'string' ? body : `HTTP ${status}`,
    details: {},
  });
}

function isErrorResponse(body: unknown): body is {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
} {
  return typeof body === 'object' && body !== null;
}

function mapErrorCode(code: string): PaymentErrorCode {
  const codeMap: Record<string, PaymentErrorCode> = {
    'PAYMENT_REQUIRED': 'PAYMENT_REQUIRED',
    'INVALID_TOKEN': 'INVALID_TOKEN',
    'TOKEN_ALREADY_SPENT': 'TOKEN_ALREADY_SPENT',
    'KEYSET_MISMATCH': 'KEYSET_MISMATCH',
    'INSUFFICIENT_PAYMENT': 'INSUFFICIENT_PAYMENT',
    'CONTENT_NOT_FOUND': 'CONTENT_NOT_FOUND',
    'INVALID_GRANT': 'INVALID_GRANT',
    'RATE_LIMITED': 'RATE_LIMITED',
    '402': 'PAYMENT_REQUIRED',
    '404': 'CONTENT_NOT_FOUND',
    '429': 'RATE_LIMITED',
  };

  return codeMap[code] || 'PAYMENT_REQUIRED';
}
