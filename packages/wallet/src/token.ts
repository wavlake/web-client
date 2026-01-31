/**
 * Token Inspection Utilities
 * 
 * Utilities for inspecting, validating, and extracting information from Cashu tokens
 * without swapping them with the mint.
 */

import { getDecodedToken, type Token } from '@cashu/cashu-ts';
import type { Proof } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of token inspection
 */
export interface TokenInfo {
  /** Token format version (3 for cashuA, 4 for cashuB) */
  version: 3 | 4;
  /** Mint URL the token is for */
  mint: string;
  /** Total amount in the token (sum of all proofs) */
  amount: number;
  /** Number of proofs in the token */
  proofCount: number;
  /** Individual proof amounts */
  proofAmounts: number[];
  /** Unit (e.g., 'sat', 'usd') if specified */
  unit?: string;
  /** Memo if included in token */
  memo?: string;
  /** The decoded proofs (for advanced use) */
  proofs: Proof[];
  /** Original encoded token string */
  encoded: string;
}

/**
 * Options for token validation
 */
export interface ValidateTokenOptions {
  /** Expected mint URL (validates token is for this mint) */
  expectedMint?: string;
  /** Minimum expected amount */
  minAmount?: number;
  /** Maximum expected amount */
  maxAmount?: number;
  /** Exact expected amount */
  exactAmount?: number;
  /** Expected unit (e.g., 'usd') */
  expectedUnit?: string;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Token info if successfully parsed */
  info?: TokenInfo;
  /** Validation errors (if any) */
  errors: string[];
  /** Validation warnings (non-fatal issues) */
  warnings: string[];
}

/**
 * Error thrown when token parsing fails
 */
export class TokenParseError extends Error {
  readonly token: string;
  readonly cause?: Error;

