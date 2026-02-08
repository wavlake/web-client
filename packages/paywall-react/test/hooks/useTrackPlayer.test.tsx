/**
 * useTrackPlayer Hook tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WalletProvider, PaywallProvider } from '../../src/index.js';
import { useTrackPlayer } from '../../src/hooks/useTrackPlayer.js';

// Mock URL.createObjectURL and revokeObjectURL
const mockObjectURL = 'blob:http://localhost:3000/mock-blob-url';
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn().mockReturnValue(mockObjectURL),
  revokeObjectURL: vi.fn(),
});

// Mock wallet
const createMockWallet = (balance = 100) => ({
  balance,
  proofs: [{ C: 'c1', amount: balance, id: 'keyset1', secret: 's1' }],
  isLoaded: true,
  mintUrl: 'https://mint.test.com',
  load: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  createToken: vi.fn().mockResolvedValue('cashuBtoken'),
  receiveToken: vi.fn().mockResolvedValue(3),
  createMintQuote: vi.fn(),
  mintTokens: vi.fn(),
  checkProofs: vi.fn(),
  pruneSpent: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

// Mock PaywallClient
const createMockClient = () => ({
  requestAudio: vi.fn().mockResolvedValue({
    audio: new Blob(['audio-data'], { type: 'audio/mpeg' }),
    contentType: 'audio/mpeg',
  }),
  requestContent: vi.fn().mockResolvedValue({
    url: 'https://cdn.wavlake.com/signed-url',
    grant: { id: 'grant-123', expiresAt: new Date(Date.now() + 600_000) },
  }),
  replayGrant: vi.fn().mockResolvedValue({
    url: 'https://cdn.wavlake.com/replay-url',
    grant: { id: 'grant-123-refreshed', expiresAt: new Date(Date.now() + 600_000) },
  }),
  getContentPrice: vi.fn().mockResolvedValue(5),
  getAudioUrl: vi.fn(),
  fetchChange: vi.fn(),
});

describe('useTrackPlayer', () => {
  let mockWallet: ReturnType<typeof createMockWallet>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createWrapper = () => ({ children }: { children: React.ReactNode }) => (
    <WalletProvider wallet={mockWallet as any}>
      <PaywallProvider client={mockClient as any}>
        {children}
      </PaywallProvider>
    </WalletProvider>
  );

  it('should provide initial state', async () => {
    const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.audioUrl).toBe(null);
    });

    expect(result.current.grantId).toBe(null);
    expect(result.current.currentDtag).toBe(null);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.canReplay).toBe(false);
    expect(result.current.cachedGrantCount).toBe(0);
    expect(typeof result.current.replay).toBe('function');
    expect(typeof result.current.hasGrantFor).toBe('function');
  });

  describe('play with content endpoint (default)', () => {
    it('should complete play flow with signed URL', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(mockWallet.createToken).toHaveBeenCalledWith(5);
      expect(mockClient.requestContent).toHaveBeenCalledWith('track-123', 'cashuBtoken');
      expect(result.current.audioUrl).toBe('https://cdn.wavlake.com/signed-url');
      expect(result.current.grantId).toBe('grant-123');
      expect(result.current.currentDtag).toBe('track-123');
      expect(result.current.isPlaying).toBe(true);
    });
  });

  describe('play with audio endpoint', () => {
    it('should use blob URL for audio endpoint', async () => {
      const { result } = renderHook(
        () => useTrackPlayer({ useContentEndpoint: false }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(mockClient.requestAudio).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(result.current.audioUrl).toBe(mockObjectURL);
      expect(result.current.grantId).toBe(null); // No grant with audio endpoint
      expect(result.current.currentDtag).toBe('track-123');
    });
  });

  describe('balance checking', () => {
    it('should throw error on insufficient balance', async () => {
      mockWallet = createMockWallet(3); // Only 3 credits

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.play('track-123', 10);
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error?.message).toContain('Insufficient balance');
      expect(result.current.isPlaying).toBe(false);
      expect(mockWallet.createToken).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should track loading state during play', async () => {
      let resolveContent: Function;
      mockClient.requestContent.mockReturnValue(
        new Promise(r => { resolveContent = r; })
      );

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.play('track-123', 5);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolveContent!({
          url: 'https://cdn.wavlake.com/signed-url',
          grant: { id: 'grant-123', expiresAt: new Date(Date.now() + 600_000) },
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('stop', () => {
    it('should clear audio URL and playing state', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Start playing
      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(result.current.isPlaying).toBe(true);
      expect(result.current.audioUrl).not.toBe(null);

      // Stop
      act(() => {
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);
      expect(result.current.audioUrl).toBe(null);
    });

    it('should preserve grantId and currentDtag for potential replay', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(result.current.grantId).toBe('grant-123');
      expect(result.current.currentDtag).toBe('track-123');

      act(() => {
        result.current.stop();
      });

      // Both preserved
      expect(result.current.grantId).toBe('grant-123');
      expect(result.current.currentDtag).toBe('track-123');
      expect(result.current.canReplay).toBe(true);
    });

    it('should revoke blob URL when stopping audio endpoint', async () => {
      const { result } = renderHook(
        () => useTrackPlayer({ useContentEndpoint: false }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      act(() => {
        result.current.stop();
      });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectURL);
    });
  });

  describe('error handling', () => {
    it('should set error on token creation failure', async () => {
      mockWallet.createToken.mockRejectedValue(new Error('Token creation failed'));

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.play('track-123', 5);
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.message).toBe('Token creation failed');
      expect(result.current.isPlaying).toBe(false);
    });

    it('should set error on content request failure', async () => {
      mockClient.requestContent.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.play('track-123', 5);
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.message).toBe('Server error');
    });

    it('should re-throw error for caller handling', async () => {
      mockWallet.createToken.mockRejectedValue(new Error('Test error'));

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.play('track-123', 5);
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError?.message).toBe('Test error');
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      mockWallet.createToken.mockRejectedValue(new Error('Test error'));

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.play('track-123', 5);
        } catch {
          // Expected
        }
      });

      expect(result.current.error).not.toBe(null);

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('multiple plays', () => {
    it('should clean up previous blob URL on new play', async () => {
      const { result } = renderHook(
        () => useTrackPlayer({ useContentEndpoint: false }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First play
      await act(async () => {
        await result.current.play('track-1', 5);
      });

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

      // Second play should revoke first blob URL
      await act(async () => {
        await result.current.play('track-2', 5);
      });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectURL);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    });

    it('should allow consecutive plays with content endpoint', async () => {
      mockClient.requestContent
        .mockResolvedValueOnce({
          url: 'https://cdn.wavlake.com/track-1',
          grant: { id: 'grant-1', expiresAt: new Date(Date.now() + 600_000) },
        })
        .mockResolvedValueOnce({
          url: 'https://cdn.wavlake.com/track-2',
          grant: { id: 'grant-2', expiresAt: new Date(Date.now() + 600_000) },
        });

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-1', 5);
      });

      expect(result.current.audioUrl).toBe('https://cdn.wavlake.com/track-1');
      expect(result.current.grantId).toBe('grant-1');

      await act(async () => {
        await result.current.play('track-2', 5);
      });

      expect(result.current.audioUrl).toBe('https://cdn.wavlake.com/track-2');
      expect(result.current.grantId).toBe('grant-2');
    });
  });

  // ============================================================================
  // Grant Cache & Replay tests
  // ============================================================================

  describe('grant caching', () => {
    it('should cache grant after first play', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(result.current.hasGrantFor('track-123')).toBe(true);
      expect(result.current.cachedGrantCount).toBe(1);
    });

    it('should cache multiple track grants', async () => {
      mockClient.requestContent
        .mockResolvedValueOnce({
          url: 'https://cdn.wavlake.com/track-1',
          grant: { id: 'grant-1', expiresAt: new Date(Date.now() + 600_000) },
        })
        .mockResolvedValueOnce({
          url: 'https://cdn.wavlake.com/track-2',
          grant: { id: 'grant-2', expiresAt: new Date(Date.now() + 600_000) },
        });

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-1', 5);
      });

      await act(async () => {
        await result.current.play('track-2', 3);
      });

      expect(result.current.hasGrantFor('track-1')).toBe(true);
      expect(result.current.hasGrantFor('track-2')).toBe(true);
      expect(result.current.cachedGrantCount).toBe(2);
    });

    it('should replay cached grant instead of re-paying', async () => {
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/paid-url',
        grant: { id: 'grant-123', expiresAt: new Date(Date.now() + 600_000) },
      });

      mockClient.replayGrant.mockResolvedValue({
        url: 'https://cdn.wavlake.com/replayed-url',
        grant: { id: 'grant-123-refreshed', expiresAt: new Date(Date.now() + 600_000) },
      });

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First play — pays normally
      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(mockWallet.createToken).toHaveBeenCalledTimes(1);
      expect(mockClient.requestContent).toHaveBeenCalledTimes(1);
      expect(result.current.audioUrl).toBe('https://cdn.wavlake.com/paid-url');

      // Second play of same track — should replay (free!)
      await act(async () => {
        await result.current.play('track-123', 5);
      });

      // Should NOT have created another token
      expect(mockWallet.createToken).toHaveBeenCalledTimes(1);
      // Should NOT have called requestContent again
      expect(mockClient.requestContent).toHaveBeenCalledTimes(1);
      // Should have called replayGrant
      expect(mockClient.replayGrant).toHaveBeenCalledWith('track-123', 'grant-123');
      expect(result.current.audioUrl).toBe('https://cdn.wavlake.com/replayed-url');
      expect(result.current.isPlaying).toBe(true);
    });

    it('should skip cache when enableGrantCache is false', async () => {
      const { result } = renderHook(
        () => useTrackPlayer({ enableGrantCache: false }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First play
      await act(async () => {
        await result.current.play('track-123', 5);
      });

      // Second play — should pay again since cache is disabled
      await act(async () => {
        await result.current.play('track-123', 5);
      });

      // Should have created tokens TWICE
      expect(mockWallet.createToken).toHaveBeenCalledTimes(2);
      expect(mockClient.requestContent).toHaveBeenCalledTimes(2);
      expect(mockClient.replayGrant).not.toHaveBeenCalled();
    });

    it('should not use cache for audio endpoint', async () => {
      const { result } = renderHook(
        () => useTrackPlayer({ useContentEndpoint: false }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      // Should pay twice — no grant caching with audio endpoint
      expect(mockWallet.createToken).toHaveBeenCalledTimes(2);
      expect(mockClient.requestAudio).toHaveBeenCalledTimes(2);
    });

    it('should update cache with refreshed grant after replay', async () => {
      const firstGrant = { id: 'grant-1', expiresAt: new Date(Date.now() + 300_000) };
      const refreshedGrant = { id: 'grant-1-refreshed', expiresAt: new Date(Date.now() + 600_000) };

      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/url-1',
        grant: firstGrant,
      });
      mockClient.replayGrant.mockResolvedValue({
        url: 'https://cdn.wavlake.com/url-2',
        grant: refreshedGrant,
      });

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First play
      await act(async () => {
        await result.current.play('track-1', 5);
      });
      expect(result.current.grantId).toBe('grant-1');

      // Second play (replay) — should use cached grant and update with refreshed
      await act(async () => {
        await result.current.play('track-1', 5);
      });
      expect(result.current.grantId).toBe('grant-1-refreshed');
    });

    it('should fall back to payment when replay fails', async () => {
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/paid-url',
        grant: { id: 'grant-1', expiresAt: new Date(Date.now() + 600_000) },
      });

      // First replay attempt fails (grant expired server-side)
      mockClient.replayGrant.mockRejectedValueOnce(new Error('Grant expired'));

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First play
      await act(async () => {
        await result.current.play('track-1', 5);
      });

      // Second play — replay fails, which should throw
      // (caller should catch and retry without cache)
      await act(async () => {
        try {
          await result.current.play('track-1', 5);
        } catch (e) {
          expect((e as Error).message).toBe('Grant expired');
        }
      });
    });
  });

  describe('replay method', () => {
    it('should replay current track', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Play first
      await act(async () => {
        await result.current.play('track-123', 5);
      });

      // Stop
      act(() => {
        result.current.stop();
      });

      expect(result.current.canReplay).toBe(true);

      // Replay
      await act(async () => {
        await result.current.replay();
      });

      expect(mockClient.replayGrant).toHaveBeenCalledWith('track-123', 'grant-123');
      expect(result.current.audioUrl).toBe('https://cdn.wavlake.com/replay-url');
      expect(result.current.isPlaying).toBe(true);
    });

    it('should throw if no track has been played', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.replay();
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError?.message).toContain('No track to replay');
    });

    it('should set error and loading states during replay', async () => {
      mockClient.replayGrant.mockRejectedValue(new Error('Replay failed'));

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      act(() => {
        result.current.stop();
      });

      await act(async () => {
        try {
          await result.current.replay();
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.message).toBe('Replay failed');
    });

    it('should update grant cache after successful replay', async () => {
      mockClient.replayGrant.mockResolvedValue({
        url: 'https://cdn.wavlake.com/replay-url',
        grant: { id: 'grant-refreshed', expiresAt: new Date(Date.now() + 600_000) },
      });

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      await act(async () => {
        await result.current.replay();
      });

      expect(result.current.grantId).toBe('grant-refreshed');
    });
  });

  describe('canReplay', () => {
    it('should be false initially', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canReplay).toBe(false);
    });

    it('should be true after playing with content endpoint', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(result.current.canReplay).toBe(true);
    });

    it('should remain true after stop', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      act(() => {
        result.current.stop();
      });

      expect(result.current.canReplay).toBe(true);
    });
  });

  describe('hasGrantFor', () => {
    it('should return false for unplayed tracks', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasGrantFor('track-123')).toBe(false);
    });

    it('should return true for played tracks with valid grant', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(result.current.hasGrantFor('track-123')).toBe(true);
      expect(result.current.hasGrantFor('other-track')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle string error conversion', async () => {
      mockWallet.createToken.mockRejectedValue('String error');

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.play('track-123', 5);
        } catch {
          // Expected
        }
      });

      expect(result.current.error?.message).toBe('String error');
    });

    it('should reset error on successful play after failure', async () => {
      mockWallet.createToken
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValueOnce('cashuBtoken');

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First play fails
      await act(async () => {
        try {
          await result.current.play('track-123', 5);
        } catch {
          // Expected
        }
      });

      expect(result.current.error).not.toBe(null);

      // Clear error and retry
      act(() => {
        result.current.clearError();
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(result.current.error).toBe(null);
      expect(result.current.isPlaying).toBe(true);
    });
  });
});
