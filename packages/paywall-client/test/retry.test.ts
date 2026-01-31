/**
 * Retry utility tests
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry, isNetworkError } from '../src/retry.js';

describe('isNetworkError', () => {
  it('should return true for network-related errors', () => {
    expect(isNetworkError(new Error('Network error'))).toBe(true);
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('Request timeout'))).toBe(true);
    expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isNetworkError(new Error('Socket closed'))).toBe(true);
  });

  it('should return false for non-network errors', () => {
    expect(isNetworkError(new Error('Invalid token'))).toBe(false);
    expect(isNetworkError(new Error('Payment required'))).toBe(false);
    expect(isNetworkError(new Error('Unauthorized'))).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isNetworkError('string')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('withRetry', () => {
  it('should return immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      initialDelayMs: 10, // Fast for tests
      isRetryable: () => true,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid token'));

    await expect(withRetry(fn, {
      isRetryable: () => false,
    })).rejects.toThrow('Invalid token');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      isRetryable: () => true,
    })).rejects.toThrow('Network error');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, {
      initialDelayMs: 10,
      isRetryable: () => true,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, 10, expect.any(Error));
  });

  it('should apply exponential backoff', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, {
      initialDelayMs: 100,
      backoffMultiplier: 2,
      isRetryable: () => true,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    // First retry at ~100ms
    expect(onRetry.mock.calls[0][1]).toBe(100);
    // Second retry at ~200ms (with some jitter)
    expect(onRetry.mock.calls[1][1]).toBeGreaterThanOrEqual(180);
    expect(onRetry.mock.calls[1][1]).toBeLessThanOrEqual(240);
  });

  it('should respect maxDelayMs', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      maxDelayMs: 150,
      backoffMultiplier: 3,
      isRetryable: () => true,
      onRetry,
    });

    // All delays should be capped at maxDelayMs
    expect(onRetry.mock.calls[2][1]).toBeLessThanOrEqual(150);
  });
});
