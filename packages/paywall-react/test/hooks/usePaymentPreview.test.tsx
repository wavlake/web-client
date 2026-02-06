import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePaymentPreview, formatEfficiency, getEfficiencyEmoji } from '../../src/hooks/usePaymentPreview';
import { WalletProvider } from '../../src/providers/WalletProvider';
import type { Proof } from '@cashu/cashu-ts';
import type { ReactNode } from 'react';

// Mock wallet
const createMockWallet = (proofs: Proof[]) => ({
  balance: proofs.reduce((sum, p) => sum + p.amount, 0),
  proofs,
  isLoaded: true,
  mintUrl: 'https://mint.test.com',
  storage: { load: vi.fn(), save: vi.fn(), clear: vi.fn() },
  load: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  createToken: vi.fn(),
  receiveToken: vi.fn(),
  receiveChange: vi.fn(),
  addProofs: vi.fn(),
  removeProofs: vi.fn(),
  checkProofs: vi.fn(),
  pruneSpent: vi.fn(),
  defragment: vi.fn(),
  getDefragStats: vi.fn(),
  needsDefragmentation: vi.fn(),
  createMintQuote: vi.fn(),
  checkMintQuote: vi.fn(),
  mintTokens: vi.fn(),
  previewToken: vi.fn(),
  getHistory: vi.fn(),
  getTransaction: vi.fn(),
  getHistorySummary: vi.fn(),
  historyCount: 0,
  on: vi.fn(),
  off: vi.fn(),
});

// Create proofs with specific amounts
const createProofs = (amounts: number[]): Proof[] =>
  amounts.map((amount, i) => ({
    id: 'test-keyset',
    amount,
    secret: `secret-${i}`,
    C: `C-${i}`,
  }));