  constructor(message: string, token: string, cause?: Error) {
    super(message);
    this.name = 'TokenParseError';
    this.token = token.substring(0, 20) + '...'; // Truncate for safety
    this.cause = cause;

    if ('captureStackTrace' in Error) {
      (Error as { captureStackTrace: (target: object, constructor: Function) => void })
        .captureStackTrace(this, TokenParseError);
    }
  }
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Inspect a Cashu token without swapping it.
 * 
 * Decodes the token and extracts useful information like mint URL,
 * total amount, proof count, etc. Does NOT contact the mint.
 * 
 * @param token - Encoded Cashu token (cashuA or cashuB format)
 * @returns Token information
 * @throws TokenParseError if token is malformed
 * 
 * @example
 * ```ts
 * import { inspectToken } from '@wavlake/wallet';
 * 
 * const info = inspectToken('cashuB...');
 * console.log(`Token for ${info.mint}`);
 * console.log(`Amount: ${info.amount} (${info.proofCount} proofs)`);
 * ```
 */
export function inspectToken(token: string): TokenInfo {
  if (!token || typeof token !== 'string') {
    throw new TokenParseError('Token must be a non-empty string', token || '');
  }

  // Check basic format
  if (!token.startsWith('cashuA') && !token.startsWith('cashuB')) {
    throw new TokenParseError(
      'Invalid token format: must start with cashuA or cashuB',
      token
    );
  }

  let decoded: Token;
  try {
    decoded = getDecodedToken(token);
  } catch (error) {
    throw new TokenParseError(
      `Failed to decode token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      token,
      error instanceof Error ? error : undefined
    );
  }

  // Extract proofs (handle both v3 and v4 formats)
  const proofs: Proof[] = decoded.proofs || [];
  
  if (proofs.length === 0) {
    throw new TokenParseError('Token contains no proofs', token);
  }

  // Calculate totals
  const proofAmounts = proofs.map(p => p.amount);
  const amount = proofAmounts.reduce((sum, a) => sum + a, 0);

  // Detect version from prefix
  const version = token.startsWith('cashuB') ? 4 : 3;

  return {
    version,
    mint: decoded.mint || '',
    amount,
    proofCount: proofs.length,
    proofAmounts,
    unit: decoded.unit,
    memo: decoded.memo,
    proofs,
    encoded: token,
  };
}

/**
 * Validate a Cashu token against expected parameters.
 * 
 * Useful for checking tokens before spending them to catch issues early
 * with helpful error messages.
 * 
 * @param token - Encoded Cashu token
 * @param options - Validation options
 * @returns Validation result with errors/warnings
 * 
 * @example
 * ```ts
 * import { validateToken } from '@wavlake/wallet';
 * 
 * const result = validateToken(token, {
 *   expectedMint: 'https://mint.wavlake.com',
 *   minAmount: 5,
 *   expectedUnit: 'usd',
 * });
 * 
 * if (!result.valid) {
 *   console.error('Token validation failed:', result.errors);
 * }
 * ```
 */
export function validateToken(
  token: string,
  options: ValidateTokenOptions = {}
): TokenValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let info: TokenInfo | undefined;

  // Try to parse the token
  try {
    info = inspectToken(token);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof TokenParseError ? error.message : 'Failed to parse token'],
      warnings: [],
    };
  }

  // Validate mint
  if (options.expectedMint) {
    const normalizedExpected = options.expectedMint.replace(/\/+$/, '');
    const normalizedActual = info.mint.replace(/\/+$/, '');
    
    if (normalizedActual !== normalizedExpected) {
      errors.push(
        `Token is for wrong mint: expected "${normalizedExpected}", got "${normalizedActual}"`
      );
    }
  }

  // Validate unit
  if (options.expectedUnit && info.unit && info.unit !== options.expectedUnit) {
    errors.push(
      `Token has wrong unit: expected "${options.expectedUnit}", got "${info.unit}"`
    );
  }

  // Warn if unit is missing when expected
  if (options.expectedUnit && !info.unit) {
    warnings.push(`Token does not specify unit (expected "${options.expectedUnit}")`);
  }

  // Validate amount
  if (options.exactAmount !== undefined && info.amount !== options.exactAmount) {
    errors.push(
      `Token amount mismatch: expected ${options.exactAmount}, got ${info.amount}`
    );
  }

  if (options.minAmount !== undefined && info.amount < options.minAmount) {
    errors.push(
      `Token amount too low: minimum ${options.minAmount}, got ${info.amount}`
    );
  }

  if (options.maxAmount !== undefined && info.amount > options.maxAmount) {
    errors.push(
      `Token amount too high: maximum ${options.maxAmount}, got ${info.amount}`
    );
  }

  // Additional warnings
  if (!info.mint) {
    warnings.push('Token does not specify a mint URL');
  }

  return {
    valid: errors.length === 0,
    info,
    errors,
    warnings,
  };
}

/**
 * Get the total amount in a token.
 * 
 * Convenience function for quickly checking token value.
 * 
 * @param token - Encoded Cashu token
 * @returns Total amount
 * @throws TokenParseError if token is malformed
 * 
 * @example
 * ```ts
 * const amount = getTokenAmount('cashuB...');
 * if (amount < price) {
 *   console.error('Token amount insufficient');
 * }
 * ```
 */
export function getTokenAmount(token: string): number {
  return inspectToken(token).amount;
}

/**
 * Get the mint URL from a token.
 * 
 * Convenience function for quickly checking which mint a token is for.
 * 
 * @param token - Encoded Cashu token
 * @returns Mint URL
 * @throws TokenParseError if token is malformed
 * 
 * @example
 * ```ts
 * const mint = getTokenMint('cashuB...');
 * if (mint !== expectedMint) {
 *   console.error('Token is for wrong mint');
 * }
 * ```
 */
export function getTokenMint(token: string): string {
  return inspectToken(token).mint;
}

/**
 * Get the proofs from a token without swapping.
 * 
 * Returns the raw proofs for advanced inspection.
 * Note: These proofs should NOT be added to a wallet directly -
 * use wallet.receiveToken() to properly swap them.
 * 
 * @param token - Encoded Cashu token
 * @returns Array of proofs
 * @throws TokenParseError if token is malformed
 */
export function getTokenProofs(token: string): Proof[] {
  return inspectToken(token).proofs;
}

/**
 * Check if a string looks like a valid Cashu token format.
 * 
 * Quick check without full parsing - useful for input validation.
 * 
 * @param maybeToken - String to check
 * @returns true if string looks like a token
 * 
 * @example
 * ```ts
 * if (isTokenFormat(userInput)) {
 *   // Proceed with full validation
 *   const result = validateToken(userInput);
 * }
 * ```
 */
export function isTokenFormat(maybeToken: unknown): maybeToken is string {
  if (typeof maybeToken !== 'string') {
    return false;
  }
  
  // Must start with cashuA or cashuB and have reasonable length
  return (
    (maybeToken.startsWith('cashuA') || maybeToken.startsWith('cashuB')) &&
    maybeToken.length > 20
  );
}

/**
 * Summarize a token for display/logging (truncated, safe).
 * 
 * @param token - Encoded Cashu token
 * @returns Human-readable summary
 * 
 * @example
 * ```ts
 * console.log(summarizeToken('cashuB...'));
 * // "cashuB token: 5 usd (3 proofs) from mint.wavlake.com"
 * ```
 */
export function summarizeToken(token: string): string {
  try {
    const info = inspectToken(token);
    const version = info.version === 4 ? 'cashuB' : 'cashuA';
    const unit = info.unit || 'credits';
    const mintDomain = info.mint ? new URL(info.mint).hostname : 'unknown mint';
    
    return `${version} token: ${info.amount} ${unit} (${info.proofCount} proof${info.proofCount !== 1 ? 's' : ''}) from ${mintDomain}`;
  } catch (error) {
    return `Invalid token: ${error instanceof Error ? error.message : 'parse error'}`;
  }
}
