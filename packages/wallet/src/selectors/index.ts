/**
 * Proof Selection Strategies
 * 
 * Different strategies for selecting which proofs to use when creating tokens.
 */

import type { ProofSelectors } from '../types.js';
import { smallestFirst } from './smallest.js';
import { largestFirst } from './largest.js';
import { exactMatch } from './exact.js';
import { random } from './random.js';

/**
 * Available proof selection strategies.
 * 
 * @example
 * ```ts
 * import { selectors } from '@wavlake/wallet/selectors';
 * 
 * const wallet = new Wallet({
 *   mintUrl,
 *   storage,
 *   proofSelector: selectors.exactMatch, // Try exact match first
 * });
 * ```
 */
export const selectors: ProofSelectors = {
  smallestFirst,
  largestFirst,
  exactMatch,
  random,
};

// Also export individually
export { smallestFirst } from './smallest.js';
export { largestFirst } from './largest.js';
export { exactMatch } from './exact.js';
export { random } from './random.js';

// Re-export type
export type { ProofSelector, ProofSelectors } from '../types.js';
