/**
 * Storage Adapter Interface
 * 
 * Base interface that all storage adapters must implement.
 */

import type { Proof } from '@cashu/cashu-ts';

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
}
