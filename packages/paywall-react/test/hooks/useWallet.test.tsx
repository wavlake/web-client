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

  it('should provide initial state', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    expect(result.current.balance).toBe(0); // Initial before load
    expect(result.current.proofs).toEqual([]);
    expect(result.current.isReady).toBe(false);
    expect(result.current.isLoading).toBe(true); // autoLoad triggers loading
    expect(result.current.error).toBe(null);
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

    expect(mockWallet.createToken).toHaveBeenCalledWith(10);
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

    expect(mockWallet.receiveToken).toHaveBeenCalledWith('cashuBtoken');
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
});
