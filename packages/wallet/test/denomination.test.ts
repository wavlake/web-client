/**
 * Denomination Analyzer Tests
 */

import { describe, it, expect } from 'vitest';
import type { Proof } from '@cashu/cashu-ts';
import {
  analyzeExactPayment,
  analyzePayment,
  analyzeDenominationHealth,
  suggestDenominations,
  batchCheckExactPayments,
} from '../src/denomination.js';

// Helper to create mock proofs
function createProof(amount: number, id = 'test-keyset'): Proof {
  return {
    id,
    amount,
    secret: `secret-${amount}-${Math.random().toString(36).slice(2)}`,
    C: `C-${amount}-${Math.random().toString(36).slice(2)}`,
  };
}

function createProofs(amounts: number[]): Proof[] {
  return amounts.map(a => createProof(a));
}

// ============================================================================
// analyzeExactPayment
// ============================================================================

describe('analyzeExactPayment', () => {
  it('should detect single proof exact match', () => {
    const proofs = createProofs([1, 2, 5, 10]);
    const analysis = analyzeExactPayment(proofs, 5);
    
    expect(analysis.canPayExact).toBe(true);
    expect(analysis.exactProofs).toHaveLength(1);
    expect(analysis.exactProofs![0].amount).toBe(5);
    expect(analysis.totalBalance).toBe(18);
    expect(analysis.hasSufficientBalance).toBe(true);
  });

  it('should detect two-proof exact match', () => {
    const proofs = createProofs([1, 2, 4, 8]);
    const analysis = analyzeExactPayment(proofs, 6); // 2 + 4
    
    expect(analysis.canPayExact).toBe(true);
    expect(analysis.exactProofs).toHaveLength(2);
    const total = analysis.exactProofs!.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(6);
  });

  it('should detect multi-proof exact match', () => {
    const proofs = createProofs([1, 2, 4, 8, 16]);
    const analysis = analyzeExactPayment(proofs, 11); // 1 + 2 + 8
    
    expect(analysis.canPayExact).toBe(true);
    expect(analysis.exactProofs).not.toBeNull();
    const total = analysis.exactProofs!.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(11);
  });

  it('should return false when no exact match exists', () => {
    const proofs = createProofs([5, 10, 20]);
    const analysis = analyzeExactPayment(proofs, 7);
    
    expect(analysis.canPayExact).toBe(false);
    expect(analysis.exactProofs).toBeNull();
    expect(analysis.hasSufficientBalance).toBe(true);
  });

  it('should handle insufficient balance', () => {
    const proofs = createProofs([1, 2, 3]);
    const analysis = analyzeExactPayment(proofs, 10);
    
    expect(analysis.canPayExact).toBe(false);
    expect(analysis.hasSufficientBalance).toBe(false);
    expect(analysis.totalBalance).toBe(6);
  });

  it('should handle empty proofs', () => {
    const analysis = analyzeExactPayment([], 5);
    
    expect(analysis.canPayExact).toBe(false);
    expect(analysis.hasSufficientBalance).toBe(false);
    expect(analysis.totalBalance).toBe(0);
  });

  it('should handle zero amount', () => {
    const proofs = createProofs([1, 2, 3]);
    const analysis = analyzeExactPayment(proofs, 0);
    
    // Zero amount is considered invalid (not a real payment)
    expect(analysis.canPayExact).toBe(false);
    // But technically you have "sufficient" balance for zero
    expect(analysis.hasSufficientBalance).toBe(true);
  });

  it('should handle duplicate denominations', () => {
    const proofs = createProofs([5, 5, 5, 5]);
    const analysis = analyzeExactPayment(proofs, 10);
    
    expect(analysis.canPayExact).toBe(true);
    expect(analysis.exactProofs).toHaveLength(2);
  });
});

// ============================================================================
// analyzePayment
// ============================================================================

describe('analyzePayment', () => {
  it('should return exact match analysis when possible', () => {
    const proofs = createProofs([1, 2, 4, 8]);
    const analysis = analyzePayment(proofs, 4);
    
    expect(analysis.canAfford).toBe(true);
    expect(analysis.canPayExact).toBe(true);
    expect(analysis.requiresSwap).toBe(false);
    expect(analysis.changeAmount).toBe(0);
    expect(analysis.efficiency).toBe(1.0);
    expect(analysis.selectedTotal).toBe(4);
  });

  it('should calculate change when swap needed', () => {
    const proofs = createProofs([10, 20]);
    const analysis = analyzePayment(proofs, 7);
    
    expect(analysis.canAfford).toBe(true);
    expect(analysis.canPayExact).toBe(false);
    expect(analysis.requiresSwap).toBe(true);
    expect(analysis.selectedTotal).toBe(10); // smallest first
    expect(analysis.changeAmount).toBe(3);
    expect(analysis.efficiency).toBeCloseTo(0.7, 2);
  });

  it('should handle insufficient balance', () => {
    const proofs = createProofs([1, 2]);
    const analysis = analyzePayment(proofs, 10);
    
    expect(analysis.canAfford).toBe(false);
    expect(analysis.selectedProofs).toHaveLength(0);
    expect(analysis.efficiency).toBe(0);
  });

  it('should select smallest proofs first when swap needed', () => {
    const proofs = createProofs([1, 5, 10, 50]);
    const analysis = analyzePayment(proofs, 12);
    
    // Should select 1 + 5 + 10 = 16 (not 50)
    expect(analysis.selectedTotal).toBe(16);
    expect(analysis.changeAmount).toBe(4);
  });

  it('should report correct amount', () => {
    const proofs = createProofs([5, 10]);
    const analysis = analyzePayment(proofs, 7);
    
    expect(analysis.amount).toBe(7);
  });
});

