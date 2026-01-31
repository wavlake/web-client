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
  });
});
