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
    change: null,
  }),
  requestContent: vi.fn().mockResolvedValue({
    url: 'https://cdn.wavlake.com/signed-url',
    grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
    change: null,
  }),
  replayGrant: vi.fn(),
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
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
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
      expect(result.current.isPlaying).toBe(true);
    });

    it('should handle change tokens', async () => {
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/signed-url',
        grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
        change: 'cashuBchangeToken',
      });

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(mockWallet.receiveToken).toHaveBeenCalledWith('cashuBchangeToken');
    });

    it('should continue if change handling fails', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/signed-url',
        grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
        change: 'cashuBchangeToken',
      });
      mockWallet.receiveToken.mockRejectedValue(new Error('Change failed'));

      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      // Play should still succeed
      expect(result.current.isPlaying).toBe(true);
      expect(result.current.audioUrl).toBe('https://cdn.wavlake.com/signed-url');
      
      consoleSpy.mockRestore();
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

      expect(mockClient.requestAudio).toHaveBeenCalledWith('track-123', 'cashuBtoken');
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(result.current.audioUrl).toBe(mockObjectURL);
      expect(result.current.grantId).toBe(null); // No grant with audio endpoint
    });

    it('should handle audio response change', async () => {
      mockClient.requestAudio.mockResolvedValue({
        audio: new Blob(['audio-data'], { type: 'audio/mpeg' }),
        change: 'cashuBchangeToken',
      });

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

      expect(mockWallet.receiveToken).toHaveBeenCalledWith('cashuBchangeToken');
    });

    it('should not receive change when autoReceiveChange is false', async () => {
      mockClient.requestAudio.mockResolvedValue({
        audio: new Blob(['audio-data'], { type: 'audio/mpeg' }),
        change: 'cashuBchangeToken',
      });

      const { result } = renderHook(
        () => useTrackPlayer({ useContentEndpoint: false, autoReceiveChange: false }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(mockWallet.receiveToken).not.toHaveBeenCalled();
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
          grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
          change: null,
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

    it('should preserve grantId for potential replay', async () => {
      const { result } = renderHook(() => useTrackPlayer(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.play('track-123', 5);
      });

      expect(result.current.grantId).toBe('grant-123');

      act(() => {
        result.current.stop();
      });

      // grantId should be preserved
      expect(result.current.grantId).toBe('grant-123');
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
          grant: { id: 'grant-1', expiresAt: Date.now() + 600000 },
          change: null,
        })
        .mockResolvedValueOnce({
          url: 'https://cdn.wavlake.com/track-2',
          grant: { id: 'grant-2', expiresAt: Date.now() + 600000 },
          change: null,
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