// ============================================================================
// analyzeDenominationHealth
// ============================================================================

describe('analyzeDenominationHealth', () => {
  it('should calculate basic statistics', () => {
    const proofs = createProofs([1, 2, 4, 8, 16]);
    const health = analyzeDenominationHealth(proofs);
    
    expect(health.totalBalance).toBe(31);
    expect(health.proofCount).toBe(5);
    expect(health.denominations).toEqual([1, 2, 4, 8, 16]);
    expect(health.smallestDenom).toBe(1);
    expect(health.largestDenom).toBe(16);
    expect(health.averageProofSize).toBeCloseTo(6.2, 1);
  });

  it('should count denominations', () => {
    const proofs = createProofs([5, 5, 10, 10, 10]);
    const health = analyzeDenominationHealth(proofs);
    
    expect(health.denominationCounts[5]).toBe(2);
    expect(health.denominationCounts[10]).toBe(3);
  });

  it('should identify exact payable amounts', () => {
    const proofs = createProofs([1, 2, 4, 8]);
    const health = analyzeDenominationHealth(proofs, {
      commonAmounts: [1, 2, 3, 5, 10, 15],
    });
    
    // Can pay exactly: 1, 2, 3 (1+2), 5 (1+4), 10 (2+8)
    expect(health.exactPayableAmounts).toContain(1);
    expect(health.exactPayableAmounts).toContain(2);
    expect(health.exactPayableAmounts).toContain(3);
    expect(health.exactPayableAmounts).toContain(5);
    expect(health.exactPayableAmounts).toContain(10);
  });

  it('should recommend splitting when all same denomination', () => {
    const proofs = createProofs([10, 10, 10, 10]);
    const health = analyzeDenominationHealth(proofs);
    
    expect(health.recommendations.length).toBeGreaterThan(0);
    expect(health.recommendations.some(r => r.includes('splitting'))).toBe(true);
    expect(health.score).toBeLessThan(100);
  });

  it('should warn about very large proofs', () => {
    const proofs = createProofs([1, 500]);
    const health = analyzeDenominationHealth(proofs);
    
    expect(health.recommendations.some(r => r.includes('Large proofs'))).toBe(true);
  });

  it('should warn about too many tiny proofs', () => {
    const proofs = createProofs([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 100]);
    const health = analyzeDenominationHealth(proofs);
    
    expect(health.recommendations.some(r => r.includes('tiny'))).toBe(true);
  });

  it('should handle empty wallet', () => {
    const health = analyzeDenominationHealth([]);
    
    expect(health.totalBalance).toBe(0);
    expect(health.proofCount).toBe(0);
    expect(health.score).toBe(0);
    expect(health.recommendations.some(r => r.includes('empty'))).toBe(true);
  });

  it('should give good score for well-distributed wallet', () => {
    const proofs = createProofs([1, 2, 4, 8, 16, 32, 64]);
    const health = analyzeDenominationHealth(proofs);
    
    expect(health.score).toBeGreaterThanOrEqual(80);
  });
});

// ============================================================================
// suggestDenominations
// ============================================================================

describe('suggestDenominations', () => {
  it('should use power-of-2 denominations', () => {
    const suggestion = suggestDenominations(15);
    
    // 15 = 1 + 2 + 4 + 8
    expect(suggestion[1]).toBe(1);
    expect(suggestion[2]).toBe(1);
    expect(suggestion[4]).toBe(1);
    expect(suggestion[8]).toBe(1);
  });

  it('should handle exact power of 2', () => {
    const suggestion = suggestDenominations(16);
    
    expect(suggestion[16]).toBe(1);
    expect(Object.keys(suggestion).length).toBe(1);
  });

  it('should handle larger amounts', () => {
    const suggestion = suggestDenominations(100);
    
    // 100 = 64 + 32 + 4
    const total = Object.entries(suggestion).reduce(
      (sum, [denom, count]) => sum + Number(denom) * count,
      0
    );
    expect(total).toBe(100);
  });

  it('should handle zero', () => {
    const suggestion = suggestDenominations(0);
    expect(Object.keys(suggestion).length).toBe(0);
  });

  it('should handle negative', () => {
    const suggestion = suggestDenominations(-5);
    expect(Object.keys(suggestion).length).toBe(0);
  });
});

// ============================================================================
// batchCheckExactPayments
// ============================================================================

describe('batchCheckExactPayments', () => {
  it('should check multiple amounts', () => {
    const proofs = createProofs([1, 2, 4, 8]);
    const results = batchCheckExactPayments(proofs, [1, 3, 7, 20]);
    
    expect(results[1]).toBe(true);  // 1
    expect(results[3]).toBe(true);  // 1 + 2
    expect(results[7]).toBe(true);  // 1 + 2 + 4
    expect(results[20]).toBe(false); // exceeds balance
  });

  it('should handle amounts exceeding balance', () => {
    const proofs = createProofs([5]);
    const results = batchCheckExactPayments(proofs, [5, 10, 100]);
    
    expect(results[5]).toBe(true);
    expect(results[10]).toBe(false);
    expect(results[100]).toBe(false);
  });

  it('should handle empty proofs', () => {
    const results = batchCheckExactPayments([], [1, 5, 10]);
    
    expect(results[1]).toBe(false);
    expect(results[5]).toBe(false);
    expect(results[10]).toBe(false);
  });

  it('should handle empty amounts array', () => {
    const proofs = createProofs([1, 2, 4]);
    const results = batchCheckExactPayments(proofs, []);
    
    expect(Object.keys(results).length).toBe(0);
  });
});
