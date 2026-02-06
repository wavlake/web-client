/**
 * useWallet Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WalletProvider, useWallet } from '../../src/index.js';

// Mock wallet
const createMockWallet = () => ({
  balance: 100,
  proofs: [{ C: 'c1', amount: 100, id: 'keyset1', secret: 's1' }],
  isLoaded: false,
  mintUrl: 'https://mint.test.com',
  unit: 'usd',
  historyCount: 0,
  load: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  createToken: vi.fn().mockResolvedValue('cashuBtoken'),
  previewToken: vi.fn().mockReturnValue({ canCreate: true, amount: 5, selectedProofs: [], change: 0, needsSwap: false }),
  receiveToken: vi.fn().mockResolvedValue(5),
  createMintQuote: vi.fn().mockResolvedValue({
    id: 'quote-123',
    request: 'lnbc100...',
    amount: 100,
  }),
  mintTokens: vi.fn().mockResolvedValue(100),
  checkProofs: vi.fn().mockResolvedValue({ valid: [], spent: [] }),
  pruneSpent: vi.fn().mockResolvedValue(0),
  getDefragStats: vi.fn().mockReturnValue({ proofCount: 1, balance: 100, fragmentation: 0, recommendation: 'none' }),
  needsDefragmentation: vi.fn().mockReturnValue(false),
  defragment: vi.fn().mockResolvedValue({ previousProofCount: 1, newProofCount: 1, saved: 0 }),
  getHistory: vi.fn().mockReturnValue({ records: [], hasMore: false }),
  getTransaction: vi.fn().mockReturnValue(null),
  on: vi.fn(),
  off: vi.fn(),
});

describe('useWallet', () => {
  let mockWallet: ReturnType<typeof createMockWallet>;

  beforeEach(() => {
    mockWallet = createMockWallet();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider wallet={mockWallet as any}>
      {children}
    </WalletProvider>
  );

  it('should throw when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => useWallet());
    }).toThrow('useWalletContext must be used within a WalletProvider');
    
    consoleSpy.mockRestore();
  });

  it('should provide initial state', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    // Initial state before load completes
    expect(result.current.balance).toBe(0);
    expect(result.current.proofs).toEqual([]);
    expect(result.current.isReady).toBe(false);
    expect(result.current.isLoading).toBe(true); // autoLoad triggers loading
    expect(result.current.error).toBe(null);

    // Wait for autoLoad to complete to avoid act() warnings
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should load wallet and update state', async () => {
    // Set up the mock to update balance when load is called
    mockWallet.load.mockImplementation(async () => {
      // Simulate the wallet events being fired
      const balanceHandler = mockWallet.on.mock.calls.find(
        ([event]: [string]) => event === 'balance-change'
      )?.[1];
      const proofsHandler = mockWallet.on.mock.calls.find(
        ([event]: [string]) => event === 'proofs-change'
      )?.[1];
      
      if (balanceHandler) balanceHandler(100);
      if (proofsHandler) proofsHandler([{ C: 'c1', amount: 100, id: 'keyset1', secret: 's1' }]);
    });

    const { result } = renderHook(() => useWallet(), { wrapper });

    // Wait for load to complete
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(mockWallet.load).toHaveBeenCalled();
  });

  it('should expose createToken action', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      const token = await result.current.createToken(10);
      expect(token).toBe('cashuBtoken');
    });

    expect(mockWallet.createToken).toHaveBeenCalledWith(10, undefined, undefined);
  });

  it('should expose receiveToken action', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      const amount = await result.current.receiveToken('cashuBtoken');
      expect(amount).toBe(5);
    });

    expect(mockWallet.receiveToken).toHaveBeenCalledWith('cashuBtoken', undefined, undefined);
  });

  it('should expose createMintQuote action', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      const quote = await result.current.createMintQuote(100);
      expect(quote.id).toBe('quote-123');
    });

    expect(mockWallet.createMintQuote).toHaveBeenCalledWith(100);
  });

  it('should expose clear action', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.clear();
    });

    expect(mockWallet.clear).toHaveBeenCalled();
  });

  it('should handle errors', async () => {
    mockWallet.createToken.mockRejectedValue(new Error('Insufficient balance'));

    const { result } = renderHook(() => useWallet(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.createToken(1000);
      } catch {
        // Expected
      }
    });

    expect(result.current.error?.message).toBe('Insufficient balance');
  });

  // New tests for expanded context
  describe('expanded context features', () => {
    it('should expose mintUrl and unit', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      expect(result.current.mintUrl).toBe('https://mint.test.com');
      expect(result.current.unit).toBe('usd');
    });

    it('should expose previewToken', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      const preview = result.current.previewToken(5);
      expect(preview.canCreate).toBe(true);
      expect(mockWallet.previewToken).toHaveBeenCalledWith(5);
    });

    it('should expose defragmentation methods', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      // Test getDefragStats
      const stats = result.current.getDefragStats();
      expect(stats.recommendation).toBe('none');
      expect(mockWallet.getDefragStats).toHaveBeenCalled();

      // Test needsDefragmentation
      expect(result.current.needsDefragmentation()).toBe(false);
      expect(mockWallet.needsDefragmentation).toHaveBeenCalled();
    });

    it('should expose defragment action', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        const defragResult = await result.current.defragment();
        expect(defragResult.saved).toBe(0);
      });

      expect(mockWallet.defragment).toHaveBeenCalled();
    });

    it('should expose history methods', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      // Test getHistory
      const history = result.current.getHistory({ limit: 10 });
      expect(history.records).toEqual([]);
      expect(mockWallet.getHistory).toHaveBeenCalledWith({ limit: 10 });

      // Test getTransaction
      const tx = result.current.getTransaction('tx-123');
      expect(tx).toBeNull();
      expect(mockWallet.getTransaction).toHaveBeenCalledWith('tx-123');

      // Test historyCount
      expect(result.current.historyCount).toBe(0);
    });

    it('should expose underlying wallet instance', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      expect(result.current.wallet).toBe(mockWallet);
    });
  });
});
