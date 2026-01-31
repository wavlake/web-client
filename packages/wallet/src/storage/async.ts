/**
 * AsyncStorage Adapter
 * 
 * React Native AsyncStorage-based storage.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { StorageAdapter } from './interface.js';
import type { AsyncStorageStatic } from '../types.js';

/**
 * AsyncStorage-based storage adapter for React Native.
 * 
 * Uses the standard @react-native-async-storage/async-storage API.
 * Pass your AsyncStorage instance to avoid bundling issues.
 * 
 * @example
 * ```ts
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * 
 * const storage = new AsyncStorageAdapter('my-app-wallet', AsyncStorage);
 * const wallet = new Wallet({ mintUrl, storage });
 * ```
 */
export class AsyncStorageAdapter implements StorageAdapter {
  private readonly key: string;
  private readonly asyncStorage: AsyncStorageStatic;

  /**
   * Create a new AsyncStorage adapter.
   * @param key - Storage key to use for storing proofs
   * @param asyncStorage - AsyncStorage instance from @react-native-async-storage/async-storage
   */
  constructor(key: string, asyncStorage: AsyncStorageStatic) {
    this.key = key;
    this.asyncStorage = asyncStorage;
  }

  async load(): Promise<Proof[]> {
    try {
      const data = await this.asyncStorage.getItem(this.key);
      if (!data) {
        return [];
      }

      const parsed = JSON.parse(data);

      // Validate it's an array
      if (!Array.isArray(parsed)) {
        console.warn(`AsyncStorageAdapter: Invalid data at key "${this.key}", expected array`);
        return [];
      }

      return parsed;
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to load from key "${this.key}"`, error);
      return [];
    }
  }

  async save(proofs: Proof[]): Promise<void> {
    try {
      await this.asyncStorage.setItem(this.key, JSON.stringify(proofs));
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to save to key "${this.key}"`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.asyncStorage.removeItem(this.key);
    } catch (error) {
      console.warn(`AsyncStorageAdapter: Failed to clear key "${this.key}"`, error);
      throw error;
    }
  }

  /**
   * Get the storage key being used.
   */
  get storageKey(): string {
    return this.key;
  }
}
