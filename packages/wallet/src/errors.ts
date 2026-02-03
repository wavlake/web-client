/**
 * Wallet Error Classes
 * 
 * Custom error classes for wallet-specific errors with user-friendly messages
 * and recovery suggestions.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Wallet error codes
 */
export type WalletErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_AMOUNT'
  | 'PROOF_SELECTION_FAILED'
  | 'MINT_MISMATCH'
  | 'EMPTY_TOKEN'
  | 'INVALID_TOKEN'
  | 'WALLET_NOT_LOADED'
  | 'STORAGE_ERROR'
  | 'MINT_ERROR'
  | 'SWAP_FAILED'
  | 'PROOF_CHECK_FAILED';

/**
 * Error details for wallet errors
 */
export interface WalletErrorDetails {
  /** Required amount (for balance errors) */
  required?: number;
  /** Available balance */
  available?: number;
  /** Expected mint URL */
  expectedMint?: string;
  /** Actual mint URL from token */
  actualMint?: string;
  /** Original error if wrapping */
  cause?: Error;
}

/**
 * Serializable wallet error info
 */
export interface WalletErrorInfo {
  code: WalletErrorCode;
  message: string;
  details: WalletErrorDetails;
}

// ============================================================================
// WalletError Class
// ============================================================================

/**
 * Error thrown for wallet-specific errors.
 * 
 * Provides user-friendly messages and recovery suggestions.
 * 
 * @example
 * ```ts
 * try {
 *   await wallet.createToken(100);
 * } catch (err) {
 *   if (WalletError.isInsufficientBalance(err)) {
 *     console.log(err.userMessage); // "You need 50 more credits"
 *     console.log(err.recoverySuggestion); // "Add more credits to your wallet"
 *   }
 * }
 * ```
 */
export class WalletError extends Error {
  readonly code: WalletErrorCode;
  readonly details: WalletErrorDetails;

  constructor(info: WalletErrorInfo) {
    super(info.message);
    this.name = 'WalletError';
    this.code = info.code;
    this.details = info.details;

    // Maintains proper stack trace in V8 environments
    if ('captureStackTrace' in Error) {
      (Error as { captureStackTrace: (target: object, constructor: Function) => void })
        .captureStackTrace(this, WalletError);
    }
  }

  // ===========================================================================
  // Type Guards
  // ===========================================================================

  /**
   * Check if an error is a WalletError
   */
  static isWalletError(error: unknown): error is WalletError {
    return error instanceof WalletError;
  }

  /**
   * Check if error is an insufficient balance error
   */
  static isInsufficientBalance(error: unknown): error is WalletError {
    return error instanceof WalletError && error.code === 'INSUFFICIENT_BALANCE';
  }

  /**
   * Check if error is an invalid amount error
   */
  static isInvalidAmount(error: unknown): error is WalletError {
    return error instanceof WalletError && error.code === 'INVALID_AMOUNT';
  }

  /**
   * Check if error is a mint mismatch error
   */
  static isMintMismatch(error: unknown): error is WalletError {
    return error instanceof WalletError && error.code === 'MINT_MISMATCH';
  }

  /**
   * Check if error is a wallet not loaded error
   */
  static isNotLoaded(error: unknown): error is WalletError {
    return error instanceof WalletError && error.code === 'WALLET_NOT_LOADED';
  }

  /**
   * Check if error is recoverable by user action
   */
  static isRecoverable(error: unknown): error is WalletError {
    if (!(error instanceof WalletError)) return false;
    return [
      'INSUFFICIENT_BALANCE',
      'INVALID_AMOUNT',
      'WALLET_NOT_LOADED',
    ].includes(error.code);
  }

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  /**
   * Create an insufficient balance error
   */
  static insufficientBalance(required: number, available: number): WalletError {
    return new WalletError({
      code: 'INSUFFICIENT_BALANCE',
      message: `Insufficient balance: need ${required}, have ${available}`,
      details: { required, available },
    });
  }

  /**
   * Create an invalid amount error
   */
  static invalidAmount(amount: number, reason?: string): WalletError {
    const msg = reason 
      ? `Invalid amount ${amount}: ${reason}`
      : `Amount must be positive, got ${amount}`;
    return new WalletError({
      code: 'INVALID_AMOUNT',
      message: msg,
      details: { required: amount },
    });
  }

  /**
   * Create a proof selection failed error
   */
  static proofSelectionFailed(amount: number, available: number): WalletError {
    return new WalletError({
      code: 'PROOF_SELECTION_FAILED',
      message: `Could not select proofs for amount ${amount}`,
      details: { required: amount, available },
    });
  }

  /**
   * Create a mint mismatch error
   */
  static mintMismatch(expected: string, actual: string): WalletError {
    return new WalletError({
      code: 'MINT_MISMATCH',
      message: `Token is for different mint: ${actual}`,
      details: { expectedMint: expected, actualMint: actual },
    });
  }

  /**
   * Create an empty token error
   */
  static emptyToken(): WalletError {
    return new WalletError({
      code: 'EMPTY_TOKEN',
      message: 'Token contains no proofs',
      details: {},
    });
  }

  /**
   * Create an invalid token error
   */
  static invalidToken(reason: string, cause?: Error): WalletError {
    return new WalletError({
      code: 'INVALID_TOKEN',
      message: `Invalid token: ${reason}`,
      details: { cause },
    });
  }

