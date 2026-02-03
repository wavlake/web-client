/**
 * Wavlake Wallet Types
 * 
 * Core interfaces for wallet state management.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { Logger } from './logger.js';
import type { TransactionRecord } from './history.js';
import type { StorageAdapter } from './storage/interface.js';

// Re-export Proof type for convenience
export type { Proof } from '@cashu/cashu-ts';
export type { Logger, LogEntry, LogLevel } from './logger.js';
export type { TransactionRecord } from './history.js';

// ============================================================================
// Storage Types
// ============================================================================

// Re-export StorageAdapter from the storage module (includes optional history methods)
export type { StorageAdapter } from './storage/interface.js';

/**
 * AsyncStorage interface (React Native compatible)
 */
export interface AsyncStorageStatic {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// ============================================================================
// Selector Types
// ============================================================================

/**
 * Proof selector function type.
 * Takes available proofs and target amount, returns proofs to use or null if insufficient.
 */
export type ProofSelector = (proofs: Proof[], amount: number) => Proof[] | null;

/**
 * Available proof selection strategies
 */
export interface ProofSelectors {
  /** Select smallest proofs first to minimize change */
  smallestFirst: ProofSelector;
  /** Select largest proofs first to minimize proof count */
  largestFirst: ProofSelector;
  /** Try to find exact match first, then fall back to smallestFirst */
  exactMatch: ProofSelector;
  /** Random selection for privacy */
  random: ProofSelector;
}

// ============================================================================
// Wallet Types
// ============================================================================

/**
 * Wallet configuration options
 */
export interface WalletConfig {
  /** Cashu mint URL */
  mintUrl: string;
  /** Storage adapter for persisting proofs */
  storage: StorageAdapter;
  /** Proof selection strategy (default: smallestFirst) */
  proofSelector?: ProofSelector;
  /** Automatically receive change tokens (default: true) */
  autoReceiveChange?: boolean;
  /** Unit for the wallet (default: 'usd') */
  unit?: string;
  /** Enable debug logging (true for console, or provide custom Logger) */
  debug?: boolean | Logger;
  /** Record transaction history (default: true) */
  recordHistory?: boolean;
}

/**
 * Result from checking proof state
 */
export interface CheckProofsResult {
  /** Proofs that are still valid/unspent */
  valid: Proof[];
  /** Proofs that have been spent */
  spent: Proof[];
}

/**
 * Mint quote for funding the wallet
 */
export interface MintQuote {
  /** Quote ID */
  id: string;
  /** Lightning invoice to pay */
  request: string;
  /** Amount in credits */
  amount: number;
  /** Quote expiry timestamp */
  expiry?: number;
  /** Whether the quote has been paid */
  paid?: boolean;
}

/**
 * Wallet event types
 */
export type WalletEventType = 'balance-change' | 'proofs-change' | 'transaction' | 'error';

/**
 * Wallet event handlers
 */
export interface WalletEventHandlers {
  'balance-change': (balance: number) => void;
  'proofs-change': (proofs: Proof[]) => void;
  'transaction': (tx: TransactionRecord) => void;
  'error': (error: Error) => void;
}

/**
 * Token creation result
 */
export interface CreateTokenResult {
  /** Encoded token (cashuB format) */
  token: string;
  /** Proofs included in token */
  proofs: Proof[];
  /** Remaining proofs after token creation */
  change: Proof[];
}

/**
 * Preview of token creation without modifying wallet state.
 * 
 * Use `wallet.previewToken(amount)` to get this information
 * before committing to token creation.
 */
export interface TokenPreview {
  /** Whether the token can be created */
  canCreate: boolean;
  /** Requested amount */
  amount: number;
  /** Current wallet balance */
  availableBalance: number;
  /** Available denominations in wallet (sorted ascending) */
  availableDenominations: number[];
  /** Count of proofs by denomination */
  denominationCounts: Record<number, number>;
  /** Proofs that would be selected */
  selectedProofs: Proof[];
  /** Total value of selected proofs */
  selectedTotal: number;
  /** Change that would be returned (selectedTotal - amount) */
  change: number;
  /** Whether a mint swap would be required */
  needsSwap: boolean;
  /** Human-readable issue description (if canCreate is false) */
  issue?: string;
  /** Actionable suggestion for resolving the issue */
  suggestion?: string;
}
