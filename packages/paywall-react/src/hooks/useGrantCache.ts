'use client';

/**
 * useGrantCache Hook
 *
 * Manages access grants per track with automatic expiry.
 * Enables efficient multi-track playback by replaying grants
 * instead of re-paying for recently accessed content.
 */

import { useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * A cached grant entry for a specific track.
 */
export interface GrantCacheEntry {
  /** Grant ID from the content endpoint */
  id: string;
  /** When the grant expires */
  expiresAt: Date;
  /** Track d-tag this grant is for */
  dtag: string;
  /** When the grant was cached */
  cachedAt: Date;
}

export interface UseGrantCacheResult {
  /** Get a valid (non-expired) grant for a dtag, or null */
  getGrant: (dtag: string) => GrantCacheEntry | null;
  /** Store a grant for a dtag */
  setGrant: (dtag: string, grant: { id: string; expiresAt: Date }) => void;
  /** Check if a valid (non-expired) grant exists for a dtag */
  hasValidGrant: (dtag: string) => boolean;
  /** Remove a specific grant */
  removeGrant: (dtag: string) => void;
  /** Clear all cached grants */
  clearAll: () => void;
  /** Remove all expired grants and return count removed */
  pruneExpired: () => number;
  /** Number of valid (non-expired) cached grants */
  size: number;
  /** All valid grant entries (for debugging/display) */
  entries: () => GrantCacheEntry[];
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Internal grant cache class (not React-specific).
 * Exported for advanced use or testing.
 */
export class GrantCache {
  private _grants: Map<string, GrantCacheEntry> = new Map();

  /**
   * Get a valid grant for a dtag.
   * Returns null if not found or expired.
   * Automatically removes expired entries on access.
   */
  get(dtag: string): GrantCacheEntry | null {
    const entry = this._grants.get(dtag);
    if (!entry) return null;

    // Check expiry — remove if expired
    if (entry.expiresAt.getTime() <= Date.now()) {
      this._grants.delete(dtag);
      return null;
    }

    return entry;
  }

  /**
   * Store a grant for a dtag.
   */
  set(dtag: string, grant: { id: string; expiresAt: Date }): void {
    this._grants.set(dtag, {
      id: grant.id,
      expiresAt: grant.expiresAt,
      dtag,
      cachedAt: new Date(),
    });
  }

  /**
   * Check if a valid grant exists for a dtag.
   */
  has(dtag: string): boolean {
    return this.get(dtag) !== null;
  }

  /**
   * Remove a grant for a specific dtag.
   */
  delete(dtag: string): boolean {
    return this._grants.delete(dtag);
  }

  /**
   * Clear all grants.
   */
  clear(): void {
    this._grants.clear();
  }

  /**
   * Remove all expired entries.
   * @returns Number of entries removed
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [dtag, entry] of this._grants) {
      if (entry.expiresAt.getTime() <= now) {
        this._grants.delete(dtag);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Count of valid (non-expired) entries.
   */
  get size(): number {
    let count = 0;
    const now = Date.now();
    for (const entry of this._grants.values()) {
      if (entry.expiresAt.getTime() > now) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all valid entries.
   */
  entries(): GrantCacheEntry[] {
    const now = Date.now();
    const result: GrantCacheEntry[] = [];
    for (const entry of this._grants.values()) {
      if (entry.expiresAt.getTime() > now) {
        result.push({ ...entry });
      }
    }
    return result;
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Manage access grants per track with automatic expiry.
 *
 * Grants allow replaying content within a time window (typically 10 minutes)
 * without re-payment. This hook caches grants across tracks so switching
 * between recently played tracks doesn't cost additional credits.
 *
 * The cache is in-memory and resets on page refresh. For persistence,
 * combine with localStorage in your app.
 *
 * @example
 * ```tsx
 * function Player() {
 *   const grants = useGrantCache();
 *   const { requestContent, replayGrant } = usePaywall();
 *   const { createToken } = useWallet();
 *
 *   const play = async (dtag: string, price: number) => {
 *     // Check if we have a valid grant (free replay!)
 *     const cached = grants.getGrant(dtag);
 *     if (cached) {
 *       const result = await replayGrant(dtag, cached.id);
 *       return result.url;
 *     }
 *
 *     // No grant — pay and cache the new one
 *     const token = await createToken(price);
 *     const result = await requestContent(dtag, token);
 *     grants.setGrant(dtag, result.grant);
 *     return result.url;
 *   };
 *
 *   return (
 *     <div>
 *       <p>{grants.size} tracks cached</p>
 *       <button onClick={() => play('track-1', 5)}>Play Track 1</button>
 *       <button onClick={() => play('track-2', 3)}>Play Track 2</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useGrantCache(): UseGrantCacheResult {
  const cacheRef = useRef<GrantCache>(new GrantCache());

  const getGrant = useCallback((dtag: string): GrantCacheEntry | null => {
    return cacheRef.current.get(dtag);
  }, []);

  const setGrant = useCallback((dtag: string, grant: { id: string; expiresAt: Date }): void => {
    cacheRef.current.set(dtag, grant);
  }, []);

  const hasValidGrant = useCallback((dtag: string): boolean => {
    return cacheRef.current.has(dtag);
  }, []);

  const removeGrant = useCallback((dtag: string): void => {
    cacheRef.current.delete(dtag);
  }, []);

  const clearAll = useCallback((): void => {
    cacheRef.current.clear();
  }, []);

  const pruneExpired = useCallback((): number => {
    return cacheRef.current.prune();
  }, []);

  const entries = useCallback((): GrantCacheEntry[] => {
    return cacheRef.current.entries();
  }, []);

  return {
    getGrant,
    setGrant,
    hasValidGrant,
    removeGrant,
    clearAll,
    pruneExpired,
    get size() {
      return cacheRef.current.size;
    },
    entries,
  };
}
