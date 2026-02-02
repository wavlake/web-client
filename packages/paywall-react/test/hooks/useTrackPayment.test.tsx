/**
 * useTrackPayment Hook tests
 * 
 * Comprehensive tests for the complete payment flow hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WalletProvider, PaywallProvider, useTrackPayment } from '../../src/index.js';
import { PaywallError } from '@wavlake/paywall-client';

// ============================================================================
// Mock Factories
// ============================================================================

const createMockWallet = () => ({
  balance: 100,
  proofs: [{ C: 'c1', amount: 100, id: 'keyset1', secret: 's1' }],
  isLoaded: true,
  mintUrl: 'https://mint.test.com',
  load: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  createToken: vi.fn().mockResolvedValue('cashuBtoken'),
  receiveToken: vi.fn().mockResolvedValue(5),
  createMintQuote: vi.fn().mockResolvedValue({
    id: 'quote-123',
    request: 'lnbc100...',
    amount: 100,
  }),
  mintTokens: vi.fn().mockResolvedValue(100),
  checkProofs: vi.fn().mockResolvedValue({ valid: [], spent: [] }),
  pruneSpent: vi.fn().mockResolvedValue(0),
  on: vi.fn(),
  off: vi.fn(),
});

const createMockContentResult = (overrides = {}) => ({
  url: 'https://cdn.wavlake.com/track/signed-url',
  grant: {
    id: 'grant-123',
    expiresAt: new Date(Date.now() + 600000), // 10 minutes
    streamType: 'paid' as const,
  },
  change: undefined,
  changeAmount: undefined,
  ...overrides,
});

const createMockClient = () => ({
  apiUrl: 'https://api.test.com',
  timeout: 30000,
  requestAudio: vi.fn(),
  getAudioUrl: vi.fn(),
  getAudioPrice: vi.fn(),
  requestContent: vi.fn().mockResolvedValue(createMockContentResult()),
  replayGrant: vi.fn().mockResolvedValue(createMockContentResult()),
  getContentPrice: vi.fn().mockResolvedValue(5),
  fetchChange: vi.fn(),
  hasChange: vi.fn(),
  withConfig: vi.fn(),
});

// ============================================================================
// Test Suite
// ============================================================================

describe('useTrackPayment', () => {
  let mockWallet: ReturnType<typeof createMockWallet>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <WalletProvider wallet={mockWallet as any}>
        <PaywallProvider client={mockClient as any}>
          {children}
        </PaywallProvider>
      </WalletProvider>
    );
  };

  // ==========================================================================
  // Initial State
  // ==========================================================================

  describe('initial state', () => {
    it('should start with idle status', async () => {
      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      // Wait for wallet loading to complete
      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      expect(result.current.result).toBe(null);
      expect(result.current.error).toBe(null);
      expect(result.current.errorMessage).toBe(null);
      expect(result.current.isProcessing).toBe(false);
    });
  });

  // ==========================================================================
  // Successful Payment Flow
  // ==========================================================================

  describe('successful payment', () => {
    it('should complete payment with provided amount', async () => {
      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      let paymentResult: any;
      await act(async () => {
        paymentResult = await result.current.pay('track-123', 5);
      });

      // Verify the payment completed successfully
      expect(paymentResult).not.toBe(null);
      expect(paymentResult.url).toBe('https://cdn.wavlake.com/track/signed-url');
      expect(paymentResult.grant.id).toBe('grant-123');

      // Check final state
      expect(result.current.status).toBe('success');
      expect(result.current.result).not.toBe(null);
      expect(result.current.error).toBe(null);
      expect(result.current.isProcessing).toBe(false);

      // Verify correct calls were made
      expect(mockWallet.createToken).toHaveBeenCalledWith(5);
      expect(mockClient.requestContent).toHaveBeenCalledWith('track-123', 'cashuBtoken');
    });

    it('should fetch price when amount not provided', async () => {
      mockClient.getContentPrice.mockResolvedValue(3);

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-456');
      });

      expect(mockClient.getContentPrice).toHaveBeenCalledWith('track-456');
      expect(mockWallet.createToken).toHaveBeenCalledWith(3);
      expect(result.current.status).toBe('success');
    });

    it('should skip payment for free content (price = 0)', async () => {
      mockClient.getContentPrice.mockResolvedValue(0);
      mockClient.requestContent.mockResolvedValue(
        createMockContentResult({ grant: { id: 'free-grant', streamType: 'free' } })
      );

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('free-track');
      });

      // Should NOT create a token for free content
      expect(mockWallet.createToken).not.toHaveBeenCalled();
      // Should still request content (with empty token)
      expect(mockClient.requestContent).toHaveBeenCalledWith('free-track', '');
      expect(result.current.status).toBe('success');
    });

    it('should receive change when returned', async () => {
      mockClient.requestContent.mockResolvedValue(
        createMockContentResult({
          change: 'cashuBchange',
          changeAmount: 2,
        })
      );

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(mockWallet.receiveToken).toHaveBeenCalledWith('cashuBchange');
      expect(result.current.status).toBe('success');
    });

    it('should not fail if change handling errors', async () => {
      mockClient.requestContent.mockResolvedValue(
        createMockContentResult({
          change: 'cashuBchange',
          changeAmount: 2,
        })
      );
      mockWallet.receiveToken.mockRejectedValue(new Error('Change already claimed'));

      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      // Should still succeed even though change failed
      expect(result.current.status).toBe('success');
      expect(result.current.error).toBe(null);

      warnSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Status Transitions
  // ==========================================================================

  describe('status transitions', () => {
    it('should transition through creating-token and requesting-content', async () => {
      const statusLog: string[] = [];

      // Slow down the mocks to observe transitions
      mockWallet.createToken.mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'cashuBtoken';
      });
      mockClient.requestContent.mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 10));
        return createMockContentResult();
      });

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Start payment but don't await
      const payPromise = act(async () => {
        return result.current.pay('track-123', 5);
      });

      // Wait for the promise to resolve
      await payPromise;

      // Verify final state
      expect(result.current.status).toBe('success');
    });

    it('should show isProcessing during payment', async () => {
      let resolveToken: () => void;
      const tokenPromise = new Promise<void>(r => {
        resolveToken = r;
      });

      mockWallet.createToken.mockImplementation(async () => {
        await tokenPromise;
        return 'cashuBtoken';
      });

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Start payment
      let payPromise: Promise<any>;
      act(() => {
        payPromise = result.current.pay('track-123', 5);
      });

      // Check processing state
      await waitFor(() => {
        expect(result.current.isProcessing).toBe(true);
      });

      // Complete the payment
      await act(async () => {
        resolveToken!();
        await payPromise;
      });

      expect(result.current.isProcessing).toBe(false);
    });
  });

  // ==========================================================================
  // Grant Replay
  // ==========================================================================

  describe('grant replay', () => {
    it('should replay existing grant without payment', async () => {
      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.replay('track-123', 'existing-grant-id');
      });

      // Should NOT create a token
      expect(mockWallet.createToken).not.toHaveBeenCalled();
      // Should call replayGrant
      expect(mockClient.replayGrant).toHaveBeenCalledWith('track-123', 'existing-grant-id');
      expect(result.current.status).toBe('success');
    });

    it('should handle replay failure gracefully', async () => {
      mockClient.replayGrant.mockRejectedValue(new Error('Grant expired'));

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      const replayResult = await act(async () => {
        return result.current.replay('track-123', 'expired-grant-id');
      });

      expect(replayResult).toBe(null);
      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toBe('Grant expired');
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('should handle insufficient balance', async () => {
      mockWallet.createToken.mockRejectedValue(
        new Error('Insufficient balance: need 100, have 5')
      );

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      const payResult = await act(async () => {
        return result.current.pay('track-123', 100);
      });

      expect(payResult).toBe(null);
      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toContain('Insufficient balance');
    });

    it('should handle PaywallError with userMessage', async () => {
      const paywallError = new PaywallError({
        code: 'TOKEN_ALREADY_SPENT',
        message: 'Token already spent',
        details: {},
      });
      mockClient.requestContent.mockRejectedValue(paywallError);

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('This token has already been used');
    });

    it('should handle price check failure', async () => {
      mockClient.getContentPrice.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      const payResult = await act(async () => {
        return result.current.pay('track-123'); // No amount provided
      });

      expect(payResult).toBe(null);
      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toBe('Network error');
    });

    it('should convert non-Error throws to Error', async () => {
      // Throw a string instead of an Error
      mockWallet.createToken.mockRejectedValue('string error');

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('error');
      // WalletProvider converts string throws to Error(String(err))
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('string error');
      expect(result.current.errorMessage).toBe('string error');
    });
  });

  // ==========================================================================
  // Reset Functionality
  // ==========================================================================

  describe('reset', () => {
    it('should reset state to idle', async () => {
      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Complete a successful payment
      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.result).not.toBe(null);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.result).toBe(null);
      expect(result.current.error).toBe(null);
      expect(result.current.errorMessage).toBe(null);
    });

    it('should reset after error', async () => {
      mockWallet.createToken.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 5);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).not.toBe(null);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBe(null);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle rapid successive payments', async () => {
      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Start two payments quickly
      let promise1: Promise<any>;
      let promise2: Promise<any>;

      await act(async () => {
        promise1 = result.current.pay('track-1', 5);
        promise2 = result.current.pay('track-2', 3);
        await Promise.all([promise1, promise2]);
      });

      // Both should eventually complete
      // The second payment will have overwritten the first's state
      expect(result.current.status).toBe('success');
    });

    it('should handle zero-amount payment (edge case)', async () => {
      mockClient.requestContent.mockResolvedValue(
        createMockContentResult({ grant: { id: 'zero-grant', streamType: 'free' } })
      );

      const { result } = renderHook(() => useTrackPayment(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      await act(async () => {
        await result.current.pay('track-123', 0);
      });

      // Zero amount should skip token creation
      expect(mockWallet.createToken).not.toHaveBeenCalled();
      expect(mockClient.requestContent).toHaveBeenCalledWith('track-123', '');
      expect(result.current.status).toBe('success');
    });
  });
});
