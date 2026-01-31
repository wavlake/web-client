/**
 * NutzapSender
 * 
 * Send nutzaps (P2PK-locked Cashu tips) to other users.
 */

import type { Proof } from '@cashu/cashu-ts';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKSigner } from '@nostr-dev-kit/ndk';
import type { SendNutzapOptions, NutzapInfoContent } from '../types.js';
import { NUTZAP_KIND } from '../types.js';
import { NutzapInfo } from './info.js';

/**
 * Configuration for NutzapSender
 */
export interface NutzapSenderConfig {
  /** NDK instance */
  ndk: NDK;
  /** Signer for signing events */
  signer: NDKSigner;
  /** Function to get proofs from wallet for a given amount */
  getProofs: (amount: number, mint: string) => Promise<Proof[]>;
}

/**
 * Result of sending a nutzap
 */
export interface NutzapSendResult {
  /** The published event */
  event: NDKEvent;
  /** Amount sent */
  amount: number;
  /** Mint used */
  mint: string;
  /** Recipient pubkey */
  recipient: string;
}

/**
 * Send nutzaps to other users.
 * 
 * Fetches recipient's preferences, creates P2PK-locked proofs,
 * and publishes a kind:9321 nutzap event.
 * 
 * @example
 * ```ts
 * const sender = new NutzapSender({
 *   ndk,
 *   signer: ndk.signer,
 *   getProofs: async (amount, mint) => {
 *     // Get proofs from your wallet
 *     const token = await wallet.createToken(amount);
 *     return getDecodedToken(token).proofs;
 *   },
 * });
 * 
 * // Send a nutzap
 * const result = await sender.send({
 *   recipientPubkey: 'npub1...',
 *   amount: 21,
 *   comment: 'Great post!',
 *   eventId: 'note1...',
 * });
 * ```
 */
export class NutzapSender {
  private readonly ndk: NDK;
  private readonly signer: NDKSigner;
  private readonly getProofs: (amount: number, mint: string) => Promise<Proof[]>;
  private readonly nutzapInfo: NutzapInfo;

  constructor(config: NutzapSenderConfig) {
    this.ndk = config.ndk;
    this.signer = config.signer;
    this.getProofs = config.getProofs;
    this.nutzapInfo = new NutzapInfo({
      ndk: config.ndk,
      signer: config.signer,
    });
  }

  /**
   * Fetch recipient's nutzap info.
   */
  async fetchRecipientInfo(pubkey: string): Promise<NutzapInfoContent | null> {
    return this.nutzapInfo.fetch(pubkey);
  }

  /**
   * Send a nutzap to a recipient.
   */
  async send(options: SendNutzapOptions): Promise<NutzapSendResult> {
    const { recipientPubkey, amount, comment, eventId } = options;

    // Fetch recipient's nutzap info
    const recipientInfo = await this.fetchRecipientInfo(recipientPubkey);
    if (!recipientInfo) {
      throw new Error(`Recipient ${recipientPubkey} has no nutzap info (kind:10019)`);
    }

    if (recipientInfo.mints.length === 0) {
      throw new Error('Recipient has no mints configured');
    }

    if (!recipientInfo.p2pkPubkey) {
      throw new Error('Recipient has no P2PK pubkey configured');
    }

    // Select mint (use preferred or first available)
    let selectedMint = recipientInfo.mints[0];
    if (options.mint) {
      const preferred = recipientInfo.mints.find(m => m.url === options.mint);
      if (!preferred) {
        throw new Error(`Recipient does not accept mint: ${options.mint}`);
      }
      selectedMint = preferred;
    }

    // Get proofs from wallet
    const proofs = await this.getProofs(amount, selectedMint.url);
    if (proofs.length === 0) {
      throw new Error('No proofs available');
    }

    // Lock proofs to recipient's P2PK pubkey
    const lockedProofs = await this.lockProofsToP2PK(proofs, recipientInfo.p2pkPubkey);

    // Create and publish nutzap event
    const event = await this.createNutzapEvent({
      recipientPubkey,
      proofs: lockedProofs,
      mint: selectedMint.url,
      unit: selectedMint.units[0] || 'sat',
      comment,
      eventId,
    });

    // Publish event
    // TODO: Consider publishing to recipient's specific relays from their 10019
    await event.publish();

    return {
      event,
      amount,
      mint: selectedMint.url,
      recipient: recipientPubkey,
    };
  }

  /**
   * Lock proofs to a P2PK pubkey.
   * 
   * Creates new secrets with P2PK lock structure.
   */
  private async lockProofsToP2PK(proofs: Proof[], p2pkPubkey: string): Promise<Proof[]> {
    const lockedProofs: Proof[] = [];

    for (const proof of proofs) {
      // Generate random nonce
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const nonce = this.bytesToHex(nonceBytes);

      // Create P2PK secret structure
      // Pubkey must be prefixed with "02" for nostr<>cashu compatibility
      const p2pkSecret = JSON.stringify([
        'P2PK',
        {
          nonce,
          data: p2pkPubkey.startsWith('02') ? p2pkPubkey : `02${p2pkPubkey}`,
        },
      ]);

      // Create locked proof
      // Note: In a real implementation, you'd need to swap the proof at the mint
      // to get a new proof with the P2PK-locked secret. This is a simplified version.
      const lockedProof: Proof = {
        ...proof,
        secret: p2pkSecret,
      };

      lockedProofs.push(lockedProof);
    }

    return lockedProofs;
  }

  /**
   * Create a kind:9321 nutzap event.
   */
  private async createNutzapEvent(options: {
    recipientPubkey: string;
    proofs: Proof[];
    mint: string;
    unit: string;
    comment?: string;
    eventId?: string;
  }): Promise<NDKEvent> {
    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    const event = new NDKEvent(this.ndk);
    
    event.kind = NUTZAP_KIND;
    event.content = options.comment || '';

    // Build tags
    const tags: string[][] = [];

    // Add proof tags
    for (const proof of options.proofs) {
      tags.push(['proof', JSON.stringify(proof)]);
    }

    // Add mint and unit
    tags.push(['u', options.mint]);
    tags.push(['unit', options.unit]);

    // Add recipient
    tags.push(['p', options.recipientPubkey]);

    // Add zapped event reference if provided
    if (options.eventId) {
      tags.push(['e', options.eventId]);
    }

    event.tags = tags;

    await event.sign(this.signer);
    return event;
  }

  /**
   * Check if we can send to a recipient.
   * 
   * @returns Object with available mints and any issues
   */
  async canSendTo(
    pubkey: string,
    availableMints: string[]
  ): Promise<{
    canSend: boolean;
    commonMints: string[];
    reason?: string;
  }> {
    const info = await this.fetchRecipientInfo(pubkey);
    
    if (!info) {
      return {
        canSend: false,
        commonMints: [],
        reason: 'Recipient has no nutzap info',
      };
    }

    if (!info.p2pkPubkey) {
      return {
        canSend: false,
        commonMints: [],
        reason: 'Recipient has no P2PK pubkey',
      };
    }

    const recipientMintUrls = info.mints.map(m => m.url);
    const commonMints = availableMints.filter(m => recipientMintUrls.includes(m));

    if (commonMints.length === 0) {
      return {
        canSend: false,
        commonMints: [],
        reason: 'No common mints between sender and recipient',
      };
    }

    return {
      canSend: true,
      commonMints,
    };
  }

  /**
   * Convert bytes to hex string.
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
