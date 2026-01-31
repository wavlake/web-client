/**
 * LocalStorage Adapter
 * 
 * Browser localStorage-based storage for web applications.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { StorageAdapter } from './interface.js';

/**
 * localStorage-based storage adapter.
 * 
 * Persists proofs to browser localStorage. Data survives page refreshes
 * and browser restarts, but is scoped to the origin.
 * 
 * **Security note:** localStorage is accessible to any JavaScript on the
 * same origin. Do not use in contexts where untrusted scripts may run.
 * 
 * @example
 * ```ts
 * const storage = new LocalStorageAdapter('my-app-wallet');
 * const wallet = new Wallet({ mintUrl, storage });
 * ```
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly key: string;

  /**
   * Create a new localStorage adapter.
   * @param key - localStorage key to use for storing proofs
   */
  constructor(key: string) {
    this.key = key;
  }

  async load(): Promise<Proof[]> {
    // Guard for SSR
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const data = localStorage.getItem(this.key);
      if (!data) {
        return [];
      }
      
      const parsed = JSON.parse(data);
      
      // Validate it's an array
      if (!Array.isArray(parsed)) {
        console.warn(`LocalStorageAdapter: Invalid data at key "${this.key}", expected array`);
        return [];
      }
      
      return parsed;
    } catch (error) {
      console.warn(`LocalStorageAdapter: Failed to load from key "${this.key}"`, error);
      return [];
    }
  }

  async save(proofs: Proof[]): Promise<void> {
    // Guard for SSR
    if (typeof localStorage === 'undefined') {
      console.warn('LocalStorageAdapter: localStorage not available');
      return;
    }

    try {
      localStorage.setItem(this.key, JSON.stringify(proofs));
    } catch (error) {
      // Handle quota exceeded
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('LocalStorageAdapter: Storage quota exceeded');
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    // Guard for SSR
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(this.key);
  }

  /**
   * Get the storage key being used.
   */
  get storageKey(): string {
    return this.key;
  }
}
