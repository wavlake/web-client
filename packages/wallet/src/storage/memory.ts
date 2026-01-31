/**
 * Memory Storage Adapter
 * 
 * In-memory storage for testing and ephemeral use cases.
 * Proofs are lost when the process ends.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { StorageAdapter } from './interface.js';

/**
 * In-memory storage adapter.
 * 
 * Useful for:
 * - Unit testing
 * - Ephemeral sessions
 * - Server-side rendering
 * 
 * @example
 * ```ts
 * const storage = new MemoryAdapter();
 * const wallet = new Wallet({ mintUrl, storage });
 * 
 * // With initial proofs
 * const storage = new MemoryAdapter(existingProofs);
 * ```
 */
export class MemoryAdapter implements StorageAdapter {
  private proofs: Proof[];

  /**
   * Create a new memory adapter.
   * @param initialProofs - Optional initial proofs to store
   */
  constructor(initialProofs: Proof[] = []) {
    // Deep clone to prevent external mutation
    this.proofs = JSON.parse(JSON.stringify(initialProofs));
  }

  async load(): Promise<Proof[]> {
    // Return a copy to prevent external mutation
    return JSON.parse(JSON.stringify(this.proofs));
  }

  async save(proofs: Proof[]): Promise<void> {
    // Deep clone to prevent external mutation
    this.proofs = JSON.parse(JSON.stringify(proofs));
  }

  async clear(): Promise<void> {
    this.proofs = [];
  }

  /**
   * Get current proof count (for testing).
   */
  get count(): number {
    return this.proofs.length;
  }

  /**
   * Get current balance (for testing).
   */
  get balance(): number {
    return this.proofs.reduce((sum, p) => sum + p.amount, 0);
  }
}
