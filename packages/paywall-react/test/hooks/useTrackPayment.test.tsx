/**
 * useTrackPayment Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WalletProvider, PaywallProvider } from '../../src/index.js';
import { useTrackPayment } from '../../src/hooks/useTrackPayment.js';

// Mock wallet
const createMockWallet = (balance = 100) => ({
  balance,
  proofs: [{ C: 'c1', amount: balance, id: 'keyset1', secret: 's1' }],
  isLoaded: true,
  mintUrl: 'https://mint.test.com',
  unit: 'usd',
  historyCount: 0,
  load: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  createToken: vi.fn().mockResolvedValue('cashuBtoken'),
  previewToken: vi.fn().mockReturnValue({ canCreate: true, amount: 5, selectedProofs: [], change: 0, needsSwap: false }),
  receiveToken: vi.fn().mockResolvedValue(3),
  createMintQuote: vi.fn(),
  mintTokens: vi.fn(),
  checkProofs: vi.fn(),
  pruneSpent: vi.fn(),
  getDefragStats: vi.fn().mockReturnValue({ proofCount: 1, balance, fragmentation: 0, recommendation: 'none' }),
  needsDefragmentation: vi.fn().mockReturnValue(false),
  defragment: vi.fn().mockResolvedValue({ previousProofCount: 1, newProofCount: 1, saved: 0 }),
  getHistory: vi.fn().mockReturnValue({ records: [], hasMore: false }),
  getTransaction: vi.fn().mockReturnValue(null),
  on: vi.fn(),
  off: vi.fn(),
});

// Mock PaywallClient
const createMockClient = () => ({
  requestAudio: vi.fn(),
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
  getAudioUrl: vi.fn(),
  fetchChange: vi.fn(),
});

describe('useTrackPayment', () => {
  let mockWallet: ReturnType<typeof createMockWallet>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    mockClient = createMockClient();
  });

  const createWrapper = () => ({ children }: { children: React.ReactNode }) => (
    <WalletProvider wallet={mockWallet as any}>
      <PaywallProvider client={mockClient as any}>
        {children}
      </PaywallProvider>
    </WalletProvider>
  );

  it('should provide initial state', async () => {
    const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });

    expect(result.current.result).toBe(null);
    expect(result.current.error).toBe(null);
    expect(result.current.errorMessage).toBe(null);
    expect(result.current.isProcessing).toBe(false);
  });

  describe('pay', () => {
    it('should complete full payment flow with provided price', async () => {
      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      let payResult: any;
      await act(async () => {
        payResult = await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('success');
      expect(payResult?.url).toBe('https://cdn.wavlake.com/signed-url');
      expect(mockWallet.createToken).toHaveBeenCalledWith(5, undefined, undefined);
      expect(mockClient.requestContent).toHaveBeenCalledWith('track-123', 'cashuBtoken');
    });

    it('should fetch price when not provided', async () => {
      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123');
      });

      expect(mockClient.getContentPrice).toHaveBeenCalledWith('track-123');
      expect(mockWallet.createToken).toHaveBeenCalledWith(5, undefined, undefined);
      expect(result.current.status).toBe('success');
    });

    it('should handle free content (price = 0)', async () => {
      mockClient.getContentPrice.mockResolvedValue(0);
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/free-content',
        grant: { id: 'grant-free', expiresAt: Date.now() + 600000 },
        change: null,
      });

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('free-track');
      });

      expect(mockWallet.createToken).not.toHaveBeenCalled();
      expect(mockClient.requestContent).toHaveBeenCalledWith('free-track', '');
      expect(result.current.status).toBe('success');
    });

    it('should process change tokens', async () => {
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/signed-url',
        grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
        change: 'cashuBchangeToken',
      });

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(mockWallet.receiveToken).toHaveBeenCalledWith('cashuBchangeToken', undefined, undefined);
    });

    it('should continue successfully even if change handling fails', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      mockClient.requestContent.mockResolvedValue({
        url: 'https://cdn.wavlake.com/signed-url',
        grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
        change: 'cashuBchangeToken',
      });
      mockWallet.receiveToken.mockRejectedValue(new Error('Change processing failed'));

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      // Payment should still succeed
      expect(result.current.status).toBe('success');
      expect(result.current.result?.url).toBe('https://cdn.wavlake.com/signed-url');
      
      consoleSpy.mockRestore();
    });

    it('should transition through status states', async () => {
      let resolvePrice: Function;
      let resolveContent: Function;
      let resolveToken: Function;
      
      mockClient.getContentPrice.mockReturnValue(
        new Promise(r => { resolvePrice = r; })
      );
      mockWallet.createToken.mockReturnValue(
        new Promise(r => { resolveToken = r; })
      );
      mockClient.requestContent.mockReturnValue(
        new Promise(r => { resolveContent = r; })
      );

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Start payment without amount (triggers price check)
      act(() => {
        result.current.pay('track-123');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('checking-price');
        expect(result.current.isProcessing).toBe(true);
      });

      // Resolve price
      await act(async () => {
        resolvePrice!(5);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('creating-token');
      });

      // Resolve token
      await act(async () => {
        resolveToken!('cashuBtoken');
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('requesting-content');
      });

      // Resolve content
      await act(async () => {
        resolveContent!({
          url: 'https://cdn.wavlake.com/signed-url',
          grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
          change: null,
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('success');
        expect(result.current.isProcessing).toBe(false);
      });
    });

    it('should handle token creation error', async () => {
      mockWallet.createToken.mockRejectedValue(new Error('Insufficient balance'));

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 100);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toBe('Insufficient balance');
      expect(result.current.errorMessage).toBe('Insufficient balance');
    });

    it('should handle content request error', async () => {
      mockClient.requestContent.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('Server error');
    });

    it('should return null on error', async () => {
      mockWallet.createToken.mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      let payResult: any;
      await act(async () => {
        payResult = await result.current.pay('track-123', 5);
      });

      expect(payResult).toBe(null);
    });
  });

  describe('replay', () => {
    it('should replay existing grant without payment', async () => {
      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      let replayResult: any;
      await act(async () => {
        replayResult = await result.current.replay('track-123', 'grant-123');
      });

      expect(result.current.status).toBe('success');
      expect(replayResult?.url).toBe('https://cdn.wavlake.com/replay-url');
      expect(mockWallet.createToken).not.toHaveBeenCalled();
      expect(mockClient.replayGrant).toHaveBeenCalledWith('track-123', 'grant-123');
    });

    it('should handle replay error', async () => {
      mockClient.replayGrant.mockRejectedValue(new Error('Grant expired'));

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.replay('track-123', 'expired-grant');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('Grant expired');
    });
  });

  describe('reset', () => {
    it('should reset state to idle', async () => {
      mockWallet.createToken.mockRejectedValue(new Error('Test error'));

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Trigger error state
      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('error');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBe(null);
      expect(result.current.result).toBe(null);
    });

    it('should allow new payment after reset', async () => {
      mockWallet.createToken
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce('cashuBtoken');

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // First attempt fails
      await act(async () => {
        await result.current.pay('track-123', 5);
      });
      expect(result.current.status).toBe('error');

      // Reset and retry
      act(() => {
        result.current.reset();
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('success');
    });
  });

  describe('isProcessing', () => {
    it('should be true during payment flow', async () => {
      let resolveContent: Function;
      mockClient.requestContent.mockReturnValue(
        new Promise(r => { resolveContent = r; })
      );

      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      act(() => {
        result.current.pay('track-123', 5);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(true);
      });

      await act(async () => {
        resolveContent!({
          url: 'https://cdn.wavlake.com/signed-url',
          grant: { id: 'grant-123', expiresAt: Date.now() + 600000 },
          change: null,
        });
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });
    });

    it('should be false for idle, success, and error states', async () => {
      const { result } = renderHook(() => useTrackPayment(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Idle
      expect(result.current.isProcessing).toBe(false);

      // Success
      await act(async () => {
        await result.current.pay('track-123', 5);
      });
      expect(result.current.status).toBe('success');
      expect(result.current.isProcessing).toBe(false);

      // Reset and trigger error
      act(() => {
        result.current.reset();
      });
      mockClient.requestContent.mockRejectedValue(new Error('Error'));

      await act(async () => {
        await result.current.pay('track-123', 5);
      });
      expect(result.current.status).toBe('error');
      expect(result.current.isProcessing).toBe(false);
    });
  });
});
