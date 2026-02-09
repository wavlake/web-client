/**
 * useTokenPreview Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { WalletProvider } from '../../src/providers/WalletProvider.js';
import { useTokenPreview, useTokenPreviews } from '../../src/hooks/useTokenPreview.js';

// Create mock proofs using plain objects
function createMockProofs(amounts: number[]): Array<{
  id: string;
  amount: number;
  C: string;
  secret: string;
}> {
  return amounts.map((amount, i) => ({
    id: 'keyset-123',
    amount,
    C: `proof-${i}-${amount}`,
    secret: `secret-${i}`,
  }));
}

// Mock wallet factory
const createMockWallet = (options: {
  proofs?: ReturnType<typeof createMockProofs>;
  balance?: number;
} = {}) => {
  const proofs = options.proofs ?? createMockProofs([1, 2, 4, 8, 16]);
  const balance = options.balance ?? proofs.reduce((s, p) => s + p.amount, 0);
  
  return {
    balance,
    proofs,
    isLoaded: true,
    mintUrl: 'https://mint.test.com',
    historyCount: 0,
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    createToken: vi.fn().mockResolvedValue('cashuBtoken'),
    receiveToken: vi.fn().mockResolvedValue(5),
    createMintQuote: vi.fn(),
    mintTokens: vi.fn(),
    checkProofs: vi.fn().mockResolvedValue({ valid: [], spent: [] }),
    pruneSpent: vi.fn().mockResolvedValue(0),
    defragment: vi.fn().mockResolvedValue({
      previousProofCount: 5,
      newProofCount: 2,
      previousBalance: 31,
      newBalance: 31,
      saved: 3,
    }),
    previewToken: vi.fn().mockImplementation((amount: number) => {
      if (amount <= 0) {
        return {
          canCreate: false,
          amount,
          availableBalance: balance,
          availableDenominations: [...new Set(proofs.map(p => p.amount))].sort((a, b) => a - b),
          denominationCounts: proofs.reduce((acc, p) => {
            acc[p.amount] = (acc[p.amount] || 0) + 1;
            return acc;
          }, {} as Record<number, number>),
          selectedProofs: [],
          selectedTotal: 0,
          change: 0,
          needsSwap: false,
          issue: 'Amount must be positive',
        };
      }
      if (amount > balance) {
        return {
          canCreate: false,
          amount,
          availableBalance: balance,
          availableDenominations: [...new Set(proofs.map(p => p.amount))].sort((a, b) => a - b),
          denominationCounts: proofs.reduce((acc, p) => {
            acc[p.amount] = (acc[p.amount] || 0) + 1;
            return acc;
          }, {} as Record<number, number>),
          selectedProofs: [],
          selectedTotal: 0,
          change: 0,
          needsSwap: false,
          issue: `Insufficient balance: need ${amount}, have ${balance}`,
          suggestion: `Add ${amount - balance} more credits to your wallet.`,
        };
      }
      // Simulate finding exact match or swap
      const selected = proofs.filter(p => p.amount === amount);
      const needsSwap = selected.length === 0;
      const selectedTotal = selected.length > 0 ? selected[0].amount : (proofs[0]?.amount ?? 0);
      return {
        canCreate: true,
        amount,
        availableBalance: balance,
        availableDenominations: [...new Set(proofs.map(p => p.amount))].sort((a, b) => a - b),
        denominationCounts: proofs.reduce((acc, p) => {
          acc[p.amount] = (acc[p.amount] || 0) + 1;
          return acc;
        }, {} as Record<number, number>),
        selectedProofs: selected.length > 0 ? [selected[0]] : [proofs[0]],
        selectedTotal: needsSwap ? (proofs[0]?.amount ?? amount) : amount,
        change: needsSwap ? ((proofs[0]?.amount ?? amount) - amount) : 0,
        needsSwap,
      };
    }),
    getDefragStats: vi.fn().mockReturnValue({
      proofCount: proofs.length,
      balance,
      averageProofSize: balance / proofs.length,
      fragmentation: 0.3,
      smallProofCount: 2,
      recommendation: 'none',
      estimatedNewProofCount: 3,
    }),
    needsDefragmentation: vi.fn().mockReturnValue(false),
    getHistory: vi.fn().mockReturnValue({ records: [], total: 0, hasMore: false }),
    getTransaction: vi.fn().mockReturnValue(null),
    getHistorySummary: vi.fn().mockReturnValue({ 
      totalSent: 0, 
      totalReceived: 0, 
      netChange: 0, 
      transactionCount: 0 
    }),
    on: vi.fn(),
    off: vi.fn(),
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockWallet = ReturnType<typeof createMockWallet>;

describe('useTokenPreview', () => {
  let mockWallet: MockWallet;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWallet = createMockWallet();
  });

  const createWrapper = (wallet: MockWallet) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ children }: { children: React.ReactNode }) => (
      <WalletProvider wallet={wallet as any}>
        {children}
      </WalletProvider>
    );

  describe('basic functionality', () => {
    it('should return preview when wallet is ready', () => {
      const { result } = renderHook(() => useTokenPreview(5), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.isReady).toBe(true);
      expect(result.current.amount).toBe(5);
      expect(mockWallet.previewToken).toHaveBeenCalledWith(5);
    });

    it('should return canCreate: false for undefined amount', () => {
      const { result } = renderHook(() => useTokenPreview(undefined), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.canCreate).toBe(false);
      expect(result.current.issue).toBe('No amount specified');
    });

    it('should return canCreate: false for zero amount', () => {
      const { result } = renderHook(() => useTokenPreview(0), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.canCreate).toBe(false);
      expect(result.current.issue).toBe('Invalid amount');
    });

    it('should return canCreate: false for negative amount', () => {
      const { result } = renderHook(() => useTokenPreview(-5), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.canCreate).toBe(false);
    });
  });

  describe('sufficient balance scenarios', () => {
    it('should return canCreate: true when balance is sufficient', () => {
      const proofs = createMockProofs([1, 2, 4, 8, 16]); // Total: 31
      mockWallet = createMockWallet({ proofs });

      const { result } = renderHook(() => useTokenPreview(5), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.canCreate).toBe(true);
      expect(result.current.amount).toBe(5);
    });

    it('should indicate needsSwap when exact match not available', () => {
      const proofs = createMockProofs([4, 8, 16]); // No 5
      mockWallet = createMockWallet({ proofs });

      const { result } = renderHook(() => useTokenPreview(5), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.canCreate).toBe(true);
      expect(result.current.needsSwap).toBe(true);
    });

    it('should not require swap for exact denomination match', () => {
      const proofs = createMockProofs([1, 2, 4, 8]); // Has 4
      mockWallet = createMockWallet({ proofs });

      const { result } = renderHook(() => useTokenPreview(4), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.canCreate).toBe(true);
      expect(result.current.needsSwap).toBe(false);
    });
  });

  describe('insufficient balance scenarios', () => {
    it('should return canCreate: false when balance is insufficient', () => {
      const proofs = createMockProofs([1, 2, 4]); // Total: 7
      mockWallet = createMockWallet({ proofs });

      const { result } = renderHook(() => useTokenPreview(20), {
        wrapper: createWrapper(mockWallet),
      });

      expect(result.current.canCreate).toBe(false);
      expect(result.current.issue).toContain('Insufficient balance');
      expect(result.current.suggestion).toBeDefined();
    });
  });

  describe('reactive updates', () => {
    it('should update when amount changes', () => {
      const { result, rerender } = renderHook(
        ({ amount }) => useTokenPreview(amount),
        {
          wrapper: createWrapper(mockWallet),
          initialProps: { amount: 5 },
        }
      );

      expect(result.current.amount).toBe(5);

      rerender({ amount: 10 });

      expect(result.current.amount).toBe(10);
      expect(mockWallet.previewToken).toHaveBeenCalledWith(10);
    });
  });
});

describe('useTokenPreviews', () => {
  let mockWallet: MockWallet;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWallet = createMockWallet();
  });

  const createWrapper = (wallet: MockWallet) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ children }: { children: React.ReactNode }) => (
      <WalletProvider wallet={wallet as any}>
        {children}
      </WalletProvider>
    );

  it('should return previews for multiple amounts', () => {
    const { result } = renderHook(() => useTokenPreviews([1, 5, 10]), {
      wrapper: createWrapper(mockWallet),
    });

    expect(result.current[1]).toBeDefined();
    expect(result.current[5]).toBeDefined();
    expect(result.current[10]).toBeDefined();
  });

  it('should deduplicate amounts', () => {
    const { result } = renderHook(() => useTokenPreviews([5, 5, 5, 10]), {
      wrapper: createWrapper(mockWallet),
    });

    // Should only have 2 unique entries
    expect(Object.keys(result.current)).toHaveLength(2);
    expect(result.current[5]).toBeDefined();
    expect(result.current[10]).toBeDefined();
  });

  it('should handle empty array', () => {
    const { result } = renderHook(() => useTokenPreviews([]), {
      wrapper: createWrapper(mockWallet),
    });

    expect(Object.keys(result.current)).toHaveLength(0);
  });

  it('should include isReady on each preview', () => {
    const { result } = renderHook(() => useTokenPreviews([1, 5]), {
      wrapper: createWrapper(mockWallet),
    });

    expect(result.current[1].isReady).toBe(true);
    expect(result.current[5].isReady).toBe(true);
  });
});
