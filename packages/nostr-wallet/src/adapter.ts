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
import type { SerializedTransaction } from '@wavlake/wallet';
import { TOKEN_KIND, WALLET_KIND, HISTORY_KIND } from './types.js';

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
  
  /** Track current history event IDs for deletion on save */
  private _currentHistoryEventIds: Set<string> = new Set();
  
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
    
    // Publish with lenient settings - only need 1 relay to accept
    try {
      const relays = await event.publish();
      console.log(`[nip60] Token event published to ${relays?.size || 0} relays`);
    } catch (publishError) {
      // Log but don't fail if publish has issues - proofs are still in memory
      console.warn('[nip60] Publish warning:', publishError);
    }

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
  // History Storage (Optional Interface Methods)
  // ===========================================================================

  /**
   * Load transaction history from Nostr relays.
   * Fetches kind:7376 events, decrypts, and returns transactions.
   */
  async loadHistory(): Promise<SerializedTransaction[]> {
    const user = await this.getUser();
    const pubkey = user.pubkey;

    const filter: NDKFilter = {
      kinds: [HISTORY_KIND as number],
      authors: [pubkey],
    };

    const events = await this.ndk.fetchEvents(filter, {
      closeOnEose: true,
    });

    const transactions: SerializedTransaction[] = [];
    this._currentHistoryEventIds.clear();

    for (const event of events) {
      try {
        const content = await this.decryptContent<{
          transactions: SerializedTransaction[];
          mint: string;
          unit?: string;
        }>(event);
        
        // Filter by mint and unit
        if (content.mint !== this.mintUrl) {
          continue;
        }
        if (content.unit && content.unit !== this.unit) {
          continue;
        }

        // Track this event ID
        this._currentHistoryEventIds.add(event.id);
        
        // Add transactions
        if (content.transactions && Array.isArray(content.transactions)) {
          transactions.push(...content.transactions);
        }
      } catch (error) {
        console.warn(`Nip60Adapter: Failed to decrypt history event ${event.id}`, error);
      }
    }

    // Sort by timestamp (newest first) and deduplicate by ID
    const seen = new Set<string>();
    const deduped = transactions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter(tx => {
        if (seen.has(tx.id)) return false;
        seen.add(tx.id);
        return true;
      });

    return deduped;
  }

  /**
   * Save transaction history to Nostr relays.
   * Creates a new kind:7376 event and deletes old ones.
   */
  async saveHistory(history: SerializedTransaction[]): Promise<void> {
    // Delete old history events first
    await this.deleteHistoryEvents([...this._currentHistoryEventIds]);

    // If no history, we're done
    if (history.length === 0) {
      this._currentHistoryEventIds.clear();
      return;
    }

    // Create new history event
    const content = {
      transactions: history,
      mint: this.mintUrl,
      unit: this.unit,
      del: [...this._currentHistoryEventIds],
    };

    const event = await this.createEncryptedEvent(HISTORY_KIND, content);
    
    try {
      const relays = await event.publish();
      console.log(`[nip60] History event published to ${relays?.size || 0} relays`);
    } catch (publishError) {
      console.warn('[nip60] History publish warning:', publishError);
    }

    // Update tracked event IDs
    this._currentHistoryEventIds.clear();
    this._currentHistoryEventIds.add(event.id);
  }

  /**
   * Clear transaction history from Nostr relays.
   */
  async clearHistory(): Promise<void> {
    await this.deleteHistoryEvents([...this._currentHistoryEventIds]);
    this._currentHistoryEventIds.clear();
  }

  /**
   * Delete history events using NIP-09.
   */
  private async deleteHistoryEvents(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const NDKEvent = (await import('@nostr-dev-kit/ndk')).NDKEvent;
    const deleteEvent = new NDKEvent(this.ndk);
    deleteEvent.kind = 5; // NIP-09 deletion
    deleteEvent.tags = [
      ['k', String(HISTORY_KIND)],
      ...eventIds.map(id => ['e', id]),
    ];
    
    await deleteEvent.sign(this.signer);
    try {
      await deleteEvent.publish();
    } catch (e) {
      console.warn('[nip60] History delete event publish warning:', e);
    }
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
    try {
      await event.publish();
    } catch (e) {
      console.warn('[nip60] Wallet event publish warning:', e);
    }
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
    try {
      await deleteEvent.publish();
    } catch (e) {
      console.warn('[nip60] Delete event publish warning:', e);
    }
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

  /** Get tracked history event IDs */
  get historyEventIds(): string[] {
    return [...this._currentHistoryEventIds];
  }

  /** Get configured relays (if any) */
  get relays(): string[] | undefined {
    return this._relays;
  }
}
