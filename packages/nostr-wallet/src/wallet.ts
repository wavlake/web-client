/**
 * Nip60Wallet
 * 
 * Extended wallet with full NIP-60 support including sync events,
 * spending history, and real-time subscriptions.
 */

import type { Proof } from '@cashu/cashu-ts';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKSigner, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { Wallet } from '@wavlake/wallet';
import { Nip60Adapter } from './adapter.js';
import type {
  Nip60AdapterConfig,
  SpendingRecord,
  SyncHandler,
  ConflictHandler,
} from './types.js';
import { TOKEN_KIND, HISTORY_KIND } from './types.js';

/**
 * Configuration for Nip60Wallet
 */
export interface Nip60WalletConfig extends Nip60AdapterConfig {
  /** Whether to auto-subscribe to relay updates (default: true) */
  autoSubscribe?: boolean;
  /** Conflict resolution strategy */
  onConflict?: ConflictHandler;
}

/**
 * Extended wallet with full NIP-60 features.
 * 
 * Adds real-time sync, spending history, and conflict resolution
 * on top of the base Wallet functionality.
 * 
 * @example
 * ```ts
 * import { Nip60Wallet } from '@wavlake/nostr-wallet';
 * 
 * const wallet = new Nip60Wallet({
 *   ndk,
 *   signer: ndk.signer,
 *   mintUrl: 'https://mint.wavlake.com',
 * });
 * 
 * await wallet.load();
 * 
 * wallet.on('sync', () => console.log('Synced with relays'));
 * wallet.on('conflict', (local, remote) => console.log('Conflict detected'));
 * 
 * // All standard wallet methods work
 * await wallet.createToken(5);
 * ```
 */
export class Nip60Wallet extends Wallet {
  private readonly ndk: NDK;
  private readonly signer: NDKSigner;
  private readonly nip60Adapter: Nip60Adapter;
  private readonly autoSubscribe: boolean;
  private readonly conflictHandler?: ConflictHandler;
  
  /** Active subscription for real-time updates */
  private _subscription: NDKSubscription | null = null;
  
  /** Event handlers */
  private _syncHandlers: Set<SyncHandler> = new Set();
  private _conflictHandlers: Set<ConflictHandler> = new Set();

