/**
 * Nip60Adapter
 * 
 * NIP-60 storage adapter for the Wavlake wallet.
 * Stores proofs on Nostr relays as encrypted kind:7375 events.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { StorageAdapter } from '@wavlake/wallet';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKSigner, NDKUser, NDKFilter } from '@nostr-dev-kit/ndk';
import type { Nip60AdapterConfig, TokenEventContent, WalletEventContent } from './types.js';
import { TOKEN_KIND, WALLET_KIND } from './types.js';

/**
 * NIP-60 storage adapter.
 * 
 * Syncs Cashu proofs to Nostr relays using kind:7375 events.
 * Supports both NIP-07 browser extensions and direct nsec signing.
 * 
 * @example
 * ```ts
 * import { Wallet } from '@wavlake/wallet';
 * import { Nip60Adapter } from '@wavlake/nostr-wallet';
 * import NDK from '@nostr-dev-kit/ndk';
 * 
 * const ndk = new NDK({ explicitRelayUrls: ['wss://relay.example.com'] });
 * await ndk.connect();
 * 
 * const adapter = new Nip60Adapter({
 *   ndk,
 *   signer: ndk.signer,
 *   mintUrl: 'https://mint.wavlake.com',
 * });
 * 
 * const wallet = new Wallet({ mintUrl, storage: adapter });
 * await wallet.load();
 * ```
 */
export class Nip60Adapter implements StorageAdapter {
  private readonly ndk: NDK;
  private readonly signer: NDKSigner;
  private readonly mintUrl: string;
  private readonly unit: string;
  private readonly _relays?: string[];
  
  /** Cached user for encryption operations */
  private _user: NDKUser | null = null;
  
  /** Track current token event IDs for deletion on save */
  private _currentTokenEventIds: Set<string> = new Set();
  
  /** P2PK keypair for nutzap receiving (lazy loaded from wallet event) */
  private _p2pkPrivkey: string | null = null;
  private _p2pkPubkey: string | null = null;

  constructor(config: Nip60AdapterConfig) {
    this.ndk = config.ndk;
    this.signer = config.signer;
    this.mintUrl = config.mintUrl;
    this.unit = config.unit ?? 'sat';
    this._relays = config.relays;
  }

  // ===========================================================================
  // StorageAdapter Interface
  // ===========================================================================

  /**
   * Load proofs from Nostr relays.
   * Fetches kind:7375 events, decrypts, and aggregates proofs for this mint.
   */
  async load(): Promise<Proof[]> {
    const user = await this.getUser();
    const pubkey = user.pubkey;

    // Fetch all token events for this user
    const filter: NDKFilter = {
      kinds: [TOKEN_KIND as number],
      authors: [pubkey],
    };

    const events = await this.ndk.fetchEvents(filter, {
      closeOnEose: true,
    });

    const proofs: Proof[] = [];
    this._currentTokenEventIds.clear();

    for (const event of events) {
      try {
        const content = await this.decryptContent<TokenEventContent>(event);
        
        // Filter by mint and unit
        if (content.mint !== this.mintUrl) {
          continue;
        }
        if (content.unit && content.unit !== this.unit) {
          continue;
        }

        // Track this event ID
        this._currentTokenEventIds.add(event.id);
        
        // Add proofs
        proofs.push(...content.proofs);
      } catch (error) {
        console.warn(`Nip60Adapter: Failed to decrypt token event ${event.id}`, error);
      }
    }

    return proofs;
  }

  /**
   * Save proofs to Nostr relays.
   * Creates a new kind:7375 event and deletes old ones.
   */
  async save(proofs: Proof[]): Promise<void> {
    // Delete old token events first
    await this.deleteTokenEvents([...this._currentTokenEventIds]);

    // If no proofs, we're done (just clearing)
    if (proofs.length === 0) {
      this._currentTokenEventIds.clear();
      return;
    }

    // Create new token event
    const content: TokenEventContent = {
      mint: this.mintUrl,
      unit: this.unit,
      proofs,
      del: [...this._currentTokenEventIds], // Reference deleted events
    };

    const event = await this.createEncryptedEvent(TOKEN_KIND, content);
    await event.publish();

    // Update tracked event IDs
    this._currentTokenEventIds.clear();
    this._currentTokenEventIds.add(event.id);
  }

  /**
   * Clear all proofs from Nostr relays.
   * Deletes all kind:7375 events for this user/mint.
   */
  async clear(): Promise<void> {
    await this.deleteTokenEvents([...this._currentTokenEventIds]);
    this._currentTokenEventIds.clear();
  }

  // ===========================================================================
  // P2PK Key Management
  // ===========================================================================

  /**
   * Get the P2PK public key for receiving nutzaps.
   * Loads from wallet event or generates if not present.
   */
  async getP2PKPubkey(): Promise<string> {
    if (this._p2pkPubkey) {
      return this._p2pkPubkey;
    }

    await this.loadOrCreateWalletEvent();
    return this._p2pkPubkey!;
  }

