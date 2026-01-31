/**
 * Health check utility tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkWalletHealth, quickHealthCheck } from '../src/health.js';
import type { Proof } from '@cashu/cashu-ts';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock proofs
const mockProof = (amount: number, keysetId = '00abcdef'): Proof => ({
  C: `02${Math.random().toString(16).slice(2, 34)}`,
  amount,
  id: keysetId,
  secret: `secret${Math.random()}`,
});

describe('checkWalletHealth', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return healthy status when mint is reachable and proofs valid', async () => {
    // Mock mint info
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        name: 'Test Mint',
        keysets: [{ id: '00abcdef' }],
      }),
    });

    // Mock checkstate
    const proofs = [mockProof(10), mockProof(5)];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        states: proofs.map(p => ({ Y: p.C, state: 'UNSPENT' })),
      }),
    });

    const health = await checkWalletHealth('https://mint.test.com', proofs);

    expect(health.mint.reachable).toBe(true);
    expect(health.proofs.valid).toBe(2);
    expect(health.proofs.validBalance).toBe(15);
    expect(health.proofs.spent).toBe(0);
    expect(health.score).toBeGreaterThanOrEqual(90);
    expect(health.issues).toHaveLength(0);
  });

  it('should detect unreachable mint', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const health = await checkWalletHealth('https://mint.test.com', [mockProof(10)]);

    expect(health.mint.reachable).toBe(false);
    expect(health.issues.some(i => i.includes('unreachable'))).toBe(true);
    expect(health.score).toBeLessThan(100);
  });

  it('should detect spent proofs', async () => {
    const proofs = [mockProof(10), mockProof(5)];

    // Mock mint info
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        keysets: [{ id: '00abcdef' }],
      }),
    });

    // Mock checkstate - one spent
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        states: [
          { Y: proofs[0].C, state: 'UNSPENT' },
          { Y: proofs[1].C, state: 'SPENT' },
        ],
      }),
    });

    const health = await checkWalletHealth('https://mint.test.com', proofs);

    expect(health.proofs.valid).toBe(1);
    expect(health.proofs.spent).toBe(1);
    expect(health.proofs.validBalance).toBe(10);
    expect(health.proofs.atRiskBalance).toBe(5);
    expect(health.issues.some(i => i.includes('spent'))).toBe(true);
  });

  it('should include details when requested', async () => {
    const proofs = [mockProof(10)];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ keysets: [] }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        states: [{ Y: proofs[0].C, state: 'UNSPENT' }],
      }),
    });

    const health = await checkWalletHealth('https://mint.test.com', proofs, {
      includeDetails: true,
    });

    expect(health.details).toBeDefined();
    expect(health.details).toHaveLength(1);
    expect(health.details![0].status).toBe('valid');
  });

  it('should handle empty wallet', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ keysets: [] }),
    });

    const health = await checkWalletHealth('https://mint.test.com', []);

    expect(health.mint.reachable).toBe(true);
    expect(health.proofs.total).toBe(0);
    expect(health.issues.some(i => i.includes('empty'))).toBe(true);
  });

  it('should skip proof check when requested', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ keysets: [] }),
    });

    const health = await checkWalletHealth(
      'https://mint.test.com',
      [mockProof(10)],
      { skipProofCheck: true }
    );

    expect(health.proofs.unknown).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only mint info, not checkstate
  });
});

describe('quickHealthCheck', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return healthy for good wallet', async () => {
    const proofs = [mockProof(10)];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ keysets: [] }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        states: [{ Y: proofs[0].C, state: 'UNSPENT' }],
      }),
    });

    const result = await quickHealthCheck('https://mint.test.com', proofs);

    expect(result.healthy).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('should return unhealthy when mint is down', async () => {
    // Mock mint unreachable AND checkstate failure (both fail)
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const result = await quickHealthCheck('https://mint.test.com', [mockProof(10)]);

    // Score drops 30 for unreachable mint + 20 for proof check failure = 50
    expect(result.score).toBeLessThan(70);
    expect(result.healthy).toBe(false);
    expect(result.issue).toBeDefined();
  });
});
