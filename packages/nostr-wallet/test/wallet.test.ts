/**
 * Nip60Wallet Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Nip60Wallet } from '../src/wallet.js';

// Mock types
interface MockNDKUser {
  pubkey: string;
}

interface MockNDKSigner {
  user: () => Promise<MockNDKUser>;
  encrypt: (user: MockNDKUser, plaintext: string) => Promise<string>;
  decrypt: (user: MockNDKUser, ciphertext: string) => Promise<string>;
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

describe('Nip60Wallet', () => {
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
      encrypt: vi.fn().mockImplementation(async (_user, plaintext) => {
        return Buffer.from(plaintext).toString('base64');
      }),
      decrypt: vi.fn().mockImplementation(async (_user, ciphertext) => {
        return Buffer.from(ciphertext, 'base64').toString('utf8');
      }),
    };
  });

  describe('constructor', () => {
    it('creates wallet with default options', () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
      });

      expect(wallet.mintUrl).toBe(testMintUrl);
      expect(wallet.isSubscribed).toBe(false);
    });
  });

  describe('load()', () => {
    // Note: load() tests require mocking the Cashu mint connection
    // These are integration tests that need a running mint or full mock
    it.skip('loads proofs and subscribes by default', async () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
      });

      await wallet.load();

      expect(mockNdk.fetchEvents).toHaveBeenCalled();
      expect(mockNdk.subscribe).toHaveBeenCalled();
      expect(wallet.isSubscribed).toBe(true);
    });

    it.skip('skips subscription when autoSubscribe is false', async () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
        autoSubscribe: false,
      });

      await wallet.load();

      expect(mockNdk.fetchEvents).toHaveBeenCalled();
      expect(mockNdk.subscribe).not.toHaveBeenCalled();
      expect(wallet.isSubscribed).toBe(false);
    });
  });

  describe('subscribe()', () => {
    it('creates subscription for token events', async () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
        autoSubscribe: false,
      });

      await wallet.subscribe();

      expect(mockNdk.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [7375],
          authors: [testPubkey],
        }),
        expect.any(Object)
      );
      expect(mockSubscription.on).toHaveBeenCalledWith('event', expect.any(Function));
    });

    it('does not create duplicate subscriptions', async () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
        autoSubscribe: false,
      });

      await wallet.subscribe();
      await wallet.subscribe();

      expect(mockNdk.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe()', () => {
    it('stops the subscription', async () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
        autoSubscribe: false,
      });

      await wallet.subscribe();
      wallet.unsubscribe();

      expect(mockSubscription.stop).toHaveBeenCalled();
      expect(wallet.isSubscribed).toBe(false);
    });
  });

  describe('event handlers', () => {
    it('registers sync handler', async () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
        autoSubscribe: false,
      });

      const handler = vi.fn();
      const unsubscribe = wallet.onSync(handler);

      expect(typeof unsubscribe).toBe('function');
      
      // Unsubscribe should remove the handler
      unsubscribe();
    });

    it('registers conflict handler', async () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
        autoSubscribe: false,
      });

      const handler = vi.fn().mockReturnValue([]);
      const unsubscribe = wallet.onConflict(handler);

      expect(typeof unsubscribe).toBe('function');
      
      unsubscribe();
    });
  });

  describe('adapter access', () => {
    it('exposes the underlying adapter', () => {
      const wallet = new Nip60Wallet({
        ndk: mockNdk as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['ndk'],
        signer: mockSigner as unknown as Parameters<typeof Nip60Wallet.prototype.constructor>[0]['signer'],
        mintUrl: testMintUrl,
      });

      expect(wallet.adapter).toBeDefined();
      expect(wallet.adapter.mint).toBe(testMintUrl);
    });
  });
});
