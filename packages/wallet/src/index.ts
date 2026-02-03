/**
 * @wavlake/wallet
 * 
 * Cashu wallet state management with pluggable storage backends.
 * 
 * @example
 * ```ts
 * import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
 * 
 * const wallet = new Wallet({
 *   mintUrl: 'https://mint.wavlake.com',
 *   storage: new LocalStorageAdapter('my-wallet'),
 * });
 * 
 * await wallet.load();
 * console.log(`Balance: ${wallet.balance} credits`);
 * 
 * // Create a token for payment
 * const token = await wallet.createToken(5);
 * 
 * // Receive change
 * await wallet.receiveChange(changeToken);
 * ```
 * 
 * @packageDocumentation
 */

// Main wallet class
export { Wallet } from './wallet.js';

// Storage adapters
export {
  type StorageAdapter,
  MemoryAdapter,
  LocalStorageAdapter,
  AsyncStorageAdapter,
} from './storage/index.js';

// Proof selectors
export {
  selectors,
  smallestFirst,
  largestFirst,
  exactMatch,
  random,
  type ProofSelector,
  type ProofSelectors,
} from './selectors/index.js';

// Checkstate utilities
export {
  checkProofState,
  isProofValid,
} from './checkstate.js';

// Token utilities
export {
  validateToken,
  parseToken,
  looksLikeToken,
  getTokenMint,
  getTokenAmount,
} from './token.js';

export type {
  TokenInfo,
  TokenValidation,
} from './token.js';

// Proof inspection utilities
export {
  summarizeProofs,
  describeProof,
  canCoverAmount,
  findOptimalProofs,
  calculateChange,
  groupByKeyset,
  getDenominations,
  formatBalance,
} from './inspect.js';

export type {
  ProofSummary,
} from './inspect.js';

// Error classes
export {
  WalletError,
  toWalletError,
  needsMoreFunds,
} from './errors.js';

export type {
  WalletErrorCode,
  WalletErrorDetails,
  WalletErrorInfo,
} from './errors.js';

// Health check utilities
export {
  checkWalletHealth,
  quickHealthCheck,
} from './health.js';

export type {
  ProofHealth,
  MintStatus,
  WalletHealth,
  HealthCheckOptions,
} from './health.js';

// Debug logging utilities
export {
  getLogBuffer,
  clearLogBuffer,
  subscribeToLogs,
  consoleLogger,
  silentLogger,
  createLogger,
} from './logger.js';

// Types
export type {
  Proof,
  WalletConfig,
  CheckProofsResult,
  MintQuote,
  WalletEventType,
  WalletEventHandlers,
  AsyncStorageStatic,
  CreateTokenResult,
  Logger,
  LogEntry,
  LogLevel,
} from './types.js';
