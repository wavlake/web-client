/**
 * Token Preview and Enhanced Error tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Proof } from '@cashu/cashu-ts';

// Mock cashu-ts
vi.mock('@cashu/cashu-ts', async () => {
  const actual = await vi.importActual('@cashu/cashu-ts');
  return {
    ...actual,
    Mint: vi.fn().mockImplementation(() => ({
      mintUrl: 'https://mint.test.com',
    })),
    Wallet: vi.fn().mockImplementation(() => ({
      loadMint: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockImplementation((amount: number, proofs: Array<{ amount: number }>) => {
        const total = proofs.reduce((s: number, p) => s + p.amount, 0);
        const change = total - amount;
        return {
          send: proofs.filter((p) => p.amount <= amount),
          keep: change > 0 ? [{ C: 'change', amount: change, id: 'keyset1', secret: 'sc' }] : [],
        };
      }),
      receive: vi.fn().mockResolvedValue([]),
    })),
    getEncodedTokenV4: vi.fn().mockReturnValue('cashuBmocktoken'),
    getDecodedToken: vi.fn().mockReturnValue({
      mint: 'https://mint.test.com',
      proofs: [],
    }),
  };
});

// Imports after mock
import { Wallet } from '../src/wallet.js';
import { MemoryAdapter } from '../src/storage/memory.js';
import { TokenCreationError } from '../src/errors.js';

const MINT_URL = 'https://mint.test.com';

// Mock proofs with various denominations
const mockProofs: Proof[] = [
  { C: 'c1', amount: 1, id: 'keyset1', secret: 's1' },
  { C: 'c2', amount: 2, id: 'keyset1', secret: 's2' },
  { C: 'c4', amount: 4, id: 'keyset1', secret: 's4' },
  { C: 'c8', amount: 8, id: 'keyset1', secret: 's8' },
] as Proof[];

describe('previewToken', () => {
  let wallet: Wallet;
  let storage: MemoryAdapter;

  beforeEach(async () => {
    storage = new MemoryAdapter([...mockProofs]);
    wallet = new Wallet({
      mintUrl: MINT_URL,
      storage,
    });
    await wallet.load();
  });

  describe('successful previews', () => {
    it('should preview exact match (no swap needed)', () => {
      // smallestFirst selector picks [1, 2] = 3, need more, picks 4 too = 7
      // For exact match, we need to request an amount that matches exactly
      // Let's use 3 (1+2=3) as an exact match case
      const preview = wallet.previewToken(3);

      expect(preview.canCreate).toBe(true);
      expect(preview.amount).toBe(3);
      expect(preview.availableBalance).toBe(15);
      expect(preview.selectedTotal).toBe(3); // 1+2
      expect(preview.change).toBe(0);
      expect(preview.needsSwap).toBe(false);
      expect(preview.issue).toBeUndefined();
    });

    it('should preview with change (swap needed)', () => {
      const preview = wallet.previewToken(5);

      expect(preview.canCreate).toBe(true);
      expect(preview.amount).toBe(5);
      expect(preview.selectedTotal).toBeGreaterThanOrEqual(5);
      expect(preview.change).toBe(preview.selectedTotal - 5);
      expect(preview.needsSwap).toBe(true);
    });

    it('should include denomination info', () => {
      const preview = wallet.previewToken(3);

      expect(preview.availableDenominations).toEqual([1, 2, 4, 8]);
      expect(preview.denominationCounts).toEqual({
        1: 1,
        2: 1,
        4: 1,
        8: 1,
      });
    });

    it('should return copy of selected proofs', () => {
      const preview = wallet.previewToken(3);
      const originalProofs = wallet.proofs;

      // Modifying preview shouldn't affect wallet
      preview.selectedProofs.push({} as Proof);
      expect(wallet.proofs).toEqual(originalProofs);
    });
  });

  describe('failure cases', () => {
    it('should detect insufficient balance', () => {
      const preview = wallet.previewToken(100);

      expect(preview.canCreate).toBe(false);
      expect(preview.issue).toContain('Insufficient balance');
      expect(preview.suggestion).toBeDefined();
      expect(preview.suggestion).toContain('85'); // 100 - 15 = 85 needed
    });

    it('should detect invalid amount (zero)', () => {
      const preview = wallet.previewToken(0);

      expect(preview.canCreate).toBe(false);
      expect(preview.issue).toContain('positive');
      expect(preview.suggestion).toBeDefined();
    });

    it('should detect invalid amount (negative)', () => {
      const preview = wallet.previewToken(-5);

      expect(preview.canCreate).toBe(false);
      expect(preview.issue).toContain('positive');
    });

    it('should handle empty wallet', async () => {
      const emptyStorage = new MemoryAdapter([]);
      const emptyWallet = new Wallet({
        mintUrl: MINT_URL,
        storage: emptyStorage,
      });
      await emptyWallet.load();

      const preview = emptyWallet.previewToken(5);

      expect(preview.canCreate).toBe(false);
      expect(preview.availableBalance).toBe(0);
      expect(preview.availableDenominations).toEqual([]);
      expect(preview.suggestion).toContain('empty');
    });
  });

  describe('does not modify state', () => {
    it('should not change balance', () => {
      const balanceBefore = wallet.balance;
      wallet.previewToken(5);
      expect(wallet.balance).toBe(balanceBefore);
    });

    it('should not change proofs', () => {
      const proofsBefore = wallet.proofs;
      wallet.previewToken(5);
      expect(wallet.proofs).toEqual(proofsBefore);
    });
  });
});

describe('TokenCreationError', () => {
  let wallet: Wallet;
  let storage: MemoryAdapter;

  beforeEach(async () => {
    storage = new MemoryAdapter([...mockProofs]);
    wallet = new Wallet({
      mintUrl: MINT_URL,
      storage,
    });
    await wallet.load();
  });

  describe('error creation', () => {
    it('should throw TokenCreationError for insufficient balance', async () => {
      try {
        await wallet.createToken(100);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(TokenCreationError.isTokenCreationError(error)).toBe(true);
        const e = error as TokenCreationError;
        expect(e.code).toBe('INSUFFICIENT_BALANCE');
        expect(e.requestedAmount).toBe(100);
        expect(e.availableBalance).toBe(15);
        expect(e.suggestion).toBeDefined();
      }
    });

    it('should throw TokenCreationError for invalid amount', async () => {
      try {
        await wallet.createToken(0);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(TokenCreationError.isTokenCreationError(error)).toBe(true);
        const e = error as TokenCreationError;
        expect(e.code).toBe('INVALID_AMOUNT');
      }
    });

    it('should include denomination info in error', async () => {
      try {
        await wallet.createToken(100);
        expect.fail('Should have thrown');
      } catch (error) {
        const e = error as TokenCreationError;
        expect(e.availableDenominations).toEqual([1, 2, 4, 8]);
        expect(e.denominationCounts).toEqual({
          1: 1,
          2: 1,
          4: 1,
          8: 1,
        });
      }
    });
  });

  describe('error methods', () => {
    it('should provide userMessage', async () => {
      try {
        await wallet.createToken(100);
      } catch (error) {
        const e = error as TokenCreationError;
        expect(e.userMessage).toContain('85'); // shortfall
        expect(e.userMessage).toContain('15'); // have
        expect(e.userMessage).toContain('100'); // need
      }
    });

    it('should calculate shortfall', async () => {
      try {
        await wallet.createToken(100);
      } catch (error) {
        const e = error as TokenCreationError;
        expect(e.shortfall).toBe(85);
      }
    });

    it('should serialize to JSON', async () => {
      try {
        await wallet.createToken(100);
      } catch (error) {
        const e = error as TokenCreationError;
        const json = e.toJSON();
        expect(json.code).toBe('INSUFFICIENT_BALANCE');
        expect(json.requestedAmount).toBe(100);
        expect(json.availableBalance).toBe(15);
        expect(json.shortfall).toBe(85);
      }
    });
  });

  describe('type guards', () => {
    it('should identify TokenCreationError', async () => {
      try {
        await wallet.createToken(100);
      } catch (error) {
        expect(TokenCreationError.isTokenCreationError(error)).toBe(true);
        expect(TokenCreationError.isInsufficientBalance(error)).toBe(true);
      }
    });

    it('should not identify regular Error as TokenCreationError', () => {
      const error = new Error('Regular error');
      expect(TokenCreationError.isTokenCreationError(error)).toBe(false);
      expect(TokenCreationError.isInsufficientBalance(error)).toBe(false);
    });
  });
});

describe('createToken success with new error handling', () => {
  let wallet: Wallet;
  let storage: MemoryAdapter;

  beforeEach(async () => {
    storage = new MemoryAdapter([...mockProofs]);
    wallet = new Wallet({
      mintUrl: MINT_URL,
      storage,
    });
    await wallet.load();
  });

  it('should still create token successfully', async () => {
    const token = await wallet.createToken(3);
    expect(token).toBe('cashuBmocktoken');
  });

  it('should update balance after successful creation', async () => {
    const balanceBefore = wallet.balance;
    await wallet.createToken(3);
    expect(wallet.balance).toBeLessThan(balanceBefore);
  });
});
