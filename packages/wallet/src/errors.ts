/**
 * Wallet Error Classes
 *
 * Custom error types for wallet operations with structured diagnostics.
 * Modeled after @wavlake/paywall-client error patterns for consistency.
 */

import type { Proof } from '@cashu/cashu-ts';

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for token creation failures
 */
export type TokenCreationErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'SELECTION_FAILED'
  | 'INVALID_AMOUNT'
  | 'WALLET_NOT_LOADED'
  | 'SWAP_FAILED';

/**
 * Error codes for wallet operations
 */
export type WalletErrorCode =
  | 'MINT_UNREACHABLE'
  | 'LOAD_FAILED'
  | 'SAVE_FAILED'
  | 'INVALID_TOKEN'
  | 'MINT_MISMATCH'
  | 'RECEIVE_FAILED';

// ============================================================================
// Token Creation Error
// ============================================================================

/**
 * Detailed context for token creation failures
 */
export interface TokenCreationErrorContext {
  /** Error code for programmatic handling */
  code: TokenCreationErrorCode;
  /** Amount that was requested */
  requestedAmount: number;
  /** Current wallet balance */
  availableBalance: number;
  /** Denominations available in wallet (sorted ascending) */
  availableDenominations: number[];
  /** Count of proofs by denomination */
  denominationCounts: Record<number, number>;
  /** Proofs that were selected (if any) before failure */
  selectedProofs?: Proof[];
  /** Total value of selected proofs */
  selectedTotal?: number;
  /** Actionable suggestion for the user */
  suggestion?: string;
}

/**
 * Error thrown when token creation fails.
 *
 * Provides detailed context about why the creation failed,
 * enabling better error messages and recovery strategies.
 *
 * @example
 * ```ts
 * try {
 *   await wallet.createToken(100);
 * } catch (err) {
 *   if (TokenCreationError.isTokenCreationError(err)) {
 *     console.log('Code:', err.code);
 *     console.log('Have:', err.availableBalance, 'Need:', err.requestedAmount);
 *     console.log('Suggestion:', err.suggestion);
 *   }
 * }
 * ```
 */
export class TokenCreationError extends Error {
  /** Error code for programmatic handling */
  readonly code: TokenCreationErrorCode;
  /** Amount that was requested */
  readonly requestedAmount: number;
  /** Current wallet balance */
  readonly availableBalance: number;
  /** Denominations available in wallet */
  readonly availableDenominations: number[];
  /** Count of proofs by denomination */
  readonly denominationCounts: Record<number, number>;
  /** Proofs that were selected before failure */
  readonly selectedProofs?: Proof[];
  /** Total value of selected proofs */
  readonly selectedTotal?: number;
  /** Actionable suggestion for recovery */
  readonly suggestion?: string;

  constructor(message: string, context: TokenCreationErrorContext) {
    super(message);
    this.name = 'TokenCreationError';
    this.code = context.code;
    this.requestedAmount = context.requestedAmount;
    this.availableBalance = context.availableBalance;
    this.availableDenominations = context.availableDenominations;
    this.denominationCounts = context.denominationCounts;
    this.selectedProofs = context.selectedProofs;
    this.selectedTotal = context.selectedTotal;
    this.suggestion = context.suggestion;

    // Maintains proper stack trace in V8 environments
    if ('captureStackTrace' in Error) {
      (Error as { captureStackTrace: (target: object, constructor: Function) => void })
        .captureStackTrace(this, TokenCreationError);
    }
  }

  /**
   * Type guard to check if an error is a TokenCreationError
   */
  static isTokenCreationError(error: unknown): error is TokenCreationError {
    return error instanceof TokenCreationError;
  }

  /**
   * Check if the error is due to insufficient balance
   */
  static isInsufficientBalance(error: unknown): error is TokenCreationError {
    return error instanceof TokenCreationError && error.code === 'INSUFFICIENT_BALANCE';
  }

  /**
   * Check if the error is due to selection failure (can't build exact amount)
   */
  static isSelectionFailed(error: unknown): error is TokenCreationError {
    return error instanceof TokenCreationError && error.code === 'SELECTION_FAILED';
  }

  /**
   * Check if the error is due to invalid amount (zero or negative)
   */
  static isInvalidAmount(error: unknown): error is TokenCreationError {
    return error instanceof TokenCreationError && error.code === 'INVALID_AMOUNT';
  }

