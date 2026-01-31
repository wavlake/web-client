/**
 * NutzapInfo
 * 
 * Manage user's nutzap receiving preferences (kind:10019).
 */

import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKSigner, NDKFilter, NDKUser } from '@nostr-dev-kit/ndk';
import type { NutzapInfoContent, NutzapMint } from '../types.js';
import { NUTZAP_INFO_KIND } from '../types.js';

/**
 * Configuration for NutzapInfo
 */
export interface NutzapInfoConfig {
  ndk: NDK;
  signer: NDKSigner;
}

/**
 * Options for publishing nutzap info
 */
export interface PublishInfoOptions {
  /** Relays to receive nutzaps on */
  relays: string[];
  /** Mints to accept nutzaps from */
  mints: NutzapMint[];
  /** P2PK pubkey for locking nutzaps (hex, no prefix) */
  p2pkPubkey: string;
}

/**
 * Manage nutzap receiving info (kind:10019).
 * 
 * This event tells others how to send you nutzaps:
 * - Which relays to publish nutzap events to
 * - Which mints you accept
 * - Your P2PK public key for locking proofs
 * 
 * @example
 * ```ts
 * const info = new NutzapInfo({ ndk, signer });
 * 
 * // Publish your nutzap preferences
 * await info.publish({
 *   relays: ['wss://relay.wavlake.com'],
 *   mints: [{ url: 'https://mint.wavlake.com', units: ['usd'] }],
 *   p2pkPubkey: await wallet.getP2PKPubkey(),
 * });
 * 
 * // Fetch someone's nutzap info
 * const theirInfo = await info.fetch(pubkey);
 * ```
 */
export class NutzapInfo {
  private readonly ndk: NDK;
  private readonly signer: NDKSigner;
  private _user: NDKUser | null = null;

  constructor(config: NutzapInfoConfig) {
    this.ndk = config.ndk;
    this.signer = config.signer;
  }

  /**
   * Publish or update nutzap receiving info.
   */
  async publish(options: PublishInfoOptions): Promise<NDKEvent> {
    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    const event = new NDKEvent(this.ndk);
    event.kind = NUTZAP_INFO_KIND;
    event.content = '';

    // Build tags
    const tags: string[][] = [];

    // Relay tags
    for (const relay of options.relays) {
      tags.push(['relay', relay]);
    }

    // Mint tags with units
    for (const mint of options.mints) {
      tags.push(['mint', mint.url, ...mint.units]);
    }

    // P2PK pubkey tag
    tags.push(['pubkey', options.p2pkPubkey]);

    event.tags = tags;

    await event.sign(this.signer);
    await event.publish();

    return event;
  }

  /**
   * Fetch nutzap info for a pubkey.
   */
  async fetch(pubkey: string): Promise<NutzapInfoContent | null> {
    const filter: NDKFilter = {
      kinds: [NUTZAP_INFO_KIND as number],
      authors: [pubkey],
      limit: 1,
    };

    const events = await this.ndk.fetchEvents(filter, { closeOnEose: true });
    const event = [...events][0];

    if (!event) {
      return null;
    }

    return this.parseInfoEvent(event);
  }

  /**
   * Fetch own nutzap info.
   */
  async fetchOwn(): Promise<NutzapInfoContent | null> {
    const user = await this.getUser();
    return this.fetch(user.pubkey);
  }

  /**
   * Parse a kind:10019 event into NutzapInfoContent.
   */
  parseInfoEvent(event: NDKEvent): NutzapInfoContent {
    const relays: string[] = [];
    const mints: NutzapMint[] = [];
    let p2pkPubkey = '';

    for (const tag of event.tags) {
      const [name, ...values] = tag;

      switch (name) {
        case 'relay':
          if (values[0]) {
            relays.push(values[0]);
          }
          break;

        case 'mint':
          if (values[0]) {
            mints.push({
              url: values[0],
              units: values.slice(1),
            });
          }
          break;

        case 'pubkey':
          if (values[0]) {
            p2pkPubkey = values[0];
          }
          break;
      }
    }

    return { relays, mints, p2pkPubkey };
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
}
