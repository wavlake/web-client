/**
 * @wavlake/nostr-wallet Types
 * 
 * NIP-60/61 type definitions.
 */

import type { Proof } from '@cashu/cashu-ts';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKSigner } from '@nostr-dev-kit/ndk';

// ============================================================================
// Event Kinds
// ============================================================================

export const WALLET_KIND = 17375;
export const TOKEN_KIND = 7375;
export const HISTORY_KIND = 7376;
export const QUOTE_KIND = 7374;
export const NUTZAP_INFO_KIND = 10019;
export const NUTZAP_KIND = 9321;

// ============================================================================
// NIP-60 Wallet Types
// ============================================================================

/**
 * Configuration for Nip60Adapter
 */
export interface Nip60AdapterConfig {
  /** NDK instance for relay connections */
  ndk: NDK;
  /** Signer for encrypting/decrypting events */
  signer: NDKSigner;
  /** Mint URL this wallet uses */
  mintUrl: string;
  /** Unit for proofs (default: 'sat') */
  unit?: string;
  /** Override relay list (defaults to user's NIP-65) */
  relays?: string[];
}

/**
 * Encrypted wallet event content (kind:17375)
 */
export interface WalletEventContent {
  /** P2PK private key for receiving nutzaps */
  privkey: string;
  /** List of mints this wallet uses */
  mints: string[];
}

/**
 * Encrypted token event content (kind:7375)
 */
export interface TokenEventContent {
  /** Mint URL */
  mint: string;
  /** Unit (sat, usd, etc.) */
  unit: string;
  /** Unspent proofs */
  proofs: Proof[];
  /** Token event IDs that were destroyed to create this one */
  del?: string[];
}

/**
 * Spending history record (kind:7376)
 */
export interface SpendingRecord {
  /** Direction: in = received, out = sent */
  direction: 'in' | 'out';
  /** Amount */
  amount: number;
  /** Unit */
  unit: string;
  /** Created token event ID */
  createdTokenId?: string;
  /** Destroyed token event IDs */
  destroyedTokenIds?: string[];
  /** Redeemed nutzap event ID */
  redeemedNutzapId?: string;
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// NIP-61 Nutzap Types
// ============================================================================

/**
 * Nutzap info event content (kind:10019)
 */
export interface NutzapInfoContent {
  /** Relays to send nutzaps to */
  relays: string[];
  /** Mints user accepts nutzaps from */
  mints: NutzapMint[];
  /** P2PK pubkey for locking nutzaps */
  p2pkPubkey: string;
}

/**
 * Mint configuration for nutzap receiving
 */
export interface NutzapMint {
  /** Mint URL */
  url: string;
  /** Supported units */
  units: string[];
}

/**
 * Nutzap event data (kind:9321)
 */
export interface Nutzap {
  /** Event ID */
  id: string;
  /** Sender pubkey */
  sender: string;
  /** P2PK-locked proofs */
  proofs: Proof[];
  /** Mint URL */
  mint: string;
  /** Unit */
  unit: string;
  /** Amount (sum of proofs) */
  amount: number;
  /** Optional comment */
  comment?: string;
  /** Event being zapped (if any) */
  zappedEventId?: string;
  /** Timestamp */
  timestamp: number;
  /** Raw NDK event */
  event: NDKEvent;
}

/**
 * Options for sending a nutzap
 */
export interface SendNutzapOptions {
  /** Recipient's Nostr pubkey */
  recipientPubkey: string;
  /** Amount to send */
  amount: number;
  /** Optional comment */
  comment?: string;
  /** Event being zapped (optional) */
  eventId?: string;
  /** Preferred mint (must be in recipient's accepted list) */
  mint?: string;
}

// ============================================================================
// Crypto Types
// ============================================================================

/**
 * P2PK lock data
 */
export interface P2PKLock {
  /** Nonce for the lock */
  nonce: string;
  /** Public key to lock to (hex, no prefix) */
  data: string;
}

/**
 * DLEQ proof for verification
 */
export interface DLEQProof {
  e: string;
  s: string;
  r?: string;
}

// ============================================================================
// Event Handlers
// ============================================================================

export type SyncHandler = () => void;
export type ConflictHandler = (local: Proof[], remote: Proof[]) => Proof[];
export type NutzapHandler = (nutzap: Nutzap) => void | Promise<void>;
