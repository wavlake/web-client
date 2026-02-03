/**
 * Transaction History tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TransactionStore,
  formatTransaction,
  groupByDate,
  calculateRunningBalance,
  type TransactionRecord,
} from '../src/history.js';

describe('TransactionStore', () => {
  let store: TransactionStore;

  beforeEach(() => {
    store = new TransactionStore();
  });

  describe('add', () => {
    it('should add a transaction with generated id and timestamp', () => {
      const tx = store.add({
        type: 'send',
        amount: -5,
        memo: 'Test payment',
      });

      expect(tx.id).toMatch(/^tx_/);
      expect(tx.timestamp).toBeInstanceOf(Date);
      expect(tx.type).toBe('send');
      expect(tx.amount).toBe(-5);
      expect(tx.memo).toBe('Test payment');
      expect(tx.status).toBe('completed');
    });

    it('should accept custom timestamp and status', () => {
      const customDate = new Date('2024-01-15T10:00:00Z');
      const tx = store.add({
        type: 'mint',
        amount: 100,
        timestamp: customDate,
        status: 'pending',
      });

      expect(tx.timestamp).toEqual(customDate);
      expect(tx.status).toBe('pending');
    });

    it('should store metadata', () => {
      const tx = store.add({
        type: 'send',
        amount: -1,
        metadata: { dtag: 'track-123', artist: 'Test Artist' },
      });

      expect(tx.metadata).toEqual({ dtag: 'track-123', artist: 'Test Artist' });
    });
  });

  describe('update', () => {
    it('should update transaction status', () => {
      const tx = store.add({
        type: 'mint',
        amount: 50,
        status: 'pending',
      });

      const updated = store.update(tx.id, { status: 'completed' });

      expect(updated?.status).toBe('completed');
      expect(store.get(tx.id)?.status).toBe('completed');
    });

    it('should return null for non-existent id', () => {
      const result = store.update('non-existent', { status: 'failed' });
      expect(result).toBeNull();
    });
  });

  describe('get', () => {
    it('should retrieve transaction by id', () => {
      const tx = store.add({ type: 'receive', amount: 10 });
      const found = store.get(tx.id);
      expect(found).toEqual(tx);
    });

    it('should return null for non-existent id', () => {
      expect(store.get('non-existent')).toBeNull();
    });
  });

  describe('query', () => {
    beforeEach(() => {
      // Add test transactions
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      
      store.add({ type: 'mint', amount: 100, timestamp: new Date(baseTime) });
      store.add({ type: 'send', amount: -5, timestamp: new Date(baseTime + 1000) });
      store.add({ type: 'receive', amount: 2, timestamp: new Date(baseTime + 2000) });
      store.add({ type: 'send', amount: -3, timestamp: new Date(baseTime + 3000) });
      store.add({ type: 'send', amount: -1, timestamp: new Date(baseTime + 4000), status: 'failed' });
    });

    it('should return all transactions by default (newest first)', () => {
      const result = store.query();
      
      expect(result.total).toBe(5);
      expect(result.records.length).toBe(5);
      expect(result.hasMore).toBe(false);
      // Should be newest first (desc)
      expect(result.records[0].amount).toBe(-1);
    });

    it('should filter by type', () => {
      const result = store.query({ types: ['send'] });
      
      expect(result.total).toBe(3);
      expect(result.records.every(tx => tx.type === 'send')).toBe(true);
    });

    it('should filter by multiple types', () => {
      const result = store.query({ types: ['send', 'receive'] });
      
      expect(result.total).toBe(4);
    });

    it('should filter by status', () => {
      const result = store.query({ status: 'failed' });
      
      expect(result.total).toBe(1);
      expect(result.records[0].status).toBe('failed');
    });

    it('should filter by date range', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const result = store.query({
        since: new Date(baseTime + 1000),
        until: new Date(baseTime + 3000),
      });
      
      expect(result.total).toBe(3); // 3 transactions in range
    });

    it('should paginate with limit and offset', () => {
      const page1 = store.query({ limit: 2, offset: 0 });
      const page2 = store.query({ limit: 2, offset: 2 });
      
      expect(page1.records.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page2.records.length).toBe(2);
      expect(page2.hasMore).toBe(true);
    });

    it('should sort ascending', () => {
      const result = store.query({ order: 'asc' });
      
      expect(result.records[0].amount).toBe(100); // First transaction (mint)
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      store.add({ type: 'mint', amount: 100 });
      store.add({ type: 'send', amount: -30 });
      store.add({ type: 'receive', amount: 5 });
      store.add({ type: 'send', amount: -15, status: 'failed' }); // Should be excluded
    });

    it('should calculate totals correctly', () => {
      const summary = store.getSummary();
      
      expect(summary.totalSent).toBe(30); // Only completed sends
      expect(summary.totalReceived).toBe(105); // mint + receive
      expect(summary.netChange).toBe(75);
      expect(summary.transactionCount).toBe(4);
    });
  });

  describe('serialize/deserialize', () => {
    it('should round-trip correctly', () => {
      store.add({ type: 'send', amount: -5, memo: 'Test' });
      store.add({ type: 'receive', amount: 3 });
      
      const serialized = store.serialize();
      const restored = TransactionStore.deserialize(serialized);
      
      expect(restored.count).toBe(2);
      expect(restored.all()[0].memo).toBe('Test');
      expect(restored.all()[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('clear', () => {
    it('should remove all transactions', () => {
      store.add({ type: 'send', amount: -5 });
      store.add({ type: 'receive', amount: 3 });
      
      store.clear();
      
      expect(store.count).toBe(0);
      expect(store.all()).toEqual([]);
    });
  });
});

describe('formatTransaction', () => {
  it('should format send transactions', () => {
    const tx: TransactionRecord = {
      id: 'test',
      type: 'send',
      amount: -5,
      timestamp: new Date(),
      status: 'completed',
    };
    
    expect(formatTransaction(tx)).toBe('-5 credits (sent)');
  });

  it('should format receive transactions', () => {
    const tx: TransactionRecord = {
      id: 'test',
      type: 'receive',
      amount: 10,
      timestamp: new Date(),
      status: 'completed',
    };
    
    expect(formatTransaction(tx)).toBe('+10 credits (received)');
  });

  it('should format mint transactions', () => {
    const tx: TransactionRecord = {
      id: 'test',
      type: 'mint',
      amount: 100,
      timestamp: new Date(),
      status: 'completed',
    };
    
    expect(formatTransaction(tx)).toBe('+100 credits (minted)');
  });
});

describe('groupByDate', () => {
  it('should group transactions by date', () => {
    const transactions: TransactionRecord[] = [
      { id: '1', type: 'send', amount: -5, timestamp: new Date('2024-01-15T10:00:00Z'), status: 'completed' },
      { id: '2', type: 'send', amount: -3, timestamp: new Date('2024-01-15T15:00:00Z'), status: 'completed' },
      { id: '3', type: 'receive', amount: 10, timestamp: new Date('2024-01-16T10:00:00Z'), status: 'completed' },
    ];
    
    const grouped = groupByDate(transactions);
    
    expect(Object.keys(grouped)).toEqual(['2024-01-15', '2024-01-16']);
    expect(grouped['2024-01-15'].length).toBe(2);
    expect(grouped['2024-01-16'].length).toBe(1);
  });
});

describe('calculateRunningBalance', () => {
  it('should calculate running balance', () => {
    const transactions: TransactionRecord[] = [
      { id: '1', type: 'mint', amount: 100, timestamp: new Date(), status: 'completed' },
      { id: '2', type: 'send', amount: -30, timestamp: new Date(), status: 'completed' },
      { id: '3', type: 'receive', amount: 5, timestamp: new Date(), status: 'completed' },
    ];
    
    const result = calculateRunningBalance(transactions, 0);
    
    expect(result[0][1]).toBe(100);  // After mint
    expect(result[1][1]).toBe(70);   // After send
    expect(result[2][1]).toBe(75);   // After receive
  });

  it('should accept starting balance', () => {
    const transactions: TransactionRecord[] = [
      { id: '1', type: 'send', amount: -10, timestamp: new Date(), status: 'completed' },
    ];
    
    const result = calculateRunningBalance(transactions, 50);
    
    expect(result[0][1]).toBe(40);
  });

  it('should skip non-completed transactions', () => {
    const transactions: TransactionRecord[] = [
      { id: '1', type: 'send', amount: -10, timestamp: new Date(), status: 'pending' },
    ];
    
    const result = calculateRunningBalance(transactions, 50);
    
    expect(result[0][1]).toBe(50); // Balance unchanged
  });
});
