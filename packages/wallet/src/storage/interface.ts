/**
 * Storage Adapter Interface
 * 
 * Base interface that all storage adapters must implement.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { SerializedTransaction } from '../history.js';

/**
 * Storage adapter interface for persisting proofs.
 * 
 * Implement this interface to create custom storage backends
 * (e.g., IndexedDB, SQLite, cloud storage).
 * 
 * @example
 * ```ts
 * class MyStorageAdapter implements StorageAdapter {
 *   async load(): Promise<Proof[]> {
 *     // Load from your storage
 *   }
 *   async save(proofs: Proof[]): Promise<void> {
 *     // Save to your storage
 *   }
 *   async clear(): Promise<void> {
 *     // Clear your storage
 *   }
 * }
 * ```
 */
export interface StorageAdapter {
  /**
   * Load proofs from storage.
   * Should return an empty array if no proofs are stored.
   */
  load(): Promise<Proof[]>;

  /**
   * Save proofs to storage.
   * This should overwrite any existing proofs.
   */
  save(proofs: Proof[]): Promise<void>;

  /**
   * Clear all stored proofs.
   */
  clear(): Promise<void>;

  /**
   * Load transaction history from storage.
   * Optional - if not implemented, history is in-memory only.
   */
  loadHistory?(): Promise<SerializedTransaction[]>;

  /**
   * Save transaction history to storage.
   * Optional - if not implemented, history is in-memory only.
   */
  saveHistory?(history: SerializedTransaction[]): Promise<void>;

  /**
   * Clear transaction history.
   * Optional - if not implemented, clearing proofs won't clear history.
   */
  clearHistory?(): Promise<void>;
}