  /**
   * Get a user-friendly message suitable for display
   */
  get userMessage(): string {
    switch (this.code) {
      case 'INSUFFICIENT_BALANCE': {
        const needed = this.requestedAmount - this.availableBalance;
        return `Need ${needed} more credit${needed === 1 ? '' : 's'} (have ${this.availableBalance}, need ${this.requestedAmount})`;
      }
      case 'SELECTION_FAILED':
        return `Cannot create exact amount of ${this.requestedAmount} from available proofs`;
      case 'INVALID_AMOUNT':
        return 'Amount must be a positive number';
      case 'WALLET_NOT_LOADED':
        return 'Wallet must be loaded before creating tokens';
      case 'SWAP_FAILED':
        return 'Failed to swap proofs for exact amount';
      default:
        return this.message;
    }
  }

  /**
   * Get the shortfall (0 if sufficient balance)
   */
  get shortfall(): number {
    return Math.max(0, this.requestedAmount - this.availableBalance);
  }

  /**
   * Check if this error is recoverable by adding funds
   */
  get isRecoverable(): boolean {
    return this.code === 'INSUFFICIENT_BALANCE';
  }

  /**
   * Serialize error for logging/debugging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      requestedAmount: this.requestedAmount,
      availableBalance: this.availableBalance,
      availableDenominations: this.availableDenominations,
      denominationCounts: this.denominationCounts,
      selectedTotal: this.selectedTotal,
      suggestion: this.suggestion,
      shortfall: this.shortfall,
    };
  }
}

// ============================================================================
// Wallet Error
// ============================================================================

/**
 * Context for general wallet operation failures
 */
export interface WalletErrorContext {
  /** Error code for programmatic handling */
  code: WalletErrorCode;
  /** Mint URL involved in the operation */
  mintUrl?: string;
  /** Additional details specific to the error */
  details?: Record<string, unknown>;
}

/**
 * Error thrown when wallet operations fail.
 *
 * @example
 * ```ts
 * try {
 *   await wallet.load();
 * } catch (err) {
 *   if (WalletError.isWalletError(err)) {
 *     console.log('Code:', err.code);
 *     console.log('Recovery:', err.recoverySuggestion);
 *   }
 * }
 * ```
 */
export class WalletError extends Error {
  /** Error code for programmatic handling */
  readonly code: WalletErrorCode;
  /** Mint URL involved in the operation */
  readonly mintUrl?: string;
  /** Additional details */
  readonly details?: Record<string, unknown>;

  constructor(message: string, context: WalletErrorContext) {
    super(message);
    this.name = 'WalletError';
    this.code = context.code;
    this.mintUrl = context.mintUrl;
    this.details = context.details;

    if ('captureStackTrace' in Error) {
      (Error as { captureStackTrace: (target: object, constructor: Function) => void })
        .captureStackTrace(this, WalletError);
    }
  }

  /**
   * Type guard to check if an error is a WalletError
   */
  static isWalletError(error: unknown): error is WalletError {
    return error instanceof WalletError;
  }

  /**
   * Check if error is a mint unreachable error
   */
  static isMintUnreachable(error: unknown): error is WalletError {
    return error instanceof WalletError && error.code === 'MINT_UNREACHABLE';
  }

  /**
   * Check if error is a mint mismatch error
   */
  static isMintMismatch(error: unknown): error is WalletError {
    return error instanceof WalletError && error.code === 'MINT_MISMATCH';
  }

  /**
   * Get a user-friendly message suitable for display
   */
  get userMessage(): string {
    switch (this.code) {
      case 'MINT_UNREACHABLE':
        return 'Cannot connect to the mint. Check your internet connection.';
      case 'LOAD_FAILED':
        return 'Failed to load wallet data.';
      case 'SAVE_FAILED':
        return 'Failed to save wallet data.';
      case 'INVALID_TOKEN':
        return 'The token is invalid or corrupted.';
      case 'MINT_MISMATCH':
        return this.mintUrl 
          ? `Token is for a different mint (expected ${this.mintUrl})` 
          : 'Token is for a different mint.';
      case 'RECEIVE_FAILED':
        return 'Failed to receive token.';
      default:
        return this.message;
    }
  }

