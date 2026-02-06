/**
 * Nip60Adapter Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Nip60Adapter } from '../src/adapter.js';
import type { Proof } from '@cashu/cashu-ts';

// Mock NDK types
interface MockNDKEvent {
  id: string;
  kind: number;
  content: string;
  tags: string[][];
  sign: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}

interface MockNDKUser {
  pubkey: string;
}

interface MockNDKSigner {
  user: () => Promise<MockNDKUser>;
  encrypt: (user: MockNDKUser, plaintext: string) => Promise<string>;
  decrypt: (user: MockNDKUser, ciphertext: string) => Promise<string>;
  sign: (event: unknown) => Promise<string>;
}

interface MockNDK {
  fetchEvents: ReturnType<typeof vi.fn>;
}

// Sample proofs for testing
const sampleProofs: Proof[] = [
  {
    id: '00ad268c4d1f5826',
    amount: 1,
    secret: 'abc123',
    C: '02abc...',
  },
  {
    id: '00ad268c4d1f5826',
    amount: 2,
    secret: 'def456',
    C: '02def...',
  },
];

const testMintUrl = 'https://mint.test.com';
const testPubkey = 'a'.repeat(64);

describe('Nip60Adapter', () => {
  let mockNdk: MockNDK;
  let mockSigner: MockNDKSigner;
  let adapter: Nip60Adapter;

  beforeEach(() => {
    // Create mock NDK
    mockNdk = {
      fetchEvents: vi.fn().mockResolvedValue(new Set()),
    };

    // Create mock signer with encrypt/decrypt that base64 encodes
    mockSigner = {
      user: vi.fn().mockResolvedValue({ pubkey: testPubkey }),
      encrypt: vi.fn().mockImplementation(async (_user, plaintext) => {
        return Buffer.from(plaintext).toString('base64');
      }),
      decrypt: vi.fn().mockImplementation(async (_user, ciphertext) => {
        return Buffer.from(ciphertext, 'base64').toString('utf8');
      }),
      // Required for NDKEvent.sign()
      sign: vi.fn().mockImplementation(async (_event) => {
        return 'mock-signature';
      }),
    };

    adapter = new Nip60Adapter({
      ndk: mockNdk as unknown as Parameters<typeof Nip60Adapter.prototype.constructor>[0]['ndk'],
      signer: mockSigner as unknown as Parameters<typeof Nip60Adapter.prototype.constructor>[0]['signer'],
      mintUrl: testMintUrl,
      unit: 'sat',
    });
  });

  describe('load()', () => {
    it('returns empty array when no events exist', async () => {
      mockNdk.fetchEvents.mockResolvedValue(new Set());

      const proofs = await adapter.load();

      expect(proofs).toEqual([]);
      expect(mockNdk.fetchEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [7375],
          authors: [testPubkey],
        }),
        expect.any(Object)
      );
    });

    it('decrypts and returns proofs from token events', async () => {
      const tokenContent = {
        mint: testMintUrl,
        unit: 'sat',
        proofs: sampleProofs,
      };

      const mockEvent: MockNDKEvent = {
        id: 'event1',
        kind: 7375,
        content: Buffer.from(JSON.stringify(tokenContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));

      const proofs = await adapter.load();

      expect(proofs).toEqual(sampleProofs);
      expect(mockSigner.decrypt).toHaveBeenCalled();
    });

    it('filters out proofs from different mints', async () => {
      const matchingContent = {
        mint: testMintUrl,
        unit: 'sat',
        proofs: [sampleProofs[0]],
      };

      const otherMintContent = {
        mint: 'https://other.mint.com',
        unit: 'sat',
        proofs: [sampleProofs[1]],
      };

      const matchingEvent: MockNDKEvent = {
        id: 'event1',
        kind: 7375,
        content: Buffer.from(JSON.stringify(matchingContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      const otherEvent: MockNDKEvent = {
        id: 'event2',
        kind: 7375,
        content: Buffer.from(JSON.stringify(otherMintContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([matchingEvent, otherEvent]));

      const proofs = await adapter.load();

      expect(proofs).toEqual([sampleProofs[0]]);
    });

    it('tracks loaded event IDs', async () => {
      const tokenContent = {
        mint: testMintUrl,
        unit: 'sat',
        proofs: sampleProofs,
      };

      const mockEvent: MockNDKEvent = {
        id: 'tracked-event-id',
        kind: 7375,
        content: Buffer.from(JSON.stringify(tokenContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));

      await adapter.load();

      expect(adapter.tokenEventIds).toContain('tracked-event-id');
    });
  });

  describe('getters', () => {
    it('returns mint URL', () => {
      expect(adapter.mint).toBe(testMintUrl);
    });

    it('returns unit', () => {
      expect(adapter.proofUnit).toBe('sat');
    });

    it('returns history event IDs', () => {
      expect(adapter.historyEventIds).toEqual([]);
    });
  });

  describe('loadHistory()', () => {
    it('returns empty array when no history events exist', async () => {
      mockNdk.fetchEvents.mockResolvedValue(new Set());

      const history = await adapter.loadHistory();

      expect(history).toEqual([]);
      expect(mockNdk.fetchEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [7376],
          authors: [testPubkey],
        }),
        expect.any(Object)
      );
    });

    it('decrypts and returns transactions from history events', async () => {
      const sampleTransactions = [
        {
          id: 'tx_1',
          type: 'send' as const,
          amount: -5,
          timestamp: '2024-01-15T10:00:00.000Z',
          status: 'completed' as const,
        },
        {
          id: 'tx_2',
          type: 'receive' as const,
          amount: 10,
          timestamp: '2024-01-15T11:00:00.000Z',
          status: 'completed' as const,
        },
      ];

      const historyContent = {
        mint: testMintUrl,
        unit: 'sat',
        transactions: sampleTransactions,
      };

      const mockEvent: MockNDKEvent = {
        id: 'history-event-1',
        kind: 7376,
        content: Buffer.from(JSON.stringify(historyContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));

      const history = await adapter.loadHistory();

      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('tx_2'); // Newest first
      expect(history[1].id).toBe('tx_1');
      expect(mockSigner.decrypt).toHaveBeenCalled();
    });

    it('filters out history from different mints', async () => {
      const matchingContent = {
        mint: testMintUrl,
        unit: 'sat',
        transactions: [{ id: 'tx_1', type: 'send', amount: -5, timestamp: '2024-01-15T10:00:00.000Z', status: 'completed' }],
      };

      const otherMintContent = {
        mint: 'https://other.mint.com',
        unit: 'sat',
        transactions: [{ id: 'tx_2', type: 'receive', amount: 10, timestamp: '2024-01-15T11:00:00.000Z', status: 'completed' }],
      };

      const matchingEvent: MockNDKEvent = {
        id: 'event1',
        kind: 7376,
        content: Buffer.from(JSON.stringify(matchingContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      const otherEvent: MockNDKEvent = {
        id: 'event2',
        kind: 7376,
        content: Buffer.from(JSON.stringify(otherMintContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([matchingEvent, otherEvent]));

      const history = await adapter.loadHistory();

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('tx_1');
    });

    it('deduplicates transactions by ID', async () => {
      const content1 = {
        mint: testMintUrl,
        unit: 'sat',
        transactions: [{ id: 'tx_dup', type: 'send', amount: -5, timestamp: '2024-01-15T10:00:00.000Z', status: 'completed' }],
      };

      const content2 = {
        mint: testMintUrl,
        unit: 'sat',
        transactions: [{ id: 'tx_dup', type: 'send', amount: -5, timestamp: '2024-01-15T10:00:00.000Z', status: 'completed' }],
      };

      const event1: MockNDKEvent = {
        id: 'event1',
        kind: 7376,
        content: Buffer.from(JSON.stringify(content1)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      const event2: MockNDKEvent = {
        id: 'event2',
        kind: 7376,
        content: Buffer.from(JSON.stringify(content2)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([event1, event2]));

      const history = await adapter.loadHistory();

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('tx_dup');
    });

    it('tracks loaded history event IDs', async () => {
      const historyContent = {
        mint: testMintUrl,
        unit: 'sat',
        transactions: [{ id: 'tx_1', type: 'send', amount: -5, timestamp: '2024-01-15T10:00:00.000Z', status: 'completed' }],
      };

      const mockEvent: MockNDKEvent = {
        id: 'tracked-history-id',
        kind: 7376,
        content: Buffer.from(JSON.stringify(historyContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));

      await adapter.loadHistory();

      expect(adapter.historyEventIds).toContain('tracked-history-id');
    });
  });

  describe('clearHistory()', () => {
    it('clears history event IDs', async () => {
      // First load some history to track IDs
      const historyContent = {
        mint: testMintUrl,
        unit: 'sat',
        transactions: [{ id: 'tx_1', type: 'send', amount: -5, timestamp: '2024-01-15T10:00:00.000Z', status: 'completed' }],
      };

      const mockEvent: MockNDKEvent = {
        id: 'to-delete-id',
        kind: 7376,
        content: Buffer.from(JSON.stringify(historyContent)).toString('base64'),
        tags: [],
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));
      await adapter.loadHistory();

      expect(adapter.historyEventIds).toContain('to-delete-id');

      // Now clear
      await adapter.clearHistory();

      expect(adapter.historyEventIds).toEqual([]);
    });
  });
});
