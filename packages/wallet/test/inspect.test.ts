/**
 * Proof inspection utility tests
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeProofs,
  describeProof,
  canCoverAmount,
  findOptimalProofs,
  calculateChange,
} from '../src/inspect.js';
import type { Proof } from '@cashu/cashu-ts';

// Helper to create mock proofs
const mockProof = (amount: number, keysetId = 'keyset1'): Proof => ({
  C: `C${amount}`,
  amount,
  id: keysetId,
  secret: `secret${amount}`,
});

describe('summarizeProofs', () => {
  it('should return empty summary for no proofs', () => {
    const summary = summarizeProofs([]);
    expect(summary.totalProofs).toBe(0);
    expect(summary.totalBalance).toBe(0);
    expect(Object.keys(summary.byKeyset)).toHaveLength(0);
  });

  it('should calculate total balance correctly', () => {
    const proofs = [
      mockProof(10),
      mockProof(20),
      mockProof(5),
    ];
    const summary = summarizeProofs(proofs);
    expect(summary.totalBalance).toBe(35);
    expect(summary.totalProofs).toBe(3);
  });

  it('should group by keyset', () => {
    const proofs = [
      mockProof(10, 'keyset1'),
      mockProof(20, 'keyset1'),
      mockProof(5, 'keyset2'),
    ];
    const summary = summarizeProofs(proofs);
    
    expect(Object.keys(summary.byKeyset)).toHaveLength(2);
    expect(summary.byKeyset['keyset1'].balance).toBe(30);
    expect(summary.byKeyset['keyset1'].proofCount).toBe(2);
    expect(summary.byKeyset['keyset2'].balance).toBe(5);
    expect(summary.byKeyset['keyset2'].proofCount).toBe(1);
  });

  it('should group by amount', () => {
    const proofs = [
      mockProof(10),
      mockProof(10),
      mockProof(5),
    ];
    const summary = summarizeProofs(proofs);
    
    expect(summary.byAmount[10]).toBe(2);
    expect(summary.byAmount[5]).toBe(1);
  });
});

describe('describeProof', () => {
  it('should return human-readable description', () => {
    const proof = mockProof(10, 'abcdefgh12345');
    const desc = describeProof(proof);
    expect(desc).toContain('10');
    expect(desc).toContain('abcdefgh');
  });
});

describe('canCoverAmount', () => {
  it('should return true when balance is sufficient', () => {
    const proofs = [mockProof(10), mockProof(20)];
    expect(canCoverAmount(proofs, 25)).toBe(true);
    expect(canCoverAmount(proofs, 30)).toBe(true);
  });

  it('should return false when balance is insufficient', () => {
    const proofs = [mockProof(10), mockProof(20)];
    expect(canCoverAmount(proofs, 31)).toBe(false);
    expect(canCoverAmount(proofs, 100)).toBe(false);
  });

  it('should handle empty proofs', () => {
    expect(canCoverAmount([], 1)).toBe(false);
    expect(canCoverAmount([], 0)).toBe(true);
  });
});

describe('findOptimalProofs', () => {
  it('should find smallest proofs to cover amount', () => {
    const proofs = [
      mockProof(10),
      mockProof(2),
      mockProof(5),
      mockProof(1),
    ];
    const selected = findOptimalProofs(proofs, 7);
    
    expect(selected).not.toBeNull();
    // Should pick 1, 2, 5 = 8 (smallest combination)
    expect(selected!.map(p => p.amount).sort()).toEqual([1, 2, 5]);
  });

  it('should return null when insufficient balance', () => {
    const proofs = [mockProof(5), mockProof(3)];
    expect(findOptimalProofs(proofs, 10)).toBeNull();
  });

  it('should return empty array for zero amount', () => {
    const proofs = [mockProof(5)];
    const selected = findOptimalProofs(proofs, 0);
    expect(selected).toEqual([]);
  });
});

describe('calculateChange', () => {
  it('should calculate change correctly', () => {
    const proofs = [mockProof(10), mockProof(20)];
    expect(calculateChange(proofs, 25)).toBe(5);
    expect(calculateChange(proofs, 30)).toBe(0);
  });

  it('should return 0 when overpaying impossible', () => {
    const proofs = [mockProof(10)];
    expect(calculateChange(proofs, 15)).toBe(0);
  });

  it('should handle empty proofs', () => {
    expect(calculateChange([], 10)).toBe(0);
  });
});
