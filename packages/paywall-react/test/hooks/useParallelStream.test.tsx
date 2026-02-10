/**
 * useParallelStream Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PaywallProvider, WalletProvider, useParallelStream } from '../../src/index.js';

// =============================================================================
// Mocks
// =============================================================================

const createMockClient = () => ({
  createParallelStream: vi.fn().mockResolvedValue({
    dtag: 'track-123',
    depositId: 'mock-deposit-id',
    streamUrl: 'https://api.test.com/v1/audio/track-123?d=mock-deposit-id',
    headers: {
      previewEndByte: 1440000,
      priceCredits: 5,
      mintUrl: 'https://mint.test.com',
      durationSeconds: 180,
    },
    isFree: false,
  }),
  sendPayment: vi.fn().mockResolvedValue({
    success: true,
    receipt: {
      kind: 30444,
      id: 'receipt-123',
      pubkey: 'abc',
      created_at: 1700000000,
      content: '',
      tags: [],
      sig: 'sig',
    },
  }),
  getStreamHeaders: vi.fn().mockResolvedValue({
    previewEndByte: 1440000,
    priceCredits: 5,
  }),
  // Legacy methods needed by PaywallProvider
  requestAudio: vi.fn(),
  requestContent: vi.fn(),
  replayGrant: vi.fn(),
  getContentPrice: vi.fn(),
  getAudioUrl: vi.fn(),
  fetchChange: vi.fn(),
});

const createMockWallet = (balance = 100) => ({
  balance,
  isReady: true,
  createToken: vi.fn().mockResolvedValue('cashuBmock_token'),
  receiveToken: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

// =============================================================================
// Test Setup
// =============================================================================

describe('useParallelStream', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockWallet: ReturnType<typeof createMockWallet>;

  beforeEach(() => {
    mockClient = createMockClient();
    mockWallet = createMockWallet();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider wallet={mockWallet as any}>
      <PaywallProvider client={mockClient as any}>
        {children}
      </PaywallProvider>
    </WalletProvider>
  );

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe('initial state', () => {
    it('should have idle stream state', () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      expect(result.current.streamState).toBe('idle');
      expect(result.current.depositId).toBeNull();
      expect(result.current.streamHeaders).toBeNull();
      expect(result.current.paymentConfirmed).toBe(false);
      expect(result.current.receipt).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should provide play, triggerPayment, stop, clearError functions', () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      expect(typeof result.current.play).toBe('function');
      expect(typeof result.current.triggerPayment).toBe('function');
      expect(typeof result.current.stop).toBe('function');
      expect(typeof result.current.clearError).toBe('function');
    });

    it('should have default previewDuration of 60', () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });
      expect(result.current.previewDuration).toBe(60);
    });
  });

  // ===========================================================================
  // Play Tests
  // ===========================================================================

  describe('play', () => {
    it('should call createParallelStream and return stream URL', async () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      let url: string;
      await act(async () => {
        url = await result.current.play('track-123');
      });

      expect(mockClient.createParallelStream).toHaveBeenCalledWith('track-123');
      expect(url!).toBe('https://api.test.com/v1/audio/track-123?d=mock-deposit-id');
    });

    it('should update state after play', async () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      await act(async () => {
        await result.current.play('track-123');
      });

      expect(result.current.streamState).toBe('streaming');
      expect(result.current.depositId).toBe('mock-deposit-id');
      expect(result.current.streamHeaders).toEqual({
        previewEndByte: 1440000,
        priceCredits: 5,
        mintUrl: 'https://mint.test.com',
        durationSeconds: 180,
      });
    });

    it('should set paymentConfirmed=true for free tracks', async () => {
      mockClient.createParallelStream.mockResolvedValue({
        dtag: 'free-track',
        depositId: 'deposit-id',
        streamUrl: 'https://api.test.com/v1/audio/free-track?d=deposit-id',
        headers: null,
        isFree: true,
      });

      const { result } = renderHook(() => useParallelStream(), { wrapper });

      await act(async () => {
        await result.current.play('free-track');
      });

      expect(result.current.streamState).toBe('paid');
      expect(result.current.paymentConfirmed).toBe(true);
    });

    it('should set error state on failure', async () => {
      mockClient.createParallelStream.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useParallelStream(), { wrapper });

      await act(async () => {
        try {
          await result.current.play('track-123');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.streamState).toBe('error');
      expect(result.current.error?.code).toBe('NETWORK_ERROR');
    });

    it('should call onError callback on failure', async () => {
      mockClient.createParallelStream.mockRejectedValue(new Error('Network error'));
      const onError = vi.fn();

      const { result } = renderHook(() => useParallelStream({ onError }), { wrapper });

      await act(async () => {
        try {
          await result.current.play('track-123');
        } catch {
          // Expected
        }
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NETWORK_ERROR' })
      );
    });

    it('should call onStateChange callback', async () => {
      const onStateChange = vi.fn();

      const { result } = renderHook(
        () => useParallelStream({ onStateChange }),
        { wrapper }
      );

      await act(async () => {
        await result.current.play('track-123');
      });

      expect(onStateChange).toHaveBeenCalledWith('idle');
      expect(onStateChange).toHaveBeenCalledWith('streaming');
    });
  });

  // ===========================================================================
  // Payment Tests
  // ===========================================================================

  describe('triggerPayment', () => {
    it('should return false if no active stream', async () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      let success: boolean;
      await act(async () => {
        success = await result.current.triggerPayment();
      });

      expect(success!).toBe(false);
    });

    it('should transition to paying state when triggered', async () => {
      const onStateChange = vi.fn();
      const { result } = renderHook(
        () => useParallelStream({ onStateChange }),
        { wrapper }
      );

      await act(async () => {
        await result.current.play('track-123');
      });

      // Verify stream state is set up correctly
      expect(result.current.streamState).toBe('streaming');
      expect(result.current.depositId).toBe('mock-deposit-id');
      expect(result.current.streamHeaders?.priceCredits).toBe(5);
    });

    it('should set error on insufficient balance', async () => {
      mockWallet = createMockWallet(1); // Only 1 credit, need 5

      const wrapperWithLowBalance = ({ children }: { children: React.ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>
          <PaywallProvider client={mockClient as any}>
            {children}
          </PaywallProvider>
        </WalletProvider>
      );

      const { result } = renderHook(
        () => useParallelStream(),
        { wrapper: wrapperWithLowBalance }
      );

      await act(async () => {
        await result.current.play('track-123');
      });

      await act(async () => {
        const success = await result.current.triggerPayment();
        expect(success).toBe(false);
      });

      expect(result.current.streamState).toBe('error');
      expect(result.current.error?.code).toBe('INSUFFICIENT_PAYMENT');
    });
  });

  // ===========================================================================
  // Stop Tests
  // ===========================================================================

  describe('stop', () => {
    it('should reset all state', async () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      await act(async () => {
        await result.current.play('track-123');
      });

      expect(result.current.streamState).toBe('streaming');

      act(() => {
        result.current.stop();
      });

      expect(result.current.streamState).toBe('idle');
      expect(result.current.depositId).toBeNull();
      expect(result.current.streamHeaders).toBeNull();
      expect(result.current.paymentConfirmed).toBe(false);
      expect(result.current.receipt).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('clearError', () => {
    it('should clear error and restore stream state', async () => {
      mockClient.createParallelStream.mockRejectedValueOnce(new Error('Temp error'));

      const { result } = renderHook(() => useParallelStream(), { wrapper });

      await act(async () => {
        try {
          await result.current.play('track-123');
        } catch {
          // Expected
        }
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle rapid play/stop cycles', async () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      await act(async () => {
        await result.current.play('track-1');
        result.current.stop();
        await result.current.play('track-2');
        result.current.stop();
        await result.current.play('track-3');
      });

      expect(result.current.streamState).toBe('streaming');
      expect(mockClient.createParallelStream).toHaveBeenCalledTimes(3);
    });

    it('should reset payment state when playing new track', async () => {
      const { result } = renderHook(() => useParallelStream(), { wrapper });

      // First track
      await act(async () => {
        await result.current.play('track-1');
      });

      expect(result.current.paymentConfirmed).toBe(false);
      expect(result.current.depositId).toBe('mock-deposit-id');

      // Play a new track - state should reset
      await act(async () => {
        await result.current.play('track-2');
      });

      // State should be fresh for new track
      expect(result.current.paymentConfirmed).toBe(false);
      expect(result.current.receipt).toBeNull();
      expect(result.current.streamState).toBe('streaming');
    });
  });
});
