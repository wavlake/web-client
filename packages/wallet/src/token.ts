/**
 * Token utilities
 * 
 * Helpers for parsing and validating Cashu tokens.
 */

import { getDecodedToken, type Token } from '@cashu/cashu-ts';

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
 * @param tokenStr - Cashu token string (cashuA or cashuB format)
 * @returns Validation result with token info if valid
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
  // Basic format check
  if (!tokenStr || typeof tokenStr !== 'string') {
    return { valid: false, error: 'Token must be a non-empty string' };
  }

  const trimmed = tokenStr.trim();
  
  // Check prefix
  if (!trimmed.startsWith('cashuA') && !trimmed.startsWith('cashuB')) {
    return { valid: false, error: 'Token must start with cashuA or cashuB' };
  }

  try {
    const token = getDecodedToken(trimmed);
    const info = extractTokenInfo(token, trimmed);
    return { valid: true, info };
  } catch (err) {
    return { 
      valid: false, 
      error: err instanceof Error ? err.message : 'Failed to decode token',
    };
  }
}

/**
 * Parse a token without validation (for quick inspection)
 * Throws if token is invalid.
 * 
 * @param tokenStr - Cashu token string
 * @returns Token information
 * @throws Error if token cannot be parsed
 * 
 * @example
 * ```ts
 * try {
 *   const info = parseToken('cashuBpXh...');
 *   console.log('Mint:', info.mint);
 * } catch (err) {
 *   console.error('Invalid token');
 * }
 * ```
 */
export function parseToken(tokenStr: string): TokenInfo {
  const result = validateToken(tokenStr);
  if (!result.valid) {
    throw new Error(result.error || 'Invalid token');
  }
  return result.info!;
}

/**
 * Check if a string looks like a Cashu token
 * (Quick check without full validation)
 * 
 * @param str - String to check
 * @returns true if the string starts with cashuA or cashuB
 * 
 * @example
 * ```ts
 * if (looksLikeToken(userInput)) {
 *   const result = validateToken(userInput);
 *   // ...
 * }
 * ```
 */
export function looksLikeToken(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
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
 * Extract token info from decoded token
 * Handles multiple token formats (V3, V4, raw V4)
 */
function extractTokenInfo(token: Token, original: string): TokenInfo {
  const version: 3 | 4 = original.startsWith('cashuB') ? 4 : 3;
  const tokenAny = token as any;
  
  // Modern format (both V3 decoded and V4) - has direct mint/proofs
  if ('mint' in token && 'proofs' in token) {
    const mint = tokenAny.mint;
    const unit = tokenAny.unit;
    const proofs = tokenAny.proofs || [];
    const amount = proofs.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const memo = tokenAny.memo;
    
    return { version, mint, unit, amount, proofCount: proofs.length, memo };
  }
  
  // V4 raw format (with 't' array and 'm' mint)
  if ('t' in token) {
    const mint = tokenAny.m;
    const unit = tokenAny.u;
    const memo = tokenAny.d;
    
    // Sum up proofs from all token entries
    let amount = 0;
    let proofCount = 0;
    for (const entry of tokenAny.t || []) {
      for (const proof of entry.p || []) {
        amount += proof.a || 0;
        proofCount++;
      }
    }

    return { version: 4, mint, unit, amount, proofCount, memo };
  }
  
  // V3 legacy format (with 'token' array)
  const firstEntry = tokenAny.token?.[0];
  const mint = firstEntry?.mint || '';
  const proofs = firstEntry?.proofs || [];
  const amount = proofs.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const memo = tokenAny.memo;

  return { 
    version: 3, 
    mint, 
    amount, 
    proofCount: proofs.length,
    memo,
  };
}