describe('usePaymentPreview', () => {
  describe('previewPayment', () => {
    it('should return null when wallet is not ready', () => {
      const mockWallet = {
        ...createMockWallet([]),
        isLoaded: false,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      const preview = result.current.previewPayment(5);
      expect(preview).toBeNull();
    });

    it('should return null for zero or negative amounts', () => {
      const mockWallet = createMockWallet(createProofs([1, 2, 4, 8]));

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.previewPayment(0)).toBeNull();
      expect(result.current.previewPayment(-5)).toBeNull();
    });

    it('should detect exact payment possibility', () => {
      const mockWallet = createMockWallet(createProofs([1, 2, 4, 8]));

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      // 5 = 1 + 4, should be exact
      const preview = result.current.previewPayment(5);
      
      expect(preview).not.toBeNull();
      expect(preview!.canAfford).toBe(true);
      expect(preview!.canPayExact).toBe(true);
      expect(preview!.requiresSwap).toBe(false);
      expect(preview!.efficiency).toBe(1.0);
      expect(preview!.changeAmount).toBe(0);
    });

    it('should detect when swap is needed', () => {
      const mockWallet = createMockWallet(createProofs([10])); // Only one 10-credit proof

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      // 7 cannot be paid exactly from [10]
      const preview = result.current.previewPayment(7);
      
      expect(preview).not.toBeNull();
      expect(preview!.canAfford).toBe(true);
      expect(preview!.canPayExact).toBe(false);
      expect(preview!.requiresSwap).toBe(true);
      expect(preview!.changeAmount).toBe(3); // 10 - 7
      expect(preview!.efficiency).toBe(0.7); // 7/10
    });

    it('should detect insufficient balance', () => {
      const mockWallet = createMockWallet(createProofs([1, 2])); // Total: 3

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      const preview = result.current.previewPayment(10);
      
      expect(preview).not.toBeNull();
      expect(preview!.canAfford).toBe(false);
      expect(preview!.walletBalance).toBe(3);
      expect(preview!.explanation).toContain('Cannot afford');
      expect(preview!.suggestion).toContain('Add 7 more credits');
    });

    it('should provide explanation for exact payment', () => {
      const mockWallet = createMockWallet(createProofs([5]));

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      const preview = result.current.previewPayment(5);
      
      expect(preview!.explanation).toContain('exactly 5 credits');
    });

    it('should provide explanation and suggestion for swap', () => {
      const mockWallet = createMockWallet(createProofs([100])); // Very inefficient for small payment

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      const preview = result.current.previewPayment(5);
      
      expect(preview!.explanation).toContain('100 credits to pay 5');
      expect(preview!.explanation).toContain('95 change');
      expect(preview!.suggestion).toBeDefined();
      expect(preview!.efficiency).toBe(0.05); // Very low
    });
  });

  describe('getWalletHealth', () => {
    it('should return null when wallet is not ready', () => {
      const mockWallet = {
        ...createMockWallet([]),
        isLoaded: false,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.getWalletHealth()).toBeNull();
    });

    it('should return health summary for healthy wallet', () => {
      // Diverse denominations = healthy
      const mockWallet = createMockWallet(createProofs([1, 2, 4, 8, 16, 32]));

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      const health = result.current.getWalletHealth();
      
      expect(health).not.toBeNull();
      expect(health!.score).toBeGreaterThanOrEqual(70);
      expect(health!.isHealthy).toBe(true);
      expect(health!.denominations).toEqual([1, 2, 4, 8, 16, 32]);
    });

    it('should detect unhealthy wallet with poor denominations', () => {
      // All same denomination = less healthy
      const mockWallet = createMockWallet(createProofs([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      const health = result.current.getWalletHealth();
      
      expect(health).not.toBeNull();
      expect(health!.denominations).toEqual([1]);
      expect(health!.denominationCounts[1]).toBe(10);
      // Should have recommendations about single denomination
    });

    it('should include exact payable amounts', () => {
      const mockWallet = createMockWallet(createProofs([1, 2, 4])); // Total: 7

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      const health = result.current.getWalletHealth();
      
      expect(health).not.toBeNull();
      // Can pay 1, 2, 3, 4, 5, 6, 7 exactly from [1, 2, 4]
      expect(health!.exactPayableAmounts).toContain(1);
      expect(health!.exactPayableAmounts).toContain(3); // 1 + 2
      expect(health!.exactPayableAmounts).toContain(5); // 1 + 4
    });
  });

  describe('canPayExact', () => {
    it('should return true for exact payable amounts', () => {
      const mockWallet = createMockWallet(createProofs([1, 2, 4]));

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.canPayExact(5)).toBe(true); // 1 + 4
      expect(result.current.canPayExact(3)).toBe(true); // 1 + 2
      expect(result.current.canPayExact(7)).toBe(true); // 1 + 2 + 4
    });

    it('should return false for non-exact amounts', () => {
      const mockWallet = createMockWallet(createProofs([8, 16])); // Can't make 5 exactly

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.canPayExact(5)).toBe(false);
    });

    it('should return false for zero/negative amounts', () => {
      const mockWallet = createMockWallet(createProofs([1, 2, 4]));

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.canPayExact(0)).toBe(false);
      expect(result.current.canPayExact(-1)).toBe(false);
    });
  });

  describe('maxPayableAmount', () => {
    it('should return wallet balance', () => {
      const mockWallet = createMockWallet(createProofs([1, 2, 4, 8])); // Total: 15

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.maxPayableAmount).toBe(15);
    });

    it('should return 0 when wallet not ready', () => {
      const mockWallet = {
        ...createMockWallet(createProofs([1, 2, 4])),
        isLoaded: false,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.maxPayableAmount).toBe(0);
    });
  });

  describe('balance and isReady', () => {
    it('should expose wallet balance and ready state', () => {
      const mockWallet = createMockWallet(createProofs([5, 10, 20])); // Total: 35

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(() => usePaymentPreview(), { wrapper });
      
      expect(result.current.balance).toBe(35);
      expect(result.current.isReady).toBe(true);
    });
  });

  describe('options', () => {
    it('should use custom common amounts for health check', () => {
      const mockWallet = createMockWallet(createProofs([1, 5])); // Can pay 1, 5, 6 exactly

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WalletProvider wallet={mockWallet as any}>{children}</WalletProvider>
      );

      const { result } = renderHook(
        () => usePaymentPreview({ commonAmounts: [1, 5, 6] }),
        { wrapper }
      );
      
      const health = result.current.getWalletHealth();
      
      expect(health).not.toBeNull();
      // Should only check 1, 5, 6 as common amounts
      expect(health!.exactPayableAmounts).toContain(1);
      expect(health!.exactPayableAmounts).toContain(5);
      expect(health!.exactPayableAmounts).toContain(6);
    });
  });
});

describe('formatEfficiency', () => {
  it('should format perfect efficiency', () => {
    expect(formatEfficiency(1.0)).toBe('Perfect');
  });

  it('should format excellent efficiency', () => {
    expect(formatEfficiency(0.95)).toBe('95% (excellent)');
  });

  it('should format good efficiency', () => {
    expect(formatEfficiency(0.75)).toBe('75% (good)');
  });

  it('should format fair efficiency', () => {
    expect(formatEfficiency(0.55)).toBe('55% (fair)');
  });

  it('should format inefficient', () => {
    expect(formatEfficiency(0.3)).toBe('30% (inefficient)');
  });
});

describe('getEfficiencyEmoji', () => {
  it('should return sparkle for perfect', () => {
    expect(getEfficiencyEmoji(1.0)).toBe('✨');
  });

  it('should return thumbs up for excellent', () => {
    expect(getEfficiencyEmoji(0.95)).toBe('👍');
  });

  it('should return ok for good', () => {
    expect(getEfficiencyEmoji(0.75)).toBe('👌');
  });

  it('should return swap for fair', () => {
    expect(getEfficiencyEmoji(0.55)).toBe('🔄');
  });

  it('should return warning for poor', () => {
    expect(getEfficiencyEmoji(0.3)).toBe('⚠️');
  });
});
