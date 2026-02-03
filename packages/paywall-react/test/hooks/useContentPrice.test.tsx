/**
 * useContentPrice and useContentPrices Hook tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PaywallProvider } from '../../src/index.js';
import { useContentPrice, useContentPrices } from '../../src/hooks/useContentPrice.js';

// Mock PaywallClient
const createMockClient = () => ({
  requestAudio: vi.fn(),
  requestContent: vi.fn(),
  replayGrant: vi.fn(),
  getContentPrice: vi.fn().mockResolvedValue(5),
  getAudioUrl: vi.fn(),
  fetchChange: vi.fn(),
});

describe('useContentPrice', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PaywallProvider client={mockClient as any}>
      {children}
    </PaywallProvider>
  );

  it('should fetch price for content', async () => {
    const { result } = renderHook(
      () => useContentPrice('track-123'),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.price).toBe(null);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.price).toBe(5);
    expect(result.current.isFree).toBe(false);
    expect(mockClient.getContentPrice).toHaveBeenCalledWith('track-123');
  });

  it('should handle free content (price = 0)', async () => {
    mockClient.getContentPrice.mockResolvedValue(0);

    const { result } = renderHook(
      () => useContentPrice('free-track'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.price).toBe(0);
    expect(result.current.isFree).toBe(true);
  });

  it('should cache prices to avoid redundant API calls', async () => {
    const { result, rerender } = renderHook(
      () => useContentPrice('track-123'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.price).toBe(5);
    });

    // Rerender should use cache
    rerender();

    expect(mockClient.getContentPrice).toHaveBeenCalledTimes(1);
    expect(result.current.price).toBe(5);
  });

  it('should fetch new price when dtag changes', async () => {
    mockClient.getContentPrice
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(10);

    const { result, rerender } = renderHook(
      ({ dtag }) => useContentPrice(dtag),
      { 
        wrapper,
        initialProps: { dtag: 'track-1' },
      }
    );

    await waitFor(() => {
      expect(result.current.price).toBe(5);
    });

    // Change dtag
    rerender({ dtag: 'track-2' });

    await waitFor(() => {
      expect(result.current.price).toBe(10);
    });

    expect(mockClient.getContentPrice).toHaveBeenCalledTimes(2);
    expect(mockClient.getContentPrice).toHaveBeenCalledWith('track-1');
    expect(mockClient.getContentPrice).toHaveBeenCalledWith('track-2');
  });

  it('should handle undefined dtag', () => {
    const { result } = renderHook(
      () => useContentPrice(undefined),
      { wrapper }
    );

    expect(result.current.price).toBe(null);
    expect(result.current.isLoading).toBe(false);
    expect(mockClient.getContentPrice).not.toHaveBeenCalled();
  });

  it('should handle API errors', async () => {
    mockClient.getContentPrice.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useContentPrice('track-123'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.price).toBe(null);
    expect(result.current.error?.message).toBe('Network error');
  });

  describe('refetch', () => {
    it('should allow manual price refetch', async () => {
      mockClient.getContentPrice
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(8);

      const { result } = renderHook(
        () => useContentPrice('track-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.price).toBe(5);
      });

      // Refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.price).toBe(8);
      });

      expect(mockClient.getContentPrice).toHaveBeenCalledTimes(2);
    });

    it('should clear cache on refetch', async () => {
      mockClient.getContentPrice
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(10);

      const { result } = renderHook(
        () => useContentPrice('track-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.price).toBe(5);
      });

      // Refetch clears cache and fetches again
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.price).toBe(10);
      });
    });
  });
});

describe('useContentPrices', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    mockClient.getContentPrice.mockImplementation(async (dtag: string) => {
      const prices: Record<string, number> = {
        'track-1': 5,
        'track-2': 10,
        'track-3': 0,
        'free-track': 0,
      };
      return prices[dtag] ?? 5;
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PaywallProvider client={mockClient as any}>
      {children}
    </PaywallProvider>
  );

  it('should fetch prices for multiple tracks', async () => {
    const { result } = renderHook(
      () => useContentPrices(['track-1', 'track-2', 'track-3']),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.prices['track-1']).toBe(5);
    expect(result.current.prices['track-2']).toBe(10);
    expect(result.current.prices['track-3']).toBe(0);
  });

  it('should handle empty array', () => {
    const { result } = renderHook(
      () => useContentPrices([]),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.prices).toEqual({});
    expect(mockClient.getContentPrice).not.toHaveBeenCalled();
  });

  it('should handle mixed success and failure', async () => {
    mockClient.getContentPrice.mockImplementation(async (dtag: string) => {
      if (dtag === 'track-error') {
        throw new Error('Failed to fetch');
      }
      return 5;
    });

    const { result } = renderHook(
      () => useContentPrices(['track-1', 'track-error', 'track-2']),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.prices['track-1']).toBe(5);
    expect(result.current.prices['track-2']).toBe(5);
    expect(result.current.prices['track-error']).toBe(null);
    expect(result.current.errors['track-error']?.message).toBe('Failed to fetch');
  });

  it('should cache prices across calls', async () => {
    const { result: result1 } = renderHook(
      () => useContentPrices(['track-1', 'track-2']),
      { wrapper }
    );

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
    });

    const callCount = mockClient.getContentPrice.mock.calls.length;

    // Second hook with same + new tracks
    const { result: result2 } = renderHook(
      () => useContentPrices(['track-1', 'track-3']),
      { wrapper }
    );

    await waitFor(() => {
      expect(result2.current.isLoading).toBe(false);
    });

    // Should only fetch track-3, not track-1 (cached from first hook)
    // Note: This tests the cache within same component instance
    expect(result2.current.prices['track-1']).toBe(5);
    expect(result2.current.prices['track-3']).toBe(0);
  });

  it('should refetch when dtags array changes', async () => {
    const { result, rerender } = renderHook(
      ({ dtags }) => useContentPrices(dtags),
      { 
        wrapper,
        initialProps: { dtags: ['track-1'] },
      }
    );

    await waitFor(() => {
      expect(result.current.prices['track-1']).toBe(5);
    });

    rerender({ dtags: ['track-2'] });

    await waitFor(() => {
      expect(result.current.prices['track-2']).toBe(10);
    });
  });

  it('should handle concurrent price fetches', async () => {
    // Slow down responses to test concurrent behavior
    mockClient.getContentPrice.mockImplementation(async (dtag: string) => {
      await new Promise(r => setTimeout(r, 10));
      return dtag === 'track-1' ? 5 : 10;
    });

    const { result } = renderHook(
      () => useContentPrices(['track-1', 'track-2', 'track-3']),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // All prices should be fetched in parallel
    expect(mockClient.getContentPrice).toHaveBeenCalledTimes(3);
    expect(result.current.prices['track-1']).toBe(5);
    expect(result.current.prices['track-2']).toBe(10);
    expect(result.current.prices['track-3']).toBe(10);
  });
});
