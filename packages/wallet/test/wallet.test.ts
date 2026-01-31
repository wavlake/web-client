/**
 * Wallet tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Proof } from '@cashu/cashu-ts';

// Mock cashu-ts with inline literals (vi.mock is hoisted)
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
      receive: vi.fn().mockImplementation(() => {
        return [{ C: 'received', amount: 5, id: 'keyset1', secret: 'sr' }];
      }),
      createMintQuote: vi.fn().mockResolvedValue({
        quote: 'quote-123',
        request: 'lnbc100...',
        expiry: Date.now() + 3600000,
        state: 'UNPAID',
      }),
      checkMintQuote: vi.fn().mockResolvedValue({
        quote: 'quote-123',
        request: 'lnbc100...',
        amount: 100,
        expiry: Date.now() + 3600000,
        state: 'PAID',
      }),
      mintProofs: vi.fn().mockResolvedValue([
        { C: 'minted', amount: 100, id: 'keyset1', secret: 'sm' },
      ]),
    })),
    getEncodedTokenV4: vi.fn().mockReturnValue('cashuBmocktoken'),
    getDecodedToken: vi.fn().mockReturnValue({
      mint: 'https://mint.test.com',
      proofs: [{ C: 'c1', amount: 1, id: 'keyset1', secret: 's1' }],
    }),
  };
});

// Imports after mock
import { Wallet } from '../src/wallet.js';
import { MemoryAdapter } from '../src/storage/memory.js';

// Constants
const MINT_URL = 'https://mint.test.com';

// Mock proofs for tests
const mockProofs: Proof[] = [
  { C: 'c1', amount: 1, id: 'keyset1', secret: 's1' },
  { C: 'c2', amount: 2, id: 'keyset1', secret: 's2' },
  { C: 'c5', amount: 5, id: 'keyset1', secret: 's5' },
  { C: 'c10', amount: 10, id: 'keyset1', secret: 's10' },
] as Proof[];

describe('Wallet', () => {
  let wallet: Wallet;
  let storage: MemoryAdapter;

  beforeEach(() => {
    storage = new MemoryAdapter(mockProofs);
    wallet = new Wallet({
      mintUrl: MINT_URL,
      storage,
    });
  });

  describe('constructor', () => {
    it('should create wallet with config', () => {
      expect(wallet.mintUrl).toBe(MINT_URL);
      expect(wallet.isLoaded).toBe(false);
    });
  });

  describe('load', () => {
    it('should load proofs from storage', async () => {
      await wallet.load();
      expect(wallet.isLoaded).toBe(true);
      expect(wallet.balance).toBe(18); // 1 + 2 + 5 + 10
      expect(wallet.proofs).toHaveLength(4);
    });

    it('should emit events on load', async () => {
      const balanceHandler = vi.fn();
      const proofsHandler = vi.fn();
      
      wallet.on('balance-change', balanceHandler);
      wallet.on('proofs-change', proofsHandler);
      
      await wallet.load();
      
      expect(balanceHandler).toHaveBeenCalledWith(18);
      expect(proofsHandler).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  describe('balance', () => {
    it('should return sum of proof amounts', async () => {
      await wallet.load();
      expect(wallet.balance).toBe(18);
    });

    it('should return 0 before load', () => {
      expect(wallet.balance).toBe(0);
    });
  });

  describe('proofs', () => {
    it('should return copy of proofs', async () => {
      await wallet.load();
      const proofs1 = wallet.proofs;
      const proofs2 = wallet.proofs;
      
      expect(proofs1).not.toBe(proofs2);
      expect(proofs1).toEqual(proofs2);
    });
  });

  describe('save', () => {
    it('should persist proofs to storage', async () => {
      await wallet.load();
      await wallet.save();
      
      const stored = await storage.load();
      expect(stored).toHaveLength(4);
    });
  });

  describe('clear', () => {
    it('should remove all proofs', async () => {
      await wallet.load();
      await wallet.clear();
      
      expect(wallet.balance).toBe(0);
      expect(wallet.proofs).toHaveLength(0);
    });

    it('should emit events on clear', async () => {
      await wallet.load();
      
      const balanceHandler = vi.fn();
      wallet.on('balance-change', balanceHandler);
      
      await wallet.clear();
      
      expect(balanceHandler).toHaveBeenCalledWith(0);
    });
  });

  describe('createToken', () => {
    it('should throw for insufficient balance', async () => {
      await wallet.load();
      await expect(wallet.createToken(100)).rejects.toThrow('Insufficient balance');
    });

    it('should throw for zero/negative amount', async () => {
      await wallet.load();
      await expect(wallet.createToken(0)).rejects.toThrow('Amount must be positive');
      await expect(wallet.createToken(-5)).rejects.toThrow('Amount must be positive');
    });

    it('should return encoded token', async () => {
      await wallet.load();
      const token = await wallet.createToken(3);
      expect(token).toBe('cashuBmocktoken');
    });
  });

  describe('addProofs', () => {
    it('should add proofs to wallet', async () => {
      await wallet.load();
      const initialBalance = wallet.balance;
      
      const newProof = { C: 'new', amount: 100, id: 'keyset1', secret: 'sn' } as Proof;
      await wallet.addProofs([newProof]);
      
      expect(wallet.balance).toBe(initialBalance + 100);
    });

    it('should emit events', async () => {
      await wallet.load();
      
      const balanceHandler = vi.fn();
      wallet.on('balance-change', balanceHandler);
      
      await wallet.addProofs([{ C: 'new', amount: 50, id: 'keyset1', secret: 'sn' } as Proof]);
      
      expect(balanceHandler).toHaveBeenCalled();
    });
  });

  describe('removeProofs', () => {
    it('should remove specific proofs', async () => {
      await wallet.load();
      const toRemove = wallet.proofs.filter(p => p.amount === 1);
      
      await wallet.removeProofs(toRemove);
      
      expect(wallet.balance).toBe(17); // 18 - 1
    });
  });

  describe('createMintQuote', () => {
    it('should return quote with invoice', async () => {
      await wallet.load();
      const quote = await wallet.createMintQuote(100);
      
      expect(quote.id).toBe('quote-123');
      expect(quote.request).toContain('lnbc');
      expect(quote.amount).toBe(100);
    });
  });

  describe('events', () => {
    it('should support on/off', async () => {
      const handler = vi.fn();
      
      wallet.on('balance-change', handler);
      await wallet.load();
      expect(handler).toHaveBeenCalled();
      
      handler.mockClear();
      wallet.off('balance-change', handler);
      await wallet.clear();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should catch handler errors', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('handler error');
      });
      
      wallet.on('balance-change', errorHandler);
      
      // Should not throw
      await expect(wallet.load()).resolves.not.toThrow();
    });
  });
});
