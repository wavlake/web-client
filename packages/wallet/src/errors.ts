/**
 * Wallet Error Classes
 * 
 * Custom error types for wallet operations with structured diagnostics.
 */

import type { Proof } from '@cashu/cashu-ts';

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
   * Get the shortfall (negative if sufficient balance)
   */
  get shortfall(): number {
    return Math.max(0, this.requestedAmount - this.availableBalance);
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

/**
 * Generate a helpful suggestion based on error context
 */
export function generateSuggestion(code: TokenCreationErrorCode, context: {
  requestedAmount: number;
  availableBalance: number;
  availableDenominations: number[];
}): string | undefined {
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
      const maxDenom = Math.max(...availableDenominations);
      // Check if all proofs are too large (single large denomination)
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
    default:
      return undefined;
  }
}
