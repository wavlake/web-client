/**
 * Token utilities
 * 
 * Helpers for parsing and validating Cashu tokens.
 */

import { getDecodedToken } from '@cashu/cashu-ts';
import type { Token } from '@cashu/cashu-ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Token info extracted from a cashu token
 */
export interface TokenInfo {
  /** Token version (3 or 4) */
  version: 3 | 4;
  /** Mint URL */
  mint: string;
  /** Unit (e.g., 'sat', 'usd') */
  unit?: string;
  /** Total amount in the token */
  amount: number;
  /** Number of proofs in the token */
  proofCount: number;
  /** Memo if present */
  memo?: string;
}

/**
 * Token validation result
 */
export interface TokenValidation {
  /** Whether the token is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Token info if valid */
  info?: TokenInfo;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Parse and validate a Cashu token string
 * 
 * @example
 * ```ts
 * const result = validateToken('cashuBpXh...');
 * if (result.valid) {
 *   console.log('Amount:', result.info.amount);
 *   console.log('Mint:', result.info.mint);
 * } else {
 *   console.error('Invalid:', result.error);
 * }
 * ```
 */
export function validateToken(tokenStr: string): TokenValidation {
  try {
    const info = parseToken(tokenStr);
    return {
      valid: true,
      info,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse a token without validation (for quick inspection)
 * Throws if token is invalid.
 * 
 * @param tokenStr - Cashu token string (cashuA or cashuB format)
 * @returns Token information
 * @throws Error if token cannot be parsed
 */
export function parseToken(tokenStr: string): TokenInfo {
  if (!tokenStr || typeof tokenStr !== 'string') {
    throw new Error('Token must be a non-empty string');
  }

  const trimmed = tokenStr.trim();
  
  // Detect version from prefix
  const version = detectVersion(trimmed);
  if (!version) {
    throw new Error('Invalid token format: must start with cashuA or cashuB');
  }

  // Decode the token
  let decoded: Token;
  try {
    decoded = getDecodedToken(trimmed);
  } catch (decodeError) {
    throw new Error(`Failed to decode token: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
  }

  // Extract mint URL
  const mint = decoded.mint;
  if (!mint) {
    throw new Error('Token has no mint URL');
  }

  // Extract proofs
  const proofs = decoded.proofs || [];
  if (proofs.length === 0) {
    throw new Error('Token has no proofs');
  }

  // Calculate total amount
  const amount = proofs.reduce((sum, p) => sum + p.amount, 0);

  return {
    version,
    mint,
    unit: decoded.unit,
    amount,
    proofCount: proofs.length,
    memo: decoded.memo,
  };
}

/**
 * Check if a string looks like a Cashu token
 * (Quick check without full validation)
 * 
 * @param str - String to check
 * @returns true if the string starts with cashuA or cashuB
 */
export function looksLikeToken(str: string): boolean {
  if (!str || typeof str !== 'string') {
    return false;
  }
  const trimmed = str.trim();
  return trimmed.startsWith('cashuA') || trimmed.startsWith('cashuB');
}

/**
 * Get the mint URL from a token string
 * 
 * @param tokenStr - Cashu token string
 * @returns Mint URL or null if token is invalid
 */
export function getTokenMint(tokenStr: string): string | null {
  try {
    const info = parseToken(tokenStr);
    return info.mint;
  } catch {
    return null;
  }
}

/**
 * Get the amount from a token string
 * 
 * @param tokenStr - Cashu token string
 * @returns Total amount in the token or null if invalid
 */
export function getTokenAmount(tokenStr: string): number | null {
  try {
    const info = parseToken(tokenStr);
    return info.amount;
  } catch {
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect token version from prefix
 */
function detectVersion(tokenStr: string): 3 | 4 | null {
  if (tokenStr.startsWith('cashuA')) {
    return 3;
  }
  if (tokenStr.startsWith('cashuB')) {
    return 4;
  }
  return null;
}
