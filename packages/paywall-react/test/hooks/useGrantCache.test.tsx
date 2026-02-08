/**
 * useGrantCache Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGrantCache, GrantCache } from '../../src/hooks/useGrantCache.js';

// ============================================================================
// GrantCache (class) tests
// ============================================================================

describe('GrantCache', () => {
  let cache: GrantCache;

  beforeEach(() => {
    cache = new GrantCache();
  });

  describe('set and get', () => {
    it('should store and retrieve a grant', () => {
      const expiresAt = new Date(Date.now() + 600_000); // 10 min
      cache.set('track-1', { id: 'grant-1', expiresAt });

      const entry = cache.get('track-1');
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe('grant-1');
      expect(entry!.dtag).toBe('track-1');
      expect(entry!.expiresAt).toEqual(expiresAt);
      expect(entry!.cachedAt).toBeInstanceOf(Date);
    });

    it('should return null for unknown dtag', () => {
      expect(cache.get('unknown')).toBeNull();
    });

    it('should return null for expired grant', () => {
      const expired = new Date(Date.now() - 1000); // 1 second ago
      cache.set('track-1', { id: 'grant-1', expiresAt: expired });

      expect(cache.get('track-1')).toBeNull();
    });

    it('should auto-delete expired grant on access', () => {
      const expired = new Date(Date.now() - 1000);
      cache.set('track-1', { id: 'grant-1', expiresAt: expired });

      // First access removes it
      cache.get('track-1');

      // Size should reflect removal
      const valid = new Date(Date.now() + 600_000);
      cache.set('track-2', { id: 'grant-2', expiresAt: valid });
      expect(cache.size).toBe(1);
    });

    it('should overwrite existing grant for same dtag', () => {
      const expires1 = new Date(Date.now() + 300_000);
      const expires2 = new Date(Date.now() + 600_000);

      cache.set('track-1', { id: 'grant-1', expiresAt: expires1 });
      cache.set('track-1', { id: 'grant-2', expiresAt: expires2 });

      const entry = cache.get('track-1');
      expect(entry!.id).toBe('grant-2');
    });
  });

  describe('has', () => {
    it('should return true for valid grant', () => {
      cache.set('track-1', { id: 'grant-1', expiresAt: new Date(Date.now() + 600_000) });
      expect(cache.has('track-1')).toBe(true);
    });

    it('should return false for unknown dtag', () => {
      expect(cache.has('unknown')).toBe(false);
    });

    it('should return false for expired grant', () => {
      cache.set('track-1', { id: 'grant-1', expiresAt: new Date(Date.now() - 1000) });
      expect(cache.has('track-1')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove a grant', () => {
      cache.set('track-1', { id: 'grant-1', expiresAt: new Date(Date.now() + 600_000) });
      expect(cache.delete('track-1')).toBe(true);
      expect(cache.get('track-1')).toBeNull();
    });

    it('should return false for unknown dtag', () => {
      expect(cache.delete('unknown')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all grants', () => {
      const exp = new Date(Date.now() + 600_000);
      cache.set('track-1', { id: 'g1', expiresAt: exp });
      cache.set('track-2', { id: 'g2', expiresAt: exp });
      cache.set('track-3', { id: 'g3', expiresAt: exp });

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('track-1')).toBeNull();
    });
  });

  describe('prune', () => {
    it('should remove expired entries and return count', () => {
      const valid = new Date(Date.now() + 600_000);
      const expired = new Date(Date.now() - 1000);

      cache.set('track-1', { id: 'g1', expiresAt: valid });
      cache.set('track-2', { id: 'g2', expiresAt: expired });
      cache.set('track-3', { id: 'g3', expiresAt: expired });

      const removed = cache.prune();
      expect(removed).toBe(2);
      expect(cache.size).toBe(1);
      expect(cache.has('track-1')).toBe(true);
    });

    it('should return 0 when nothing to prune', () => {
      const valid = new Date(Date.now() + 600_000);
      cache.set('track-1', { id: 'g1', expiresAt: valid });
      expect(cache.prune()).toBe(0);
    });

    it('should return 0 on empty cache', () => {
      expect(cache.prune()).toBe(0);
    });
  });

  describe('size', () => {
    it('should count only valid entries', () => {
      const valid = new Date(Date.now() + 600_000);
      const expired = new Date(Date.now() - 1000);

      cache.set('track-1', { id: 'g1', expiresAt: valid });
      cache.set('track-2', { id: 'g2', expiresAt: expired });

      expect(cache.size).toBe(1);
    });

    it('should be 0 for empty cache', () => {
      expect(cache.size).toBe(0);
    });
  });

  describe('entries', () => {
    it('should return all valid entries', () => {
      const valid = new Date(Date.now() + 600_000);
      const expired = new Date(Date.now() - 1000);

      cache.set('track-1', { id: 'g1', expiresAt: valid });
      cache.set('track-2', { id: 'g2', expiresAt: expired });
      cache.set('track-3', { id: 'g3', expiresAt: valid });

      const all = cache.entries();
      expect(all).toHaveLength(2);
      expect(all.map(e => e.dtag).sort()).toEqual(['track-1', 'track-3']);
    });

    it('should return copies (not references)', () => {
      const valid = new Date(Date.now() + 600_000);
      cache.set('track-1', { id: 'g1', expiresAt: valid });

      const entries = cache.entries();
      entries[0].id = 'mutated';

      // Original should be unchanged
      expect(cache.get('track-1')!.id).toBe('g1');
    });
  });
});

// ============================================================================
// useGrantCache (hook) tests
// ============================================================================

describe('useGrantCache', () => {
  it('should provide all methods', () => {
    const { result } = renderHook(() => useGrantCache());

    expect(typeof result.current.getGrant).toBe('function');
    expect(typeof result.current.setGrant).toBe('function');
    expect(typeof result.current.hasValidGrant).toBe('function');
    expect(typeof result.current.removeGrant).toBe('function');
    expect(typeof result.current.clearAll).toBe('function');
    expect(typeof result.current.pruneExpired).toBe('function');
    expect(typeof result.current.entries).toBe('function');
    expect(typeof result.current.size).toBe('number');
  });

  it('should start empty', () => {
    const { result } = renderHook(() => useGrantCache());

    expect(result.current.size).toBe(0);
    expect(result.current.getGrant('any')).toBeNull();
    expect(result.current.hasValidGrant('any')).toBe(false);
  });

  it('should set and get grants', () => {
    const { result } = renderHook(() => useGrantCache());
    const expiresAt = new Date(Date.now() + 600_000);

    act(() => {
      result.current.setGrant('track-1', { id: 'grant-1', expiresAt });
    });

    const entry = result.current.getGrant('track-1');
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('grant-1');
    expect(result.current.hasValidGrant('track-1')).toBe(true);
    expect(result.current.size).toBe(1);
  });

  it('should remove grants', () => {
    const { result } = renderHook(() => useGrantCache());
    const exp = new Date(Date.now() + 600_000);

    act(() => {
      result.current.setGrant('track-1', { id: 'g1', expiresAt: exp });
      result.current.removeGrant('track-1');
    });

    expect(result.current.getGrant('track-1')).toBeNull();
  });

  it('should clear all grants', () => {
    const { result } = renderHook(() => useGrantCache());
    const exp = new Date(Date.now() + 600_000);

    act(() => {
      result.current.setGrant('track-1', { id: 'g1', expiresAt: exp });
      result.current.setGrant('track-2', { id: 'g2', expiresAt: exp });
      result.current.clearAll();
    });

    expect(result.current.size).toBe(0);
  });

  it('should prune expired grants', () => {
    const { result } = renderHook(() => useGrantCache());

    act(() => {
      result.current.setGrant('valid', {
        id: 'g1',
        expiresAt: new Date(Date.now() + 600_000),
      });
      result.current.setGrant('expired', {
        id: 'g2',
        expiresAt: new Date(Date.now() - 1000),
      });
    });

    let removed: number = 0;
    act(() => {
      removed = result.current.pruneExpired();
    });

    expect(removed).toBe(1);
    expect(result.current.size).toBe(1);
    expect(result.current.hasValidGrant('valid')).toBe(true);
    expect(result.current.hasValidGrant('expired')).toBe(false);
  });

  it('should list entries', () => {
    const { result } = renderHook(() => useGrantCache());
    const exp = new Date(Date.now() + 600_000);

    act(() => {
      result.current.setGrant('track-1', { id: 'g1', expiresAt: exp });
      result.current.setGrant('track-2', { id: 'g2', expiresAt: exp });
    });

    const entries = result.current.entries();
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.dtag).sort()).toEqual(['track-1', 'track-2']);
  });

  it('should persist cache across re-renders', () => {
    const { result, rerender } = renderHook(() => useGrantCache());
    const exp = new Date(Date.now() + 600_000);

    act(() => {
      result.current.setGrant('track-1', { id: 'g1', expiresAt: exp });
    });

    // Re-render the hook
    rerender();

    // Cache should still have the grant
    expect(result.current.getGrant('track-1')).not.toBeNull();
    expect(result.current.size).toBe(1);
  });
});
