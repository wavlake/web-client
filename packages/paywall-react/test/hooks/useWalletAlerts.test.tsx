/**
 * useWalletAlerts Hook tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WalletProvider } from '../../src/index.js';
import { useWalletAlerts } from '../../src/hooks/useWalletAlerts.js';
import type { DefragStats } from '@wavlake/wallet';

// Mock wallet factory
const createMockWallet = (balance = 100, proofCount = 5) => {
  const proofs = Array.from({ length: proofCount }, (_, i) => ({
    C: `c${i}`,
    amount: Math.floor(balance / proofCount),
    id: 'keyset1',
    secret: `s${i}`,
  }));

  return {
    balance,
    proofs,
    isLoaded: true,
    mintUrl: 'https://mint.test.com',
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    createToken: vi.fn(),
    receiveToken: vi.fn(),
    createMintQuote: vi.fn(),
    mintTokens: vi.fn(),
    checkProofs: vi.fn(),
    pruneSpent: vi.fn(),
    getDefragStats: vi.fn().mockReturnValue({
      proofCount,
      balance,
      averageProofSize: balance / proofCount,
      fragmentation: 0.2,
      smallProofCount: 0,
      recommendation: 'none' as const,
      estimatedNewProofCount: proofCount,
    } as DefragStats),
    needsDefragmentation: vi.fn().mockReturnValue(false),
    defragment: vi.fn().mockResolvedValue({ previousProofCount: proofCount, newProofCount: 2, saved: proofCount - 2 }),
    on: vi.fn(),
    off: vi.fn(),
  };
};

describe('useWalletAlerts', () => {
  let mockWallet: ReturnType<typeof createMockWallet>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    vi.clearAllMocks();
  });

  const createWrapper = (wallet = mockWallet) => ({ children }: { children: React.ReactNode }) => (
    <WalletProvider wallet={wallet as any}>
      {children}
    </WalletProvider>
  );

  it('should provide initial state with no alerts for healthy wallet', async () => {
    const { result } = renderHook(() => useWalletAlerts(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.alerts).toBeDefined();
    });

    expect(result.current.alerts).toHaveLength(0);
    expect(result.current.hasCritical).toBe(false);
    expect(result.current.hasWarnings).toBe(false);
    expect(result.current.highestSeverity).toBe(null);
  });

  describe('empty wallet alerts', () => {
    it('should show critical alert for empty wallet', async () => {
      const emptyWallet = createMockWallet(0, 0);
      emptyWallet.getDefragStats.mockReturnValue({
        proofCount: 0,
        balance: 0,
        averageProofSize: 0,
        fragmentation: 0,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 0,
      });

      const { result } = renderHook(() => useWalletAlerts(), { 
        wrapper: createWrapper(emptyWallet) 
      });

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      expect(result.current.hasCritical).toBe(true);
      expect(result.current.highestSeverity).toBe('critical');
      
      const emptyAlert = result.current.alerts.find(a => a.type === 'empty_wallet');
      expect(emptyAlert).toBeDefined();
      expect(emptyAlert?.severity).toBe('critical');
      expect(emptyAlert?.dismissible).toBe(false);
    });
  });

  describe('low balance alerts', () => {
    it('should show warning for low balance', async () => {
      const lowBalanceWallet = createMockWallet(5, 5);
      lowBalanceWallet.getDefragStats.mockReturnValue({
        proofCount: 5,
        balance: 5,
        averageProofSize: 1,
        fragmentation: 0.1,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 5,
      });

      const { result } = renderHook(
        () => useWalletAlerts({ lowBalanceThreshold: 10 }), 
        { wrapper: createWrapper(lowBalanceWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      expect(result.current.hasWarnings).toBe(true);
      
      const lowAlert = result.current.alerts.find(a => a.type === 'low_balance');
      expect(lowAlert).toBeDefined();
      expect(lowAlert?.severity).toBe('warning');
      expect(lowAlert?.dismissible).toBe(true);
    });

    it('should not show low balance alert when balance is above threshold', async () => {
      const healthyWallet = createMockWallet(50, 5);

      const { result } = renderHook(
        () => useWalletAlerts({ lowBalanceThreshold: 10 }), 
        { wrapper: createWrapper(healthyWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts).toBeDefined();
      });

      const lowAlert = result.current.alerts.find(a => a.type === 'low_balance');
      expect(lowAlert).toBeUndefined();
    });
  });

  describe('insufficient balance alerts', () => {
    it('should show warning when balance is insufficient for expected payment', async () => {
      const lowWallet = createMockWallet(3, 3);
      lowWallet.getDefragStats.mockReturnValue({
        proofCount: 3,
        balance: 3,
        averageProofSize: 1,
        fragmentation: 0.1,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 3,
      });

      const { result } = renderHook(
        () => useWalletAlerts({ expectedPaymentAmount: 5 }), 
        { wrapper: createWrapper(lowWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      const insufficientAlert = result.current.alerts.find(a => a.type === 'insufficient_for_payment');
      expect(insufficientAlert).toBeDefined();
      expect(insufficientAlert?.context?.shortfall).toBe(2);
    });
  });

  describe('defragmentation alerts', () => {
    it('should show warning when defragmentation is urgent', async () => {
      const fragmentedWallet = createMockWallet(100, 20);
      fragmentedWallet.getDefragStats.mockReturnValue({
        proofCount: 20,
        balance: 100,
        averageProofSize: 5,
        fragmentation: 0.8,
        smallProofCount: 15,
        recommendation: 'urgent',
        estimatedNewProofCount: 5,
      });

      const { result } = renderHook(
        () => useWalletAlerts(), 
        { wrapper: createWrapper(fragmentedWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      const defragAlert = result.current.alerts.find(a => a.type === 'defrag_urgent');
      expect(defragAlert).toBeDefined();
      expect(defragAlert?.severity).toBe('warning');
    });

    it('should show info when defragmentation is recommended', async () => {
      const fragmentedWallet = createMockWallet(100, 10);
      fragmentedWallet.getDefragStats.mockReturnValue({
        proofCount: 10,
        balance: 100,
        averageProofSize: 10,
        fragmentation: 0.5,
        smallProofCount: 6,
        recommendation: 'recommended',
        estimatedNewProofCount: 4,
      });

      const { result } = renderHook(
        () => useWalletAlerts(), 
        { wrapper: createWrapper(fragmentedWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      const defragAlert = result.current.alerts.find(a => a.type === 'defrag_recommended');
      expect(defragAlert).toBeDefined();
      expect(defragAlert?.severity).toBe('info');
    });
  });

  describe('dismiss functionality', () => {
    it('should dismiss individual alerts', async () => {
      const lowBalanceWallet = createMockWallet(5, 5);
      lowBalanceWallet.getDefragStats.mockReturnValue({
        proofCount: 5,
        balance: 5,
        averageProofSize: 1,
        fragmentation: 0.1,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 5,
      });

      const { result } = renderHook(
        () => useWalletAlerts({ lowBalanceThreshold: 10 }), 
        { wrapper: createWrapper(lowBalanceWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      const alertId = result.current.alerts[0].id;

      act(() => {
        result.current.dismissAlert(alertId);
      });

      expect(result.current.alerts.find(a => a.id === alertId)).toBeUndefined();
    });

    it('should dismiss all dismissible alerts', async () => {
      const lowBalanceWallet = createMockWallet(5, 10);
      lowBalanceWallet.getDefragStats.mockReturnValue({
        proofCount: 10,
        balance: 5,
        averageProofSize: 0.5,
        fragmentation: 0.6,
        smallProofCount: 8,
        recommendation: 'recommended',
        estimatedNewProofCount: 3,
      });

      const { result } = renderHook(
        () => useWalletAlerts({ lowBalanceThreshold: 10 }), 
        { wrapper: createWrapper(lowBalanceWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      const initialCount = result.current.alerts.length;
      expect(initialCount).toBeGreaterThan(0);

      act(() => {
        result.current.dismissAll();
      });

      // All dismissible alerts should be gone
      expect(result.current.alerts.filter(a => a.dismissible)).toHaveLength(0);
    });
  });

  describe('helper methods', () => {
    it('should get alerts by type', async () => {
      const lowBalanceWallet = createMockWallet(5, 5);
      lowBalanceWallet.getDefragStats.mockReturnValue({
        proofCount: 5,
        balance: 5,
        averageProofSize: 1,
        fragmentation: 0.1,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 5,
      });

      const { result } = renderHook(
        () => useWalletAlerts({ lowBalanceThreshold: 10 }), 
        { wrapper: createWrapper(lowBalanceWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      const lowBalanceAlerts = result.current.getAlertsByType('low_balance');
      expect(lowBalanceAlerts.length).toBeGreaterThan(0);
      expect(lowBalanceAlerts.every(a => a.type === 'low_balance')).toBe(true);
    });

    it('should check if alert type exists', async () => {
      const lowBalanceWallet = createMockWallet(5, 5);
      lowBalanceWallet.getDefragStats.mockReturnValue({
        proofCount: 5,
        balance: 5,
        averageProofSize: 1,
        fragmentation: 0.1,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 5,
      });

      const { result } = renderHook(
        () => useWalletAlerts({ lowBalanceThreshold: 10 }), 
        { wrapper: createWrapper(lowBalanceWallet) }
      );

      await waitFor(() => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      });

      expect(result.current.hasAlertType('low_balance')).toBe(true);
      expect(result.current.hasAlertType('empty_wallet')).toBe(false);
    });

    it('should refresh alerts on demand', async () => {
      const { result } = renderHook(() => useWalletAlerts(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.refresh).toBeDefined();
      });

      // Should not throw
      act(() => {
        result.current.refresh();
      });
    });
  });

  describe('severity calculations', () => {
    it('should correctly identify highest severity as critical', async () => {
      const emptyWallet = createMockWallet(0, 0);
      emptyWallet.getDefragStats.mockReturnValue({
        proofCount: 0,
        balance: 0,
        averageProofSize: 0,
        fragmentation: 0,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 0,
      });

      const { result } = renderHook(() => useWalletAlerts(), { 
        wrapper: createWrapper(emptyWallet) 
      });

      await waitFor(() => {
        expect(result.current.highestSeverity).toBe('critical');
      });
    });

    it('should correctly identify highest severity as warning', async () => {
      const lowBalanceWallet = createMockWallet(5, 5);
      lowBalanceWallet.getDefragStats.mockReturnValue({
        proofCount: 5,
        balance: 5,
        averageProofSize: 1,
        fragmentation: 0.1,
        smallProofCount: 0,
        recommendation: 'none',
        estimatedNewProofCount: 5,
      });

      const { result } = renderHook(
        () => useWalletAlerts({ lowBalanceThreshold: 10 }), 
        { wrapper: createWrapper(lowBalanceWallet) }
      );

      await waitFor(() => {
        expect(result.current.highestSeverity).toBe('warning');
      });
    });

    it('should return null severity when no alerts', async () => {
      const { result } = renderHook(() => useWalletAlerts(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.highestSeverity).toBe(null);
      });
    });
  });
});
