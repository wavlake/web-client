/**
 * Proof inspection utilities tests
 */

import { describe, it, expect } from 'vitest';
import type { Proof } from '@cashu/cashu-ts';
import {
  summarizeProofs,
  describeProof,
  canCoverAmount,
  findOptimalProofs,
  calculateChange,
  groupByKeyset,
  getDenominations,
  formatBalance,
  getDefragStats,
  needsDefragmentation,
} from '../src/inspect.js';

// Test proofs
const mockProofs: Proof[] = [
  { C: 'c1', amount: 1, id: 'keyset-a', secret: 's1' },
  { C: 'c2', amount: 2, id: 'keyset-a', secret: 's2' },
  { C: 'c4', amount: 4, id: 'keyset-a', secret: 's4' },
  { C: 'c8', amount: 8, id: 'keyset-b', secret: 's8' },
  { C: 'c16', amount: 16, id: 'keyset-b', secret: 's16' },
] as Proof[];

describe('inspect utilities', () => {
  describe('summarizeProofs', () => {
    it('should summarize empty proofs', () => {
      const summary = summarizeProofs([]);
      
      expect(summary.totalProofs).toBe(0);
      expect(summary.totalBalance).toBe(0);
      expect(Object.keys(summary.byKeyset)).toHaveLength(0);
      expect(Object.keys(summary.byAmount)).toHaveLength(0);
    });

    it('should calculate totals correctly', () => {
      const summary = summarizeProofs(mockProofs);
      
      expect(summary.totalProofs).toBe(5);
      expect(summary.totalBalance).toBe(31); // 1 + 2 + 4 + 8 + 16
    });

    it('should group by keyset', () => {
      const summary = summarizeProofs(mockProofs);
      
      expect(Object.keys(summary.byKeyset)).toHaveLength(2);
      expect(summary.byKeyset['keyset-a'].proofCount).toBe(3);
      expect(summary.byKeyset['keyset-a'].balance).toBe(7); // 1 + 2 + 4
      expect(summary.byKeyset['keyset-b'].proofCount).toBe(2);
      expect(summary.byKeyset['keyset-b'].balance).toBe(24); // 8 + 16
    });

    it('should sort amounts in keyset', () => {
      const summary = summarizeProofs(mockProofs);
      
      expect(summary.byKeyset['keyset-a'].amounts).toEqual([1, 2, 4]);
      expect(summary.byKeyset['keyset-b'].amounts).toEqual([8, 16]);
    });

    it('should count by amount', () => {
      const summary = summarizeProofs(mockProofs);
      
      expect(summary.byAmount[1]).toBe(1);
      expect(summary.byAmount[2]).toBe(1);
      expect(summary.byAmount[4]).toBe(1);
      expect(summary.byAmount[8]).toBe(1);
      expect(summary.byAmount[16]).toBe(1);
    });

    it('should count duplicates', () => {
      const duplicateProofs: Proof[] = [
        { C: 'c1', amount: 1, id: 'k', secret: 's1' },
        { C: 'c2', amount: 1, id: 'k', secret: 's2' },
        { C: 'c3', amount: 1, id: 'k', secret: 's3' },
      ] as Proof[];
      
      const summary = summarizeProofs(duplicateProofs);
      expect(summary.byAmount[1]).toBe(3);
    });
  });

  describe('describeProof', () => {
    it('should format proof description', () => {
      const proof: Proof = { C: 'c', amount: 5, id: 'keyset12345678abcd', secret: 's' } as Proof;
      const desc = describeProof(proof);
      
      expect(desc).toBe('5 credits (keyset: keyset12)');
    });

    it('should handle short keyset ids', () => {
      const proof: Proof = { C: 'c', amount: 10, id: 'abc', secret: 's' } as Proof;
      const desc = describeProof(proof);
      
      expect(desc).toBe('10 credits (keyset: abc)');
    });
  });

  describe('canCoverAmount', () => {
    it('should return true when sufficient', () => {
      expect(canCoverAmount(mockProofs, 10)).toBe(true);
      expect(canCoverAmount(mockProofs, 31)).toBe(true);
    });

    it('should return false when insufficient', () => {
      expect(canCoverAmount(mockProofs, 32)).toBe(false);
      expect(canCoverAmount(mockProofs, 100)).toBe(false);
    });

    it('should return true for zero amount', () => {
      expect(canCoverAmount(mockProofs, 0)).toBe(true);
      expect(canCoverAmount([], 0)).toBe(true);
    });

    it('should return false for empty proofs (non-zero amount)', () => {
      expect(canCoverAmount([], 1)).toBe(false);
    });
  });

  describe('findOptimalProofs', () => {
    it('should return empty array for zero amount', () => {
      const result = findOptimalProofs(mockProofs, 0);
      expect(result).toEqual([]);
    });

    it('should return null if insufficient balance', () => {
      const result = findOptimalProofs(mockProofs, 100);
      expect(result).toBeNull();
    });

    it('should find exact match with single proof', () => {
      const result = findOptimalProofs(mockProofs, 8);
      
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(8);
    });

    it('should use smallest proofs first', () => {
      // For amount 3, should select 1 + 2 = 3 (exact)
      const result = findOptimalProofs(mockProofs, 3);
      
      expect(result).toBeDefined();
      const total = result!.reduce((s, p) => s + p.amount, 0);
      expect(total).toBeGreaterThanOrEqual(3);
      // Should select smallest proofs
      expect(result!.map(p => p.amount)).toEqual([1, 2]);
    });

    it('should handle amount requiring multiple proofs', () => {
      // For amount 5, should select 1 + 2 + 4 = 7 (with change)
      const result = findOptimalProofs(mockProofs, 5);
      
      expect(result).toBeDefined();
      const total = result!.reduce((s, p) => s + p.amount, 0);
      expect(total).toBeGreaterThanOrEqual(5);
    });

    it('should return all proofs if needed', () => {
      const result = findOptimalProofs(mockProofs, 31);
      
      expect(result).toHaveLength(5);
    });
  });

  describe('calculateChange', () => {
    it('should return 0 for exact amount', () => {
      const proofs: Proof[] = [
        { C: 'c', amount: 5, id: 'k', secret: 's' } as Proof,
      ];
      expect(calculateChange(proofs, 5)).toBe(0);
    });

    it('should return positive change for overpayment', () => {
      const proofs: Proof[] = [
        { C: 'c', amount: 10, id: 'k', secret: 's' } as Proof,
      ];
      expect(calculateChange(proofs, 7)).toBe(3);
    });

    it('should return negative for underpayment', () => {
      const proofs: Proof[] = [
        { C: 'c', amount: 3, id: 'k', secret: 's' } as Proof,
      ];
      expect(calculateChange(proofs, 5)).toBe(-2);
    });

    it('should handle empty proofs', () => {
      expect(calculateChange([], 5)).toBe(-5);
      expect(calculateChange([], 0)).toBe(0);
    });
  });

  describe('groupByKeyset', () => {
    it('should group proofs by keyset', () => {
      const groups = groupByKeyset(mockProofs);
      
      expect(Object.keys(groups)).toHaveLength(2);
      expect(groups['keyset-a']).toHaveLength(3);
      expect(groups['keyset-b']).toHaveLength(2);
    });

    it('should handle empty input', () => {
      const groups = groupByKeyset([]);
      expect(Object.keys(groups)).toHaveLength(0);
    });

    it('should handle single keyset', () => {
      const singleKeyset: Proof[] = [
        { C: 'c1', amount: 1, id: 'same', secret: 's1' },
        { C: 'c2', amount: 2, id: 'same', secret: 's2' },
      ] as Proof[];
      
      const groups = groupByKeyset(singleKeyset);
      expect(Object.keys(groups)).toHaveLength(1);
      expect(groups['same']).toHaveLength(2);
    });
  });

  describe('getDenominations', () => {
    it('should return sorted unique amounts', () => {
      const denoms = getDenominations(mockProofs);
      expect(denoms).toEqual([1, 2, 4, 8, 16]);
    });

    it('should handle duplicates', () => {
      const duplicates: Proof[] = [
        { C: 'c1', amount: 1, id: 'k', secret: 's1' },
        { C: 'c2', amount: 1, id: 'k', secret: 's2' },
        { C: 'c3', amount: 2, id: 'k', secret: 's3' },
      ] as Proof[];
      
      expect(getDenominations(duplicates)).toEqual([1, 2]);
    });

    it('should handle empty input', () => {
      expect(getDenominations([])).toEqual([]);
    });
  });

  describe('formatBalance', () => {
    it('should format integer amounts', () => {
      expect(formatBalance(1234)).toBe('1,234');
      expect(formatBalance(0)).toBe('0');
    });

    it('should add unit when provided', () => {
      expect(formatBalance(100, { unit: 'USD' })).toBe('100 USD');
      expect(formatBalance(1000, { unit: 'credits' })).toBe('1,000 credits');
    });

    it('should format decimals when specified', () => {
      expect(formatBalance(1234.5, { decimals: 2 })).toBe('1,234.50');
      expect(formatBalance(0.1, { decimals: 2 })).toBe('0.10');
    });

    it('should combine unit and decimals', () => {
      expect(formatBalance(99.9, { unit: 'USD', decimals: 2 })).toBe('99.90 USD');
    });
  });

  describe('getDefragStats', () => {
    it('should handle empty proofs', () => {
      const stats = getDefragStats([]);
      
      expect(stats.proofCount).toBe(0);
      expect(stats.balance).toBe(0);
      expect(stats.fragmentation).toBe(0);
      expect(stats.recommendation).toBe('none');
    });

    it('should calculate basic stats correctly', () => {
      const stats = getDefragStats(mockProofs);
      
      expect(stats.proofCount).toBe(5);
      expect(stats.balance).toBe(31);
      expect(stats.averageProofSize).toBeCloseTo(6.2, 1);
    });

    it('should detect highly fragmented wallet', () => {
      // Many small proofs = high fragmentation
      const fragmentedProofs: Proof[] = Array.from({ length: 20 }, (_, i) => ({
        C: `c${i}`,
        amount: 1,
        id: 'k',
        secret: `s${i}`,
      })) as Proof[];
      
      const stats = getDefragStats(fragmentedProofs);
      
      expect(stats.proofCount).toBe(20);
      expect(stats.balance).toBe(20);
      expect(stats.smallProofCount).toBe(20);
      expect(stats.fragmentation).toBeGreaterThan(0.5);
      expect(['recommended', 'urgent']).toContain(stats.recommendation);
    });

    it('should recognize well-optimized wallet', () => {
      // Optimal: using power-of-2 denominations
      const optimalProofs: Proof[] = [
        { C: 'c1', amount: 16, id: 'k', secret: 's1' },
        { C: 'c2', amount: 8, id: 'k', secret: 's2' },
        { C: 'c3', amount: 4, id: 'k', secret: 's3' },
      ] as Proof[];
      
      const stats = getDefragStats(optimalProofs);
      
      expect(stats.proofCount).toBe(3);
      expect(stats.balance).toBe(28);
      expect(stats.smallProofCount).toBe(0); // 4 is >= threshold
      expect(stats.fragmentation).toBeLessThan(0.3);
      expect(stats.recommendation).toBe('none');
    });

    it('should count small proofs with custom threshold', () => {
      const stats = getDefragStats(mockProofs, { smallThreshold: 8 });
      
      // 1, 2, 4 are all < 8
      expect(stats.smallProofCount).toBe(3);
    });

    it('should estimate new proof count after defrag', () => {
      // 20 x 1-credit proofs = 20 credits
      // Optimal for 20 would be: 16 + 4 = 2 proofs
      const fragmentedProofs: Proof[] = Array.from({ length: 20 }, (_, i) => ({
        C: `c${i}`,
        amount: 1,
        id: 'k',
        secret: `s${i}`,
      })) as Proof[];
      
      const stats = getDefragStats(fragmentedProofs);
      
      expect(stats.estimatedNewProofCount).toBeLessThan(stats.proofCount);
      expect(stats.estimatedNewProofCount).toBeLessThanOrEqual(5); // 16+4 or similar
    });
  });

  describe('needsDefragmentation', () => {
    it('should return false for empty wallet', () => {
      expect(needsDefragmentation([])).toBe(false);
    });

    it('should return false for small wallet', () => {
      const smallWallet: Proof[] = [
        { C: 'c1', amount: 10, id: 'k', secret: 's1' },
      ] as Proof[];
      
      expect(needsDefragmentation(smallWallet)).toBe(false);
    });

    it('should return true for highly fragmented wallet', () => {
      const fragmentedProofs: Proof[] = Array.from({ length: 15 }, (_, i) => ({
        C: `c${i}`,
        amount: 1,
        id: 'k',
        secret: `s${i}`,
      })) as Proof[];
      
      expect(needsDefragmentation(fragmentedProofs)).toBe(true);
    });

    it('should return false for optimal wallet', () => {
      const optimalProofs: Proof[] = [
        { C: 'c1', amount: 64, id: 'k', secret: 's1' },
        { C: 'c2', amount: 32, id: 'k', secret: 's2' },
        { C: 'c3', amount: 16, id: 'k', secret: 's3' },
      ] as Proof[];
      
      expect(needsDefragmentation(optimalProofs)).toBe(false);
    });
  });
});
