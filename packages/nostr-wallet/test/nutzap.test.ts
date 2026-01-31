/**
 * Nutzap Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NutzapInfo } from '../src/nutzap/info.js';
import { NutzapReceiver } from '../src/nutzap/receiver.js';
import { NutzapSender } from '../src/nutzap/sender.js';

// Mock types
interface MockNDKUser {
  pubkey: string;
}

interface MockNDKSigner {
  user: () => Promise<MockNDKUser>;
  encrypt: (user: MockNDKUser, plaintext: string) => Promise<string>;
  decrypt: (user: MockNDKUser, ciphertext: string) => Promise<string>;
}

interface MockNDKEvent {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  sign: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}

interface MockNDKSubscription {
  on: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockNDK {
  fetchEvents: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

const testMintUrl = 'https://mint.test.com';
const testPubkey = 'a'.repeat(64);
const testP2pkPrivkey = 'b'.repeat(64);

describe('NutzapInfo', () => {
  let mockNdk: MockNDK;
  let mockSigner: MockNDKSigner;

  beforeEach(() => {
    mockNdk = {
      fetchEvents: vi.fn().mockResolvedValue(new Set()),
      subscribe: vi.fn(),
    };

    mockSigner = {
      user: vi.fn().mockResolvedValue({ pubkey: testPubkey }),
      encrypt: vi.fn().mockResolvedValue('encrypted'),
      decrypt: vi.fn().mockResolvedValue('decrypted'),
    };
  });

  describe('fetch()', () => {
    it('returns null when no info event exists', async () => {
      mockNdk.fetchEvents.mockResolvedValue(new Set());

      const info = new NutzapInfo({
        ndk: mockNdk as unknown as Parameters<typeof NutzapInfo.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapInfo.prototype.constructor>[0]['signer'],
      });

      const result = await info.fetch(testPubkey);

      expect(result).toBeNull();
    });

    it('parses info event correctly', async () => {
      const mockEvent: MockNDKEvent = {
        id: 'event1',
        kind: 10019,
        pubkey: testPubkey,
        content: '',
        tags: [
          ['relay', 'wss://relay1.test.com'],
          ['relay', 'wss://relay2.test.com'],
          ['mint', testMintUrl, 'usd', 'sat'],
          ['pubkey', 'p2pk-pubkey-123'],
        ],
        created_at: 1234567890,
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));

      const info = new NutzapInfo({
        ndk: mockNdk as unknown as Parameters<typeof NutzapInfo.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapInfo.prototype.constructor>[0]['signer'],
      });

      const result = await info.fetch(testPubkey);

      expect(result).toEqual({
        relays: ['wss://relay1.test.com', 'wss://relay2.test.com'],
        mints: [{ url: testMintUrl, units: ['usd', 'sat'] }],
        p2pkPubkey: 'p2pk-pubkey-123',
      });
    });
  });
});

describe('NutzapReceiver', () => {
  let mockNdk: MockNDK;
  let mockSigner: MockNDKSigner;
  let mockSubscription: MockNDKSubscription;

  beforeEach(() => {
    mockSubscription = {
      on: vi.fn(),
      stop: vi.fn(),
    };

    mockNdk = {
      fetchEvents: vi.fn().mockResolvedValue(new Set()),
      subscribe: vi.fn().mockReturnValue(mockSubscription),
    };

    mockSigner = {
      user: vi.fn().mockResolvedValue({ pubkey: testPubkey }),
      encrypt: vi.fn().mockResolvedValue('encrypted'),
      decrypt: vi.fn().mockResolvedValue('decrypted'),
    };
  });

  describe('constructor', () => {
    it('creates receiver with config', () => {
      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl],
      });

      expect(receiver.acceptedMints).toContain(testMintUrl);
      expect(receiver.isSubscribed).toBe(false);
    });
  });

  describe('subscribe()', () => {
    it('creates subscription for nutzaps', async () => {
      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl],
      });

      await receiver.subscribe();

      expect(mockNdk.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [9321],
          '#p': [testPubkey],
          '#u': [testMintUrl],
        }),
        expect.any(Object)
      );
      expect(receiver.isSubscribed).toBe(true);
    });

    it('does not create duplicate subscriptions', async () => {
      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl],
      });

      await receiver.subscribe();
      await receiver.subscribe();

      expect(mockNdk.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe()', () => {
    it('stops the subscription', async () => {
      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl],
      });

      await receiver.subscribe();
      receiver.unsubscribe();

      expect(mockSubscription.stop).toHaveBeenCalled();
      expect(receiver.isSubscribed).toBe(false);
    });
  });

  describe('fetchPending()', () => {
    it('returns empty array when no nutzaps', async () => {
      mockNdk.fetchEvents.mockResolvedValue(new Set());

      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl],
      });

      const pending = await receiver.fetchPending();

      expect(pending).toEqual([]);
    });

    it('parses nutzap events', async () => {
      const proof = {
        id: '00ad268c4d1f5826',
        amount: 5,
        secret: '["P2PK",{"nonce":"abc","data":"def"}]',
        C: '02abc...',
      };

      const mockEvent: MockNDKEvent = {
        id: 'nutzap-event-1',
        kind: 9321,
        pubkey: 'sender-pubkey',
        content: 'Thanks!',
        tags: [
          ['proof', JSON.stringify(proof)],
          ['u', testMintUrl],
          ['unit', 'sat'],
          ['p', testPubkey],
        ],
        created_at: 1234567890,
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));

      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl],
      });

      const pending = await receiver.fetchPending();

      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        id: 'nutzap-event-1',
        sender: 'sender-pubkey',
        amount: 5,
        mint: testMintUrl,
        unit: 'sat',
        comment: 'Thanks!',
      });
    });

    it('filters out nutzaps from unknown mints', async () => {
      const proof = {
        id: '00ad268c4d1f5826',
        amount: 5,
        secret: 'abc',
        C: '02abc...',
      };

      const mockEvent: MockNDKEvent = {
        id: 'nutzap-event-1',
        kind: 9321,
        pubkey: 'sender-pubkey',
        content: '',
        tags: [
          ['proof', JSON.stringify(proof)],
          ['u', 'https://unknown-mint.com'],
          ['p', testPubkey],
        ],
        created_at: 1234567890,
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));

      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl], // Only accepts testMintUrl
      });

      const pending = await receiver.fetchPending();

      expect(pending).toHaveLength(0);
    });
  });

  describe('on()', () => {
    it('registers handler and returns unsubscribe function', () => {
      const receiver = new NutzapReceiver({
        ndk: mockNdk as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapReceiver.prototype.constructor>[0]['signer'],
        p2pkPrivkey: testP2pkPrivkey,
        mints: [testMintUrl],
      });

      const handler = vi.fn();
      const unsubscribe = receiver.on('nutzap', handler);

      expect(typeof unsubscribe).toBe('function');
    });
  });
});

describe('NutzapSender', () => {
  let mockNdk: MockNDK;
  let mockSigner: MockNDKSigner;

  beforeEach(() => {
    mockNdk = {
      fetchEvents: vi.fn().mockResolvedValue(new Set()),
      subscribe: vi.fn(),
    };

    mockSigner = {
      user: vi.fn().mockResolvedValue({ pubkey: testPubkey }),
      encrypt: vi.fn().mockResolvedValue('encrypted'),
      decrypt: vi.fn().mockResolvedValue('decrypted'),
    };
  });

  describe('constructor', () => {
    it('creates sender with config', () => {
      const getProofs = vi.fn().mockResolvedValue([]);
      
      const sender = new NutzapSender({
        ndk: mockNdk as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['signer'],
        getProofs,
      });

      expect(sender).toBeDefined();
    });
  });

  describe('fetchRecipientInfo()', () => {
    it('returns null when recipient has no info', async () => {
      mockNdk.fetchEvents.mockResolvedValue(new Set());
      
      const sender = new NutzapSender({
        ndk: mockNdk as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['signer'],
        getProofs: vi.fn(),
      });

      const info = await sender.fetchRecipientInfo('some-pubkey');

      expect(info).toBeNull();
    });

    it('returns parsed info when recipient has 10019 event', async () => {
      const mockEvent: MockNDKEvent = {
        id: 'info-event',
        kind: 10019,
        pubkey: 'recipient-pubkey',
        content: '',
        tags: [
          ['relay', 'wss://relay.test.com'],
          ['mint', testMintUrl, 'sat'],
          ['pubkey', 'recipient-p2pk-pubkey'],
        ],
        created_at: 1234567890,
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));
      
      const sender = new NutzapSender({
        ndk: mockNdk as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['signer'],
        getProofs: vi.fn(),
      });

      const info = await sender.fetchRecipientInfo('recipient-pubkey');

      expect(info).toEqual({
        relays: ['wss://relay.test.com'],
        mints: [{ url: testMintUrl, units: ['sat'] }],
        p2pkPubkey: 'recipient-p2pk-pubkey',
      });
    });
  });

  describe('canSendTo()', () => {
    it('returns false when recipient has no info', async () => {
      mockNdk.fetchEvents.mockResolvedValue(new Set());
      
      const sender = new NutzapSender({
        ndk: mockNdk as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['signer'],
        getProofs: vi.fn(),
      });

      const result = await sender.canSendTo('some-pubkey', [testMintUrl]);

      expect(result.canSend).toBe(false);
      expect(result.reason).toBe('Recipient has no nutzap info');
    });

    it('returns false when no common mints', async () => {
      const mockEvent: MockNDKEvent = {
        id: 'info-event',
        kind: 10019,
        pubkey: 'recipient-pubkey',
        content: '',
        tags: [
          ['mint', 'https://other-mint.com', 'sat'],
          ['pubkey', 'recipient-p2pk-pubkey'],
        ],
        created_at: 1234567890,
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));
      
      const sender = new NutzapSender({
        ndk: mockNdk as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['signer'],
        getProofs: vi.fn(),
      });

      const result = await sender.canSendTo('recipient-pubkey', [testMintUrl]);

      expect(result.canSend).toBe(false);
      expect(result.reason).toBe('No common mints between sender and recipient');
    });

    it('returns true with common mints', async () => {
      const mockEvent: MockNDKEvent = {
        id: 'info-event',
        kind: 10019,
        pubkey: 'recipient-pubkey',
        content: '',
        tags: [
          ['mint', testMintUrl, 'sat'],
          ['pubkey', 'recipient-p2pk-pubkey'],
        ],
        created_at: 1234567890,
        sign: vi.fn(),
        publish: vi.fn(),
      };

      mockNdk.fetchEvents.mockResolvedValue(new Set([mockEvent]));
      
      const sender = new NutzapSender({
        ndk: mockNdk as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof NutzapSender.prototype.constructor>[0]['signer'],
        getProofs: vi.fn(),
      });

      const result = await sender.canSendTo('recipient-pubkey', [testMintUrl]);

      expect(result.canSend).toBe(true);
      expect(result.commonMints).toContain(testMintUrl);
    });
  });
});
