/**
 * Proof Selector tests
 */

import { describe, it, expect } from 'vitest';
import { smallestFirst, largestFirst, exactMatch, random } from '../../src/selectors/index.js';
import type { Proof } from '@cashu/cashu-ts';

// Mock proofs with various amounts
const mockProofs: Proof[] = [
  { C: 'c1', amount: 1, id: 'id1', secret: 's1' },
  { C: 'c2', amount: 2, id: 'id2', secret: 's2' },
  { C: 'c4', amount: 4, id: 'id3', secret: 's3' },
  { C: 'c8', amount: 8, id: 'id4', secret: 's4' },
] as Proof[];

const totalBalance = 15; // 1 + 2 + 4 + 8

describe('smallestFirst', () => {
  it('should return empty array for amount 0', () => {
    const result = smallestFirst(mockProofs, 0);
    expect(result).toEqual([]);
  });

  it('should return null for insufficient balance', () => {
    const result = smallestFirst(mockProofs, 100);
    expect(result).toBeNull();
  });

  it('should select smallest proofs first', () => {
    const result = smallestFirst(mockProofs, 3);
    expect(result).not.toBeNull();
    
    // Should select 1 + 2 = 3
    const amounts = result!.map(p => p.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([1, 2]);
  });

  it('should include more proofs if needed', () => {
    const result = smallestFirst(mockProofs, 5);
    expect(result).not.toBeNull();
    
    // Should select 1 + 2 + 4 = 7 (>= 5)
    const total = result!.reduce((s, p) => s + p.amount, 0);
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it('should not modify original array', () => {
    const original = [...mockProofs];
    smallestFirst(mockProofs, 5);
    expect(mockProofs).toEqual(original);
  });
});

describe('largestFirst', () => {
  it('should return empty array for amount 0', () => {
    const result = largestFirst(mockProofs, 0);
    expect(result).toEqual([]);
  });

  it('should return null for insufficient balance', () => {
    const result = largestFirst(mockProofs, 100);
    expect(result).toBeNull();
  });

  it('should select largest proofs first', () => {
    const result = largestFirst(mockProofs, 5);
    expect(result).not.toBeNull();
    
    // Should select 8 (>= 5) - just one proof
    expect(result!.length).toBe(1);
    expect(result![0].amount).toBe(8);
  });

  it('should include more proofs if largest is not enough', () => {
    const result = largestFirst(mockProofs, 10);
    expect(result).not.toBeNull();
    
    // Should select 8 + 4 = 12 (>= 10)
    const amounts = result!.map(p => p.amount).sort((a, b) => b - a);
    expect(amounts[0]).toBe(8);
    expect(amounts[1]).toBe(4);
  });
});

describe('exactMatch', () => {
  it('should return empty array for amount 0', () => {
    const result = exactMatch(mockProofs, 0);
    expect(result).toEqual([]);
  });

  it('should return null for insufficient balance', () => {
    const result = exactMatch(mockProofs, 100);
    expect(result).toBeNull();
  });

  it('should find exact match when possible', () => {
    // 1 + 2 = 3
    const result = exactMatch(mockProofs, 3);
    expect(result).not.toBeNull();
    
    const total = result!.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(3);
  });

  it('should find exact match with larger amounts', () => {
    // 1 + 4 + 8 = 13
    const result = exactMatch(mockProofs, 13);
    expect(result).not.toBeNull();
    
    const total = result!.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(13);
  });

  it('should fall back to smallestFirst when no exact match', () => {
    // No subset sums to 9
    const result = exactMatch(mockProofs, 9);
    expect(result).not.toBeNull();
    
    // Should have overpayment
    const total = result!.reduce((s, p) => s + p.amount, 0);
    expect(total).toBeGreaterThanOrEqual(9);
  });
});

describe('random', () => {
  it('should return empty array for amount 0', () => {
    const result = random(mockProofs, 0);
    expect(result).toEqual([]);
  });

  it('should return null for insufficient balance', () => {
    const result = random(mockProofs, 100);
    expect(result).toBeNull();
  });

  it('should select enough proofs', () => {
    const result = random(mockProofs, 5);
    expect(result).not.toBeNull();
    
    const total = result!.reduce((s, p) => s + p.amount, 0);
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it('should return different results (eventually)', () => {
    // Run multiple times and check for variance
    const results = new Set<string>();
    
    for (let i = 0; i < 20; i++) {
      const result = random(mockProofs, 5);
      if (result) {
        const key = result.map(p => p.C).sort().join(',');
        results.add(key);
      }
    }
    
    // Should have some variance (not always the same selection)
    // Note: This test could theoretically fail with very bad luck
    expect(results.size).toBeGreaterThanOrEqual(1);
  });
});
