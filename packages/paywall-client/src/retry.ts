/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Function to determine if error is retryable (default: network errors only) */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each retry with attempt number and delay */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

/**
 * Default retryable check - only retry network errors, not business logic errors
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket')
    );
  }
  return false;
}

/**
 * Execute a function with retry logic and exponential backoff
 * 
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    isRetryable = isNetworkError,
    onRetry,
  } = options;

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      // Notify before retry
      if (onRetry) {
        onRetry(attempt, delayMs, error);
      }

      // Wait before retrying
      await sleep(delayMs);

      // Increase delay for next attempt (with jitter)
      const jitter = Math.random() * 0.2 * delayMs; // ±10% jitter
      delayMs = Math.min(delayMs * backoffMultiplier + jitter, maxDelayMs);
    }
  }

  // This shouldn't be reached, but TypeScript wants it
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