  /**
   * Get the P2PK private key for unlocking nutzaps.
   * Only available after loading wallet event.
   */
  async getP2PKPrivkey(): Promise<string> {
    if (this._p2pkPrivkey) {
      return this._p2pkPrivkey;
    }

    await this.loadOrCreateWalletEvent();
    return this._p2pkPrivkey!;
  }

  // ===========================================================================
  // Wallet Event (kind:17375)
  // ===========================================================================

  /**
   * Load existing wallet event or create a new one.
   */
  private async loadOrCreateWalletEvent(): Promise<void> {
    const user = await this.getUser();
    
    // Try to fetch existing wallet event
    const filter: NDKFilter = {
      kinds: [WALLET_KIND as number],
      authors: [user.pubkey],
      limit: 1,
    };

    const events = await this.ndk.fetchEvents(filter, { closeOnEose: true });
    const existing = [...events][0];

    if (existing) {
      try {
        const content = await this.decryptContent<WalletEventContent>(existing);
        this._p2pkPrivkey = content.privkey;
        this._p2pkPubkey = await this.derivePubkeyFromPrivkey(content.privkey);
        return;
      } catch (error) {
        console.warn('Nip60Adapter: Failed to decrypt wallet event, creating new one', error);
      }
    }

    // Generate new P2PK keypair
    const { privkey, pubkey } = await this.generateP2PKKeypair();
    this._p2pkPrivkey = privkey;
    this._p2pkPubkey = pubkey;

    // Create and publish wallet event
    const content: WalletEventContent = {
      privkey,
      mints: [this.mintUrl],
    };

    const event = await this.createEncryptedEvent(WALLET_KIND, content);
    await event.publish();
  }

  /**
   * Generate a new P2PK keypair.
   * Uses Web Crypto for secure random generation.
   */
  private async generateP2PKKeypair(): Promise<{ privkey: string; pubkey: string }> {
    // Generate 32 random bytes for private key
    const privkeyBytes = new Uint8Array(32);
    crypto.getRandomValues(privkeyBytes);
    const privkey = this.bytesToHex(privkeyBytes);

    const pubkey = await this.derivePubkeyFromPrivkey(privkey);
    return { privkey, pubkey };
  }

  /**
   * Derive public key from private key using secp256k1.
   */
  private async derivePubkeyFromPrivkey(privkey: string): Promise<string> {
    // Import secp256k1 dynamically to avoid bundling issues
    const { getPublicKey } = await import('@noble/secp256k1');
    const pubkeyBytes = getPublicKey(this.hexToBytes(privkey), true);
    // Return x-only pubkey (remove prefix byte)
    return this.bytesToHex(pubkeyBytes.slice(1));
  }

  // ===========================================================================
  // Event Helpers
  // ===========================================================================

  /**
   * Create an encrypted NDK event.
   */
  private async createEncryptedEvent(kind: number, content: unknown): Promise<NDKEvent> {
    const user = await this.getUser();
    
    // NDK event creation
    const NDKEvent = (await import('@nostr-dev-kit/ndk')).NDKEvent;
    const event = new NDKEvent(this.ndk);
    event.kind = kind;
    
    // Encrypt content to self
    const plaintext = JSON.stringify(content);
    event.content = await this.signer.encrypt(user, plaintext);
    
    // Sign the event
    await event.sign(this.signer);
    
    return event;
  }

  /**
   * Decrypt event content.
   */
  private async decryptContent<T>(event: NDKEvent): Promise<T> {
    const user = await this.getUser();
    const plaintext = await this.signer.decrypt(user, event.content);
    return JSON.parse(plaintext) as T;
  }

  /**
   * Delete token events using NIP-09.
   */
  private async deleteTokenEvents(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const NDKEvent = (await import('@nostr-dev-kit/ndk')).NDKEvent;
    const deleteEvent = new NDKEvent(this.ndk);
    deleteEvent.kind = 5; // NIP-09 deletion
    deleteEvent.tags = [
      ['k', String(TOKEN_KIND)],
      ...eventIds.map(id => ['e', id]),
    ];
    
    await deleteEvent.sign(this.signer);
    await deleteEvent.publish();
  }

  /**
   * Get the current user from signer.
   */
  private async getUser(): Promise<NDKUser> {
    if (this._user) {
      return this._user;
    }

    this._user = await this.signer.user();
    return this._user;
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  /** Get the mint URL this adapter is configured for */
  get mint(): string {
    return this.mintUrl;
  }

  /** Get the unit this adapter is configured for */
  get proofUnit(): string {
    return this.unit;
  }

  /** Get tracked token event IDs */
  get tokenEventIds(): string[] {
    return [...this._currentTokenEventIds];
  }

  /** Get configured relays (if any) */
  get relays(): string[] | undefined {
    return this._relays;
  }
}
