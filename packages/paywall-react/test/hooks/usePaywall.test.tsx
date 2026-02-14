/**
 * usePaywall Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PaywallProvider, usePaywall } from '../../src/index.js';

// Mock PaywallClient
const createMockClient = () => ({
  requestAudio: vi.fn().mockResolvedValue({
    audio: new Blob(['audio-data'], { type: 'audio/mpeg' }),
    change: null,
  }),
  requestContent: vi.fn().mockResolvedValue({
    url: 'https://cdn.wavlake.com/signed-url',
    grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
    change: null,
  }),
  replayGrant: vi.fn().mockResolvedValue({
    url: 'https://cdn.wavlake.com/replay-url',
    grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
    change: null,
  }),
  getContentPrice: vi.fn().mockResolvedValue(5),
  getAudioUrl: vi.fn().mockReturnValue('https://api.wavlake.com/audio/track-123?token=cashuB...'),
  fetchChange: vi.fn().mockResolvedValue({
    change: 'cashuBchangeToken',
    amount: 3,
  }),
});

describe('usePaywall', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PaywallProvider client={mockClient as any}>
      {children}
    </PaywallProvider>
  );

  it('should throw when used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => usePaywall());
    }).toThrow('usePaywallContext must be used within a PaywallProvider');
    
    consoleSpy.mockRestore();
  });

  it('should provide initial state', () => {
    const { result } = renderHook(() => usePaywall(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.requestAudio).toBe('function');
    expect(typeof result.current.requestContent).toBe('function');
    expect(typeof result.current.replayGrant).toBe('function');
    expect(typeof result.current.getContentPrice).toBe('function');
    expect(typeof result.current.getAudioUrl).toBe('function');
    expect(typeof result.current.fetchChange).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  describe('requestAudio', () => {
    it('should request audio with token', async () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      let audioResult: any;
      await act(async () => {
        audioResult = await result.current.requestAudio('track-123', 'cashuBtoken');
      });

      expect(mockClient.requestAudio).toHaveBeenCalledWith('track-123', 'cashuBtoken', undefined);
      expect(audioResult.audio).toBeInstanceOf(Blob);
    });

    it('should set loading state during request', async () => {
      let resolvePromise: Function;
      mockClient.requestAudio.mockReturnValue(
        new Promise((resolve) => { resolvePromise = resolve; })
      );

      const { result } = renderHook(() => usePaywall(), { wrapper });

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.requestAudio('track-123', 'cashuBtoken');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolvePromise!({ audio: new Blob(), change: null });
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle errors', async () => {
      mockClient.requestAudio.mockRejectedValue(new Error('Payment required'));

      const { result } = renderHook(() => usePaywall(), { wrapper });

      await act(async () => {
        try {
          await result.current.requestAudio('track-123', 'invalidToken');
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.message).toBe('Payment required');
    });
  });

  describe('requestContent', () => {
    it('should request content with token', async () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      let contentResult: any;
      await act(async () => {
        contentResult = await result.current.requestContent('track-123', 'cashuBtoken');
      });

      expect(mockClient.requestContent).toHaveBeenCalledWith('track-123', 'cashuBtoken');
      expect(contentResult.url).toBe('https://cdn.wavlake.com/signed-url');
      expect(contentResult.grant.id).toBe('grant-123');
    });

    it('should handle content with change', async () => {
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/signed-url',
        grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
        change: 'cashuBchangeToken',
      });

      const { result } = renderHook(() => usePaywall(), { wrapper });

      let contentResult: any;
      await act(async () => {
        contentResult = await result.current.requestContent('track-123', 'cashuBtoken');
      });

      expect(contentResult.change).toBe('cashuBchangeToken');
    });
  });

  describe('replayGrant', () => {
    it('should replay existing grant', async () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      let replayResult: any;
      await act(async () => {
        replayResult = await result.current.replayGrant('track-123', 'grant-123');
      });

      expect(mockClient.replayGrant).toHaveBeenCalledWith('track-123', 'grant-123');
      expect(replayResult.url).toBe('https://cdn.wavlake.com/replay-url');
    });

    it('should handle expired grant error', async () => {
      mockClient.replayGrant.mockRejectedValue(new Error('Grant expired'));

      const { result } = renderHook(() => usePaywall(), { wrapper });

      await act(async () => {
        try {
          await result.current.replayGrant('track-123', 'expired-grant');
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.message).toBe('Grant expired');
    });
  });

  describe('getContentPrice', () => {
    it('should get content price', async () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      let price: number | undefined;
      await act(async () => {
        price = await result.current.getContentPrice('track-123');
      });

      expect(mockClient.getContentPrice).toHaveBeenCalledWith('track-123');
      expect(price).toBe(5);
    });

    it('should handle free content (price = 0)', async () => {
      mockClient.getContentPrice.mockResolvedValue(0);

      const { result } = renderHook(() => usePaywall(), { wrapper });

      let price: number | undefined;
      await act(async () => {
        price = await result.current.getContentPrice('free-track');
      });

      expect(price).toBe(0);
    });

    it('should not set loading state for getContentPrice', async () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      // getContentPrice doesn't set isLoading (by design - it's a lightweight call)
      await act(async () => {
        await result.current.getContentPrice('track-123');
      });

      // isLoading should remain false throughout
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('getAudioUrl', () => {
    it('should generate audio URL with token', () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      const url = result.current.getAudioUrl('track-123', 'cashuBtoken');

      expect(mockClient.getAudioUrl).toHaveBeenCalledWith('track-123', 'cashuBtoken', undefined);
      expect(url).toContain('track-123');
    });

    it('should include payment ID when provided', () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      result.current.getAudioUrl('track-123', 'cashuBtoken', 'payment-456');

      expect(mockClient.getAudioUrl).toHaveBeenCalledWith('track-123', 'cashuBtoken', 'payment-456');
    });
  });

  describe('fetchChange', () => {
    it('should fetch change from overpayment', async () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      let changeResult: any;
      await act(async () => {
        changeResult = await result.current.fetchChange('payment-123');
      });

      expect(mockClient.fetchChange).toHaveBeenCalledWith('payment-123');
      expect(changeResult.change).toBe('cashuBchangeToken');
      expect(changeResult.amount).toBe(3);
    });

    it('should handle no change available', async () => {
      mockClient.fetchChange.mockRejectedValue(new Error('No change available'));

      const { result } = renderHook(() => usePaywall(), { wrapper });

      await act(async () => {
        try {
          await result.current.fetchChange('payment-123');
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.message).toBe('No change available');
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      mockClient.requestAudio.mockRejectedValue(new Error('Test error'));

      const { result } = renderHook(() => usePaywall(), { wrapper });

      // Trigger an error
      await act(async () => {
        try {
          await result.current.requestAudio('track-123', 'badToken');
        } catch {
          // Expected
        }
      });

      expect(result.current.error).not.toBe(null);

      // Clear the error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent requests', async () => {
      const { result } = renderHook(() => usePaywall(), { wrapper });

      await act(async () => {
        const [result1, result2] = await Promise.all([
          result.current.requestContent('track-1', 'token1'),
          result.current.requestContent('track-2', 'token2'),
        ]);

        expect(result1.url).toBeDefined();
        expect(result2.url).toBeDefined();
      });

      expect(mockClient.requestContent).toHaveBeenCalledTimes(2);
    });
  });
});