  /**
   * Get a suggested recovery action
   */
  get recoverySuggestion(): string | undefined {
    switch (this.code) {
      case 'MINT_UNREACHABLE':
        return 'Wait a moment and try again, or check if the mint is online.';
      case 'LOAD_FAILED':
        return 'Try reloading the page. If the problem persists, clear wallet data.';
      case 'SAVE_FAILED':
        return 'Check storage permissions and available space.';
      case 'INVALID_TOKEN':
        return 'Request a new token from the sender.';
      case 'MINT_MISMATCH':
        return 'Get a token from the correct mint.';
      case 'RECEIVE_FAILED':
        return 'The token may have already been claimed. Request a new one.';
      default:
        return undefined;
    }
  }

  /**
   * Check if this error is recoverable (user can take action)
   */
  get isRecoverable(): boolean {
    return ['MINT_UNREACHABLE', 'MINT_MISMATCH'].includes(this.code);
  }

  /**
   * Serialize error for logging/debugging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      mintUrl: this.mintUrl,
      details: this.details,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a helpful suggestion based on error context
 */
export function generateTokenCreationSuggestion(
  code: TokenCreationErrorCode,
  context: {
    requestedAmount: number;
    availableBalance: number;
    availableDenominations: number[];
  }
): string | undefined {
  const { requestedAmount, availableBalance, availableDenominations } = context;

  switch (code) {
    case 'INSUFFICIENT_BALANCE': {
      const needed = requestedAmount - availableBalance;
      if (availableBalance === 0) {
        return `Wallet is empty. Add at least ${requestedAmount} credits to continue.`;
      }
      return `Add ${needed} more credit${needed === 1 ? '' : 's'} to your wallet.`;
    }

    case 'SELECTION_FAILED': {
      if (availableDenominations.length === 0) {
        return 'Wallet is empty. Add credits to continue.';
      }
      const minDenom = Math.min(...availableDenominations);
      // Check if all proofs are too large
      if (availableDenominations.length === 1 && minDenom > requestedAmount) {
        return `Only have ${minDenom}-credit proofs. A swap will break these into smaller denominations.`;
      }
      // Check if requested amount is smaller than smallest denomination
      if (requestedAmount < minDenom) {
        return `Smallest available denomination is ${minDenom}. Try requesting at least ${minDenom} credits.`;
      }
      return 'Try a different amount or consolidate your proofs.';
    }

    case 'INVALID_AMOUNT':
      return 'Provide a positive number for the amount.';

    case 'WALLET_NOT_LOADED':
      return 'Call wallet.load() before creating tokens.';

    case 'SWAP_FAILED':
      return 'The mint may be temporarily unavailable. Try again in a moment.';

    default:
      return undefined;
  }
}

/**
 * Build error context for token creation errors
 */
export function buildTokenErrorContext(
  code: TokenCreationErrorCode,
  requestedAmount: number,
  proofs: Proof[],
  selectedProofs?: Proof[]
): TokenCreationErrorContext {
  const availableBalance = proofs.reduce((sum, p) => sum + p.amount, 0);
  
  // Calculate denominations and counts
  const denominationCounts: Record<number, number> = {};
  for (const proof of proofs) {
    denominationCounts[proof.amount] = (denominationCounts[proof.amount] || 0) + 1;
  }
  const availableDenominations = Object.keys(denominationCounts)
    .map(Number)
    .sort((a, b) => a - b);

  const selectedTotal = selectedProofs?.reduce((sum, p) => sum + p.amount, 0);

  const suggestion = generateTokenCreationSuggestion(code, {
    requestedAmount,
    availableBalance,
    availableDenominations,
  });

  return {
    code,
    requestedAmount,
    availableBalance,
    availableDenominations,
    denominationCounts,
    selectedProofs,
    selectedTotal,
    suggestion,
  };
}

/**
 * Check if an error is any wallet-related error
 */
export function isWalletRelatedError(error: unknown): error is TokenCreationError | WalletError {
  return TokenCreationError.isTokenCreationError(error) || WalletError.isWalletError(error);
}

/**
 * Get user-friendly message from any wallet error
 */
export function getUserMessage(error: unknown): string {
  if (TokenCreationError.isTokenCreationError(error)) {
    return error.userMessage;
  }
  if (WalletError.isWalletError(error)) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

/**
 * Get recovery suggestion from any wallet error
 */
export function getRecoverySuggestion(error: unknown): string | undefined {
  if (TokenCreationError.isTokenCreationError(error)) {
    return error.suggestion;
  }
  if (WalletError.isWalletError(error)) {
    return error.recoverySuggestion;
  }
  return undefined;
}