  constructor(config: Nip60WalletConfig) {
    // Create the Nip60Adapter
    const adapter = new Nip60Adapter({
      ndk: config.ndk,
      signer: config.signer,
      mintUrl: config.mintUrl,
      unit: config.unit,
      relays: config.relays,
    });

    // Initialize base Wallet with the adapter
    super({
      mintUrl: config.mintUrl,
      storage: adapter,
      unit: config.unit,
    });

    this.ndk = config.ndk;
    this.signer = config.signer;
    this.nip60Adapter = adapter;
    this.autoSubscribe = config.autoSubscribe ?? true;
    this.conflictHandler = config.onConflict;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Load wallet from relays and optionally start subscription.
   */
  override async load(): Promise<void> {
    await super.load();

    if (this.autoSubscribe) {
      await this.subscribe();
    }
  }

  /**
   * Subscribe to real-time updates from relays.
   */
  async subscribe(): Promise<void> {
    if (this._subscription) {
      return; // Already subscribed
    }

    const user = await this.signer.user();

    const filter: NDKFilter = {
      kinds: [TOKEN_KIND as number],
      authors: [user.pubkey],
      since: Math.floor(Date.now() / 1000), // Only new events
    };

    this._subscription = this.ndk.subscribe(filter, { closeOnEose: false });

    this._subscription.on('event', async (event: NDKEvent) => {
      await this.handleRemoteUpdate(event);
    });
  }

  /**
   * Unsubscribe from relay updates.
   */
  unsubscribe(): void {
    if (this._subscription) {
      this._subscription.stop();
      this._subscription = null;
    }
  }

  /**
   * Handle an incoming token event from subscription.
   */
  private async handleRemoteUpdate(event: NDKEvent): Promise<void> {
    // Check if this is an event we created (ignore our own publishes)
    if (this.nip60Adapter.tokenEventIds.includes(event.id)) {
      return;
    }

    // Load the new state from relays
    const remoteProofs = await this.nip60Adapter.load();
    const localProofs = this.proofs;

    // Check for conflict
    if (this.hasConflict(localProofs, remoteProofs)) {
      const resolved = this.resolveConflict(localProofs, remoteProofs);
      
      // Emit conflict event
      for (const handler of this._conflictHandlers) {
        handler(localProofs, remoteProofs);
      }

      // Apply resolved proofs
      await this.setProofs(resolved);
    } else {
      // No conflict, just update local state
      await this.setProofs(remoteProofs);
    }

    // Emit sync event
    for (const handler of this._syncHandlers) {
      handler();
    }
  }

  /**
   * Check if local and remote proofs conflict.
   */
  private hasConflict(local: Proof[], remote: Proof[]): boolean {
    // Simple check: if proof sets differ, we have a potential conflict
    const localSet = new Set(local.map(p => p.C));
    const remoteSet = new Set(remote.map(p => p.C));

    // If remote has proofs we don't, it's a sync not conflict
    // If we have proofs remote doesn't, that's a potential conflict
    for (const c of localSet) {
      if (!remoteSet.has(c)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolve conflict between local and remote proofs.
   */
  private resolveConflict(local: Proof[], remote: Proof[]): Proof[] {
    // If custom handler provided, use it
    if (this.conflictHandler) {
      return this.conflictHandler(local, remote);
    }

    // Default strategy: remote wins (server authority)
    // This is simplest and usually correct - if proofs were spent elsewhere,
    // remote state is authoritative
    return remote;
  }

  /**
   * Set proofs directly (used for sync updates).
   */
  private async setProofs(_proofs: Proof[]): Promise<void> {
    // Access the internal proofs through the parent class
    // We need to update without triggering a save (that would cause a loop)
    // For now, we'll reload from storage
    // TODO: Implement proper state update without save loop
    await super.load();
  }

  // ===========================================================================
  // Spending History (kind:7376)
  // ===========================================================================

  /**
   * Get spending history from relays.
   * 
   * @param limit - Maximum number of records to return
   */
  async getSpendingHistory(limit = 50): Promise<SpendingRecord[]> {
    const user = await this.signer.user();

    const filter: NDKFilter = {
      kinds: [HISTORY_KIND as number],
      authors: [user.pubkey],
      limit,
    };

    const events = await this.ndk.fetchEvents(filter, { closeOnEose: true });
    const records: SpendingRecord[] = [];

    for (const event of events) {
      try {
        const record = await this.parseHistoryEvent(event);
        if (record) {
          records.push(record);
        }
      } catch (error) {
        console.warn(`Failed to parse history event ${event.id}`, error);
      }
    }

    // Sort by timestamp descending (newest first)
    return records.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Record a spending history event.
   */
  async recordSpend(
    direction: 'in' | 'out',
    amount: number,
    options: {
      createdTokenId?: string;
      destroyedTokenIds?: string[];
      redeemedNutzapId?: string;
    } = {}
  ): Promise<void> {
    const user = await this.signer.user();

    // Build encrypted content as array of tuples (per NIP-60 spec)
    // Tuples can be 2-element or 4-element depending on type
    const contentTuples: string[][] = [
      ['direction', direction],
      ['amount', String(amount)],
      ['unit', this.nip60Adapter.proofUnit],
    ];

    if (options.createdTokenId) {
      contentTuples.push(['e', options.createdTokenId, '', 'created']);
    }

    if (options.destroyedTokenIds) {
      for (const id of options.destroyedTokenIds) {
        contentTuples.push(['e', id, '', 'destroyed']);
      }
    }

    if (options.redeemedNutzapId) {
      contentTuples.push(['e', options.redeemedNutzapId, '', 'redeemed']);
    }

    // Create and publish event
    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    const event = new NDKEvent(this.ndk);
    event.kind = HISTORY_KIND;
    
    // Encrypt content
    const plaintext = JSON.stringify(contentTuples);
    event.content = await this.signer.encrypt(user, plaintext);

    // Add unencrypted e tag for redeemed nutzaps (per spec)
    if (options.redeemedNutzapId) {
      event.tags.push(['e', options.redeemedNutzapId, '', 'redeemed']);
    }

    await event.sign(this.signer);
    await event.publish();
  }

  /**
   * Parse a history event into a SpendingRecord.
   */
  private async parseHistoryEvent(event: NDKEvent): Promise<SpendingRecord | null> {
    const user = await this.signer.user();
    
    try {
      const plaintext = await this.signer.decrypt(user, event.content);
      const tuples: [string, string, string?, string?][] = JSON.parse(plaintext);

      const record: SpendingRecord = {
        direction: 'out',
        amount: 0,
        unit: 'sat',
        timestamp: event.created_at ?? Math.floor(Date.now() / 1000),
      };

      for (const tuple of tuples) {
        const [key, value, , marker] = tuple;

        switch (key) {
          case 'direction':
            record.direction = value as 'in' | 'out';
            break;
          case 'amount':
            record.amount = parseInt(value, 10);
            break;
          case 'unit':
            record.unit = value;
            break;
          case 'e':
            if (marker === 'created') {
              record.createdTokenId = value;
            } else if (marker === 'destroyed') {
              record.destroyedTokenIds = record.destroyedTokenIds ?? [];
              record.destroyedTokenIds.push(value);
            } else if (marker === 'redeemed') {
              record.redeemedNutzapId = value;
            }
            break;
        }
      }

      return record;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // P2PK Access
  // ===========================================================================

  /**
   * Get P2PK public key for receiving nutzaps.
   */
  async getP2PKPubkey(): Promise<string> {
    return this.nip60Adapter.getP2PKPubkey();
  }

  /**
   * Get P2PK private key for unlocking nutzaps.
   */
  async getP2PKPrivkey(): Promise<string> {
    return this.nip60Adapter.getP2PKPrivkey();
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Subscribe to sync events.
   */
  onSync(handler: SyncHandler): () => void {
    this._syncHandlers.add(handler);
    return () => this._syncHandlers.delete(handler);
  }

  /**
   * Subscribe to conflict events.
   */
  onConflict(handler: ConflictHandler): () => void {
    this._conflictHandlers.add(handler);
    return () => this._conflictHandlers.delete(handler);
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  /** Get the underlying Nip60Adapter */
  get adapter(): Nip60Adapter {
    return this.nip60Adapter;
  }

  /** Check if currently subscribed to relay updates */
  get isSubscribed(): boolean {
    return this._subscription !== null;
  }
}
