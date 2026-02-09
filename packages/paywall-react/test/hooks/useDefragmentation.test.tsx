/**
 * useDefragmentation Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WalletProvider } from '../../src/providers/WalletProvider.js';
import {
  useDefragmentation,
  useNeedsDefragmentation,
  useFragmentationPercentage,
} from '../../src/hooks/useDefragmentation.js';

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

// Calculate fragmentation score for mock
function calculateFragmentation(proofs: ReturnType<typeof createMockProofs>): number {
  if (proofs.length === 0) return 0;
  const balance = proofs.reduce((s, p) => s + p.amount, 0);
  const avgSize = balance / proofs.length;
  // More proofs = more fragmented; smaller avg size = more fragmented
  const smallProofs = proofs.filter(p => p.amount < 4).length;
  return Math.min(1, (smallProofs / proofs.length) + (proofs.length > 5 ? 0.3 : 0));
}

// Mock wallet factory
const createMockWallet = (options: {
  proofs?: ReturnType<typeof createMockProofs>;
  balance?: number;
  defragmentResult?: {
    previousProofCount: number;
    newProofCount: number;
    previousBalance: number;
    newBalance: number;
    saved: number;
  };
  defragmentError?: Error;
} = {}) => {
  const proofs = options.proofs ?? createMockProofs([1, 2, 4, 8, 16]);
  const balance = options.balance ?? proofs.reduce((s, p) => s + p.amount, 0);
  const fragmentation = calculateFragmentation(proofs);
  const needsDefrag = fragmentation > 0.5;
  
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
    defragment: vi.fn().mockImplementation(async () => {
      if (options.defragmentError) {
        throw options.defragmentError;
      }
      return options.defragmentResult ?? {
        previousProofCount: proofs.length,
        newProofCount: 2,
        previousBalance: balance,
        newBalance: balance,
        saved: proofs.length - 2,
      };
    }),
    previewToken: vi.fn().mockImplementation((amount: number) => ({
      canCreate: amount <= balance,
      amount,
      availableBalance: balance,
      availableDenominations: [...new Set(proofs.map(p => p.amount))].sort((a, b) => a - b),
      denominationCounts: {},
      selectedProofs: [],
      selectedTotal: 0,
      change: 0,
      needsSwap: false,
    })),
    getDefragStats: vi.fn().mockReturnValue({
      proofCount: proofs.length,
      balance,
      averageProofSize: balance / (proofs.length || 1),
      fragmentation,
      smallProofCount: proofs.filter(p => p.amount < 4).length,
      recommendation: needsDefrag ? 'recommended' : 'none',
      estimatedNewProofCount: Math.ceil(Math.log2(balance + 1)),
    }),
    needsDefragmentation: vi.fn().mockReturnValue(needsDefrag),
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

describe('useDefragmentation', () => {
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

  describe('stats calculation', () => {
    it('should calculate stats from proofs', async () => {
      const proofs = createMockProofs([1, 1, 1, 1, 2, 2, 4]);
      mockWallet = createMockWallet({ proofs });
      
      const { result } = renderHook(() => useDefragmentation(), {
        wrapper: createWrapper(mockWallet),
      });

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      expect(result.current.stats).toBeDefined();
      expect(result.current.stats!.proofCount).toBe(7);
      expect(result.current.stats!.balance).toBe(12);
    });

    it('should indicate needsDefragmentation when heavily fragmented', async () => {
      const proofs = createMockProofs([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
      mockWallet = createMockWallet({ proofs });

      const { result } = renderHook(() => useDefragmentation(), {
        wrapper: createWrapper(mockWallet),
      });

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      expect(result.current.fragmentation).toBeGreaterThan(0.5);
      expect(result.current.needsDefragmentation).toBe(true);
    });

    it('should not recommend defragmentation for healthy wallet', async () => {
      const proofs = createMockProofs([16, 32, 64]);
      mockWallet = createMockWallet({ proofs });

      const { result } = renderHook(() => useDefragmentation(), {
        wrapper: createWrapper(mockWallet),
      });

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      expect(result.current.needsDefragmentation).toBe(false);
      expect(result.current.recommendation).toBe('none');
    });
  });

  describe('defragment action', () => {
    it('should call wallet defragment and update state on success', async () => {
      const proofs = createMockProofs([1, 1, 2, 4, 8]);
      const defragmentResult = {
        previousProofCount: 5,
        newProofCount: 2,
        previousBalance: 16,
        newBalance: 16,
        saved: 3,
      };
      mockWallet = createMockWallet({ proofs, defragmentResult });

      const { result } = renderHook(() => useDefragmentation(), {
        wrapper: createWrapper(mockWallet),
      });

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      let defragResult: ReturnType<typeof result.current.defragment> extends Promise<infer T> ? T : never;
      await act(async () => {
        defragResult = await result.current.defragment();
      });

      expect(mockWallet.defragment).toHaveBeenCalled();
      expect(defragResult!).toEqual(defragmentResult);
      expect(result.current.lastResult).toEqual(defragmentResult);
      expect(result.current.isDefragmenting).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle defragment errors', async () => {
      mockWallet = createMockWallet({
        proofs: createMockProofs([1, 2]),
        defragmentError: new Error('Mint swap failed'),
      });

      const { result } = renderHook(() => useDefragmentation(), {
        wrapper: createWrapper(mockWallet),
      });

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      await act(async () => {
        try {
          await result.current.defragment();
        } catch {
          // Expected error
        }
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Mint swap failed');
      expect(result.current.isDefragmenting).toBe(false);
      expect(result.current.lastResult).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      mockWallet = createMockWallet({
        proofs: createMockProofs([1, 2]),
        defragmentError: new Error('Failed'),
      });

      const { result } = renderHook(() => useDefragmentation(), {
        wrapper: createWrapper(mockWallet),
      });

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      await act(async () => {
        try {
          await result.current.defragment();
        } catch {
          // Expected error
        }
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('refreshStats', () => {
    it('should trigger a stats recalculation', async () => {
      const proofs = createMockProofs([1, 2, 4]);
      mockWallet = createMockWallet({ proofs });

      const { result } = renderHook(() => useDefragmentation(), {
        wrapper: createWrapper(mockWallet),
      });

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      const initialStats = result.current.stats;

      act(() => {
        result.current.refreshStats();
      });

      // Stats should still exist after refresh
      expect(result.current.stats).toBeDefined();
      // Stats should be equivalent (same proofs = same stats)
      expect(result.current.stats?.proofCount).toBe(initialStats?.proofCount);
    });
  });
});

describe('useNeedsDefragmentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return needsIt: false for healthy wallet', async () => {
    const proofs = createMockProofs([8, 16, 32]);
    const mockWallet = createMockWallet({ proofs });
    
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <WalletProvider wallet={mockWallet as any}>
        {children}
      </WalletProvider>
    );

    const { result } = renderHook(() => useNeedsDefragmentation(), { wrapper });

    expect(result.current.needsIt).toBe(false);
    expect(result.current.level).toBe('none');
  });

  it('should return needsIt: true for fragmented wallet', async () => {
    const proofs = createMockProofs([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const mockWallet = createMockWallet({ proofs });
    
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <WalletProvider wallet={mockWallet as any}>
        {children}
      </WalletProvider>
    );

    const { result } = renderHook(() => useNeedsDefragmentation(), { wrapper });

    expect(result.current.needsIt).toBe(true);
    expect(['recommended', 'urgent']).toContain(result.current.level);
  });
});

describe('useFragmentationPercentage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 0 for empty wallet', async () => {
    const mockWallet = createMockWallet({ proofs: [] });
    
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <WalletProvider wallet={mockWallet as any}>
        {children}
      </WalletProvider>
    );

    const { result } = renderHook(() => useFragmentationPercentage(), { wrapper });

    expect(result.current).toBe(0);
  });

  it('should return percentage for fragmented wallet', async () => {
    const proofs = createMockProofs([1, 1, 1, 1, 2, 2, 4, 4]);
    const mockWallet = createMockWallet({ proofs });
    
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <WalletProvider wallet={mockWallet as any}>
        {children}
      </WalletProvider>
    );

    const { result } = renderHook(() => useFragmentationPercentage(), { wrapper });

    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});
