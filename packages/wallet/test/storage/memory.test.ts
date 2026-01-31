/**
 * MemoryAdapter tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAdapter } from '../../src/storage/memory.js';
import type { Proof } from '@cashu/cashu-ts';

// Mock proofs
const mockProofs: Proof[] = [
  { C: 'c1', amount: 1, id: 'id1', secret: 's1' },
  { C: 'c2', amount: 2, id: 'id2', secret: 's2' },
  { C: 'c5', amount: 5, id: 'id3', secret: 's3' },
] as Proof[];

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  describe('constructor', () => {
    it('should start empty by default', async () => {
      const proofs = await adapter.load();
      expect(proofs).toEqual([]);
    });

    it('should accept initial proofs', async () => {
      adapter = new MemoryAdapter(mockProofs);
      const proofs = await adapter.load();
      expect(proofs).toHaveLength(3);
      expect(proofs[0].amount).toBe(1);
    });

    it('should deep clone initial proofs', async () => {
      const original = [{ C: 'c1', amount: 1, id: 'id1', secret: 's1' }] as Proof[];
      adapter = new MemoryAdapter(original);
      
      // Modify original
      original[0].amount = 999;
      
      // Should not affect stored proofs
      const proofs = await adapter.load();
      expect(proofs[0].amount).toBe(1);
    });
  });

  describe('save', () => {
    it('should save proofs', async () => {
      await adapter.save(mockProofs);
      const proofs = await adapter.load();
      expect(proofs).toHaveLength(3);
    });

    it('should overwrite existing proofs', async () => {
      await adapter.save(mockProofs);
      await adapter.save([mockProofs[0]]);
      const proofs = await adapter.load();
      expect(proofs).toHaveLength(1);
    });

    it('should deep clone saved proofs', async () => {
      const toSave = [{ C: 'c1', amount: 1, id: 'id1', secret: 's1' }] as Proof[];
      await adapter.save(toSave);
      
      // Modify original
      toSave[0].amount = 999;
      
      // Should not affect stored proofs
      const proofs = await adapter.load();
      expect(proofs[0].amount).toBe(1);
    });
  });

  describe('load', () => {
    it('should return copy of proofs', async () => {
      await adapter.save(mockProofs);
      const proofs1 = await adapter.load();
      const proofs2 = await adapter.load();
      
      expect(proofs1).not.toBe(proofs2);
      expect(proofs1).toEqual(proofs2);
    });

    it('should not allow mutation of stored proofs', async () => {
      await adapter.save(mockProofs);
      const proofs = await adapter.load();
      
      // Mutate returned proofs
      proofs[0].amount = 999;
      
      // Should not affect stored proofs
      const fresh = await adapter.load();
      expect(fresh[0].amount).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all proofs', async () => {
      await adapter.save(mockProofs);
      await adapter.clear();
      const proofs = await adapter.load();
      expect(proofs).toEqual([]);
    });
  });

  describe('helper properties', () => {
    it('count should return proof count', async () => {
      expect(adapter.count).toBe(0);
      await adapter.save(mockProofs);
      expect(adapter.count).toBe(3);
    });

    it('balance should return total amount', async () => {
      expect(adapter.balance).toBe(0);
      await adapter.save(mockProofs);
      expect(adapter.balance).toBe(8); // 1 + 2 + 5
    });
  });
});
