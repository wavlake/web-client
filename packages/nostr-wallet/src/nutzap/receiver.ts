/**
 * NutzapReceiver
 * 
 * Subscribe to and redeem incoming nutzaps (kind:9321).
 */

import type { Proof } from '@cashu/cashu-ts';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKSigner, NDKFilter, NDKSubscription, NDKUser } from '@nostr-dev-kit/ndk';
import type { Nutzap, NutzapHandler } from '../types.js';
import { NUTZAP_KIND, HISTORY_KIND } from '../types.js';

/**
 * Configuration for NutzapReceiver
 */
export interface NutzapReceiverConfig {
  /** NDK instance */
  ndk: NDK;
  /** Signer for decryption and signing */
  signer: NDKSigner;
  /** P2PK private key for unlocking nutzaps (hex) */
  p2pkPrivkey: string;
  /** Mints to accept nutzaps from */
  mints: string[];
  /** Callback to add proofs to wallet */
  onReceive?: (proofs: Proof[], mint: string) => Promise<void>;
}

/**
 * Receive and redeem nutzaps.
 * 
 * Subscribes to kind:9321 events, unlocks P2PK proofs, and
 * optionally adds them to a wallet.
 * 
 * @example
 * ```ts
 * const receiver = new NutzapReceiver({
 *   ndk,
 *   signer: ndk.signer,
 *   p2pkPrivkey: await wallet.getP2PKPrivkey(),
 *   mints: ['https://mint.wavlake.com'],
 *   onReceive: async (proofs, mint) => {
 *     // Add to wallet or handle manually
 *   },
 * });
 * 
 * receiver.on('nutzap', (zap) => {
 *   console.log(`Received ${zap.amount} from ${zap.sender}`);
 * });
 * 
 * await receiver.subscribe();
 * ```
 */
export class NutzapReceiver {
  private readonly ndk: NDK;
  private readonly signer: NDKSigner;
  private readonly p2pkPrivkey: string;
  private readonly mints: Set<string>;
  private readonly onReceiveCallback?: (proofs: Proof[], mint: string) => Promise<void>;
  
  private _subscription: NDKSubscription | null = null;
  private _handlers: Set<NutzapHandler> = new Set();
  private _user: NDKUser | null = null;
  
  /** Track redeemed nutzap IDs to avoid double-processing */
  private _redeemedIds: Set<string> = new Set();

  constructor(config: NutzapReceiverConfig) {
    this.ndk = config.ndk;
    this.signer = config.signer;
    this.p2pkPrivkey = config.p2pkPrivkey;
    this.mints = new Set(config.mints);
    this.onReceiveCallback = config.onReceive;
  }

  /**
   * Subscribe to incoming nutzaps.
   */
  async subscribe(): Promise<void> {
    if (this._subscription) {
      return;
    }

    const user = await this.getUser();

    // Filter for nutzaps to us, from our accepted mints
    const filter: NDKFilter = {
      kinds: [NUTZAP_KIND as number],
      '#p': [user.pubkey],
      '#u': [...this.mints],
    };

    this._subscription = this.ndk.subscribe(filter, { closeOnEose: false });

    this._subscription.on('event', async (event: NDKEvent) => {
      await this.handleNutzap(event);
    });
  }

  /**
   * Stop subscription.
   */
  unsubscribe(): void {
    if (this._subscription) {
      this._subscription.stop();
      this._subscription = null;
    }
  }

  /**
   * Fetch pending (unredeemed) nutzaps.
   */
  async fetchPending(): Promise<Nutzap[]> {
    const user = await this.getUser();

    // Get the latest redemption timestamp
    const sinceTimestamp = await this.getLatestRedemptionTimestamp();

    const filter: NDKFilter = {
      kinds: [NUTZAP_KIND as number],
      '#p': [user.pubkey],
      '#u': [...this.mints],
      ...(sinceTimestamp ? { since: sinceTimestamp } : {}),
    };

    const events = await this.ndk.fetchEvents(filter, { closeOnEose: true });
    const nutzaps: Nutzap[] = [];

    for (const event of events) {
      try {
        const nutzap = this.parseNutzapEvent(event);
        if (nutzap && !this._redeemedIds.has(nutzap.id)) {
          nutzaps.push(nutzap);
        }
      } catch (error) {
        console.warn(`Failed to parse nutzap event ${event.id}`, error);
      }
    }

    return nutzaps;
  }

  /**
   * Redeem a nutzap by unlocking its P2PK proofs.
   * 
   * @returns The amount received
   */
  async redeem(nutzap: Nutzap): Promise<number> {
    if (this._redeemedIds.has(nutzap.id)) {
      throw new Error('Nutzap already redeemed');
    }

    // Unlock the P2PK proofs
    const unlockedProofs = await this.unlockProofs(nutzap.proofs);

    // Call the receive callback if provided
    if (this.onReceiveCallback) {
      await this.onReceiveCallback(unlockedProofs, nutzap.mint);
    }

    // Record the redemption
    await this.recordRedemption(nutzap, unlockedProofs);

    // Mark as redeemed
    this._redeemedIds.add(nutzap.id);

    return nutzap.amount;
  }

  /**
   * Register a handler for incoming nutzaps.
   */
  on(_event: 'nutzap', handler: NutzapHandler): () => void {
    this._handlers.add(handler);
    return () => this._handlers.delete(handler);
  }