  /**
   * Create a wallet not loaded error
   */
  static notLoaded(): WalletError {
    return new WalletError({
      code: 'WALLET_NOT_LOADED',
      message: 'Wallet must be loaded before performing operations',
      details: {},
    });
  }

  /**
   * Create a storage error
   */
  static storageError(operation: string, cause?: Error): WalletError {
    return new WalletError({
      code: 'STORAGE_ERROR',
      message: `Storage ${operation} failed: ${cause?.message || 'unknown error'}`,
      details: { cause },
    });
  }

  /**
   * Create a mint communication error
   */
  static mintError(operation: string, cause?: Error): WalletError {
    return new WalletError({
      code: 'MINT_ERROR',
      message: `Mint ${operation} failed: ${cause?.message || 'unknown error'}`,
      details: { cause },
    });
  }

  /**
   * Create a swap failed error
   */
  static swapFailed(amount: number, cause?: Error): WalletError {
    return new WalletError({
      code: 'SWAP_FAILED',
      message: `Failed to swap proofs for ${amount}: ${cause?.message || 'unknown error'}`,
      details: { required: amount, cause },
    });
  }

  // ===========================================================================
  // User-Friendly Messages
  // ===========================================================================

  /**
   * Get a user-friendly error message suitable for display
   */
  get userMessage(): string {
    return getUserFriendlyMessage(this.code, this.details);
  }

  /**
   * Get a suggested recovery action
   */
  get recoverySuggestion(): string | undefined {
    return getRecoverySuggestion(this.code);
  }

  /**
   * Check if this error is recoverable (user can take action)
   */
  get isRecoverable(): boolean {
    return WalletError.isRecoverable(this);
  }

  /**
   * Get the shortfall amount for balance errors
   */
  get shortfall(): number | undefined {
    if (this.code !== 'INSUFFICIENT_BALANCE') return undefined;
    const { required, available } = this.details;
    if (required === undefined || available === undefined) return undefined;
    return required - available;
  }

  /**
   * Serialize error to plain object
   */
  toJSON(): WalletErrorInfo {
    return {
      code: this.code,
      message: this.message,
      details: {
        required: this.details.required,
        available: this.details.available,
        expectedMint: this.details.expectedMint,
        actualMint: this.details.actualMint,
        // Don't serialize cause Error object
      },
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a user-friendly message for an error code
 */
function getUserFriendlyMessage(
  code: WalletErrorCode,
  details: WalletErrorDetails
): string {
  switch (code) {
    case 'INSUFFICIENT_BALANCE': {
      const { required, available } = details;
      if (required !== undefined && available !== undefined) {
        const needed = required - available;
        return `You need ${needed} more credit${needed === 1 ? '' : 's'}`;
      }
      return 'Not enough credits in your wallet';
    }

    case 'INVALID_AMOUNT':
      return 'Please enter a valid amount';

    case 'PROOF_SELECTION_FAILED':
      if (details.required) {
        return `Could not find the right combination of credits for ${details.required}`;
      }
      return 'Could not prepare payment';

    case 'MINT_MISMATCH':
      if (details.expectedMint) {
        return `This token is from the wrong mint`;
      }
      return 'Token mint does not match your wallet';

    case 'EMPTY_TOKEN':
      return 'This token is empty';

    case 'INVALID_TOKEN':
      return 'This token is invalid or corrupted';

    case 'WALLET_NOT_LOADED':
      return 'Wallet is still loading. Please wait.';

    case 'STORAGE_ERROR':
      return 'Failed to save wallet data. Please try again.';

    case 'MINT_ERROR':
      return 'Could not connect to the mint. Please check your connection.';

    case 'SWAP_FAILED':
      return 'Payment preparation failed. Please try again.';

    case 'PROOF_CHECK_FAILED':
      return 'Could not verify wallet status';

    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Get a recovery suggestion for an error code
 */
function getRecoverySuggestion(code: WalletErrorCode): string | undefined {
  switch (code) {
    case 'INSUFFICIENT_BALANCE':
      return 'Add more credits to your wallet';

    case 'INVALID_AMOUNT':
      return 'Enter an amount greater than zero';

    case 'PROOF_SELECTION_FAILED':
      return 'Try a different amount or add more credits';

    case 'MINT_MISMATCH':
      return 'Use tokens from the correct mint';

    case 'WALLET_NOT_LOADED':
      return 'Wait for the wallet to finish loading';

    case 'STORAGE_ERROR':
      return 'Check your storage permissions and try again';

    case 'MINT_ERROR':
      return 'Check your internet connection and try again';

    case 'SWAP_FAILED':
      return 'Wait a moment and try again';

    default:
      return undefined;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wrap an error in a WalletError if it isn't already one
 */
export function toWalletError(error: unknown, fallbackCode: WalletErrorCode = 'MINT_ERROR'): WalletError {
  if (error instanceof WalletError) {
    return error;
  }

  const cause = error instanceof Error ? error : new Error(String(error));
  return new WalletError({
    code: fallbackCode,
    message: cause.message,
    details: { cause },
  });
}

/**
 * Check if an error indicates the wallet needs more funds
 */
export function needsMoreFunds(error: unknown): boolean {
  return (
    WalletError.isInsufficientBalance(error) ||
    (error instanceof WalletError && error.code === 'PROOF_SELECTION_FAILED')
  );
}