  /**
   * Handle an incoming nutzap event.
   */
  private async handleNutzap(event: NDKEvent): Promise<void> {
    try {
      const nutzap = this.parseNutzapEvent(event);
      if (!nutzap) {
        return;
      }

      // Skip if already redeemed
      if (this._redeemedIds.has(nutzap.id)) {
        return;
      }

      // Emit to handlers
      for (const handler of this._handlers) {
        try {
          await handler(nutzap);
        } catch (error) {
          console.warn('Nutzap handler error:', error);
        }
      }
    } catch (error) {
      console.warn(`Failed to handle nutzap event ${event.id}`, error);
    }
  }

  /**
   * Parse a kind:9321 event into a Nutzap.
   */
  private parseNutzapEvent(event: NDKEvent): Nutzap | null {
    const proofs: Proof[] = [];
    let mint = '';
    let unit = 'sat';
    let zappedEventId: string | undefined;

    for (const tag of event.tags) {
      const [name, ...values] = tag;

      switch (name) {
        case 'proof':
          if (values[0]) {
            try {
              const proof = JSON.parse(values[0]) as Proof;
              proofs.push(proof);
            } catch {
              console.warn('Invalid proof in nutzap:', values[0]);
            }
          }
          break;

        case 'u':
          mint = values[0] || '';
          break;

        case 'unit':
          unit = values[0] || 'sat';
          break;

        case 'e':
          zappedEventId = values[0];
          break;
      }
    }

    if (proofs.length === 0 || !mint) {
      return null;
    }

    // Verify mint is in our accepted list
    if (!this.mints.has(mint)) {
      return null;
    }

    const amount = proofs.reduce((sum, p) => sum + p.amount, 0);

    return {
      id: event.id,
      sender: event.pubkey,
      proofs,
      mint,
      unit,
      amount,
      comment: event.content || undefined,
      zappedEventId,
      timestamp: event.created_at ?? Math.floor(Date.now() / 1000),
      event,
    };
  }

  /**
   * Unlock P2PK-locked proofs using our private key.
   */
  private async unlockProofs(proofs: Proof[]): Promise<Proof[]> {
    // Import secp256k1 for signing
    const { sign } = await import('@noble/secp256k1');
    
    const unlockedProofs: Proof[] = [];

    for (const proof of proofs) {
      try {
        // Parse the P2PK secret
        const secret = JSON.parse(proof.secret);
        if (!Array.isArray(secret) || secret[0] !== 'P2PK') {
          // Not a P2PK proof, pass through
          unlockedProofs.push(proof);
          continue;
        }

        // P2PK data contains nonce and locked pubkey - we sign with our privkey
        // const p2pkData = secret[1] as { nonce: string; data: string };
        
        // Create signature over the proof's C value (the blinded message)
        const messageHash = await this.sha256(proof.C);
        const signatureObj = await sign(messageHash, this.hexToBytes(this.p2pkPrivkey));
        const signatureBytes = signatureObj.toCompactRawBytes();
        
        // Create unlocked proof with witness
        const unlockedProof: Proof & { witness?: string } = {
          ...proof,
          witness: JSON.stringify({
            signatures: [this.bytesToHex(signatureBytes)],
          }),
        };

        unlockedProofs.push(unlockedProof);
      } catch (error) {
        console.warn('Failed to unlock proof:', error);
        // Include the original proof anyway - mint will reject if invalid
        unlockedProofs.push(proof);
      }
    }

    return unlockedProofs;
  }

  /**
   * Record nutzap redemption (kind:7376).
   */
  private async recordRedemption(nutzap: Nutzap, _proofs: Proof[]): Promise<void> {
    const user = await this.getUser();
    
    // Build encrypted content
    const contentTuples: string[][] = [
      ['direction', 'in'],
      ['amount', String(nutzap.amount)],
      ['unit', nutzap.unit],
    ];

    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    const event = new NDKEvent(this.ndk);
    event.kind = HISTORY_KIND;
    
    // Encrypt content
    const plaintext = JSON.stringify(contentTuples);
    event.content = await this.signer.encrypt(user, plaintext);

    // Add unencrypted tags per NIP-61 spec
    event.tags = [
      ['e', nutzap.id, '', 'redeemed'],
      ['p', nutzap.sender],
    ];

    await event.sign(this.signer);
    await event.publish();
  }

  /**
   * Get the timestamp of the latest redemption event.
   */
  private async getLatestRedemptionTimestamp(): Promise<number | undefined> {
    const user = await this.getUser();

    const filter: NDKFilter = {
      kinds: [HISTORY_KIND as number],
      authors: [user.pubkey],
      limit: 1,
    };

    const events = await this.ndk.fetchEvents(filter, { closeOnEose: true });
    const latest = [...events][0];

    return latest?.created_at;
  }

  /**
   * Get the current user.
   */
  private async getUser(): Promise<NDKUser> {
    if (this._user) {
      return this._user;
    }
    this._user = await this.signer.user();
    return this._user;
  }

  /**
   * SHA256 hash.
   */
  private async sha256(data: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Convert hex string to bytes.
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Convert bytes to hex string.
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Check if currently subscribed.
   */
  get isSubscribed(): boolean {
    return this._subscription !== null;
  }

  /**
   * Get accepted mint URLs.
   */
  get acceptedMints(): string[] {
    return [...this.mints];
  }
}
