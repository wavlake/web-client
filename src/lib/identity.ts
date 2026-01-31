/**
 * Identity Utilities for Dual-Signature Authentication
 *
 * Provides Schnorr signing for URL-based identity verification.
 * Used when HTTP headers cannot be set (e.g., native <audio> elements).
 *
 * Two signature modes:
 * 1. Token signature: Sign SHA256(token) for paid requests
 * 2. Timestamp signature: Sign SHA256(timestamp) for free/cap-check requests
 *
 * @see docs/PRD/done/audio-handler-improvements/README.md - Phase 6
 */

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';

// ============================================================================
// Types
// ============================================================================

export interface IdentityKeypair {
  /** Private key as hex string (64 chars) */
  privateKeyHex: string;
  /** Public key as hex string (64 chars, x-only) */
  publicKeyHex: string;
  /** Private key as nsec (bech32) */
  nsec: string;
  /** Public key as npub (bech32) */
  npub: string;
}

export interface TokenSignatureParams {
  /** Hex-encoded x-only public key */
  pubkey: string;
  /** Hex-encoded Schnorr signature of SHA256(token) */
  sig: string;
}

export interface TimestampSignatureParams {
  /** Hex-encoded x-only public key */
  pubkey: string;
  /** Hex-encoded Schnorr signature of SHA256(timestamp) */
  sig: string;
  /** Unix timestamp that was signed */
  t: number;
}

// ============================================================================
// Bech32 Encoding/Decoding
// ============================================================================

function decodeNsec(nsec: string): Uint8Array | null {
  try {
    if (!nsec.startsWith('nsec1')) return null;
    const { prefix, words } = bech32.decode(nsec as `nsec1${string}`, 1500);
    if (prefix !== 'nsec') return null;
    return new Uint8Array(bech32.fromWords(words));
  } catch {
    return null;
  }
}

function encodeNsec(privateKeyBytes: Uint8Array): string {
  const words = bech32.toWords(privateKeyBytes);
  return bech32.encode('nsec', words);
}

function encodeNpub(publicKeyHex: string): string {
  const publicKeyBytes = hexToBytes(publicKeyHex);
  const words = bech32.toWords(publicKeyBytes);
  return bech32.encode('npub', words);
}

// ============================================================================
// Keypair Management
// ============================================================================

/**
 * Parse an nsec (bech32 private key) into a full keypair.
 */
export function nsecToKeypair(nsec: string): IdentityKeypair {
  const privateKeyBytes = decodeNsec(nsec);
  if (!privateKeyBytes) {
    throw new Error('Invalid nsec format');
  }

  const privateKeyHex = bytesToHex(privateKeyBytes);
  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  return {
    privateKeyHex,
    publicKeyHex,
    nsec,
    npub: encodeNpub(publicKeyHex),
  };
}

/**
 * Generate a new random keypair for testing.
 */
export function generateKeypair(): IdentityKeypair {
  const privateKeyBytes = schnorr.utils.randomPrivateKey();
  const privateKeyHex = bytesToHex(privateKeyBytes);
  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  return {
    privateKeyHex,
    publicKeyHex,
    nsec: encodeNsec(privateKeyBytes),
    npub: encodeNpub(publicKeyHex),
  };
}

/**
 * Validate that a string is a valid nsec.
 */
export function isValidNsec(nsec: string): boolean {
  return decodeNsec(nsec) !== null;
}

// ============================================================================
// Schnorr Signing
// ============================================================================

/**
 * Sign a token for identity verification (paid requests).
 * Signs SHA256(token) with the private key using BIP-340 Schnorr.
 *
 * @param token - The ecash token string
 * @param privateKeyHex - The signer's private key in hex format
 * @returns TokenSignatureParams with pubkey and sig
 */
export function signToken(token: string, privateKeyHex: string): TokenSignatureParams {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  // Compute SHA256 hash of the token
  const tokenBytes = new TextEncoder().encode(token);
  const tokenHash = sha256(tokenBytes);

  // Sign with Schnorr (BIP-340)
  const signature = schnorr.sign(tokenHash, privateKeyBytes);

  return {
    pubkey: publicKeyHex,
    sig: bytesToHex(signature),
  };
}

/**
 * Sign a timestamp for identity verification (free/cap-check requests).
 * Signs SHA256(timestamp_string) with the private key using BIP-340 Schnorr.
 *
 * @param privateKeyHex - The signer's private key in hex format
 * @param timestamp - Unix timestamp (defaults to current time)
 * @returns TimestampSignatureParams with pubkey, sig, and t
 */
export function signTimestamp(
  privateKeyHex: string,
  timestamp?: number
): TimestampSignatureParams {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  // Compute SHA256 hash of the timestamp string
  const timestampStr = t.toString();
  const timestampBytes = new TextEncoder().encode(timestampStr);
  const timestampHash = sha256(timestampBytes);

  // Sign with Schnorr (BIP-340)
  const signature = schnorr.sign(timestampHash, privateKeyBytes);

  return {
    pubkey: publicKeyHex,
    sig: bytesToHex(signature),
    t,
  };
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build URL query params for token-signed identity (paid requests).
 */
export function buildTokenIdentityParams(
  token: string,
  privateKeyHex: string
): URLSearchParams {
  const { pubkey, sig } = signToken(token, privateKeyHex);
  const params = new URLSearchParams();
  params.set('pubkey', pubkey);
  params.set('sig', sig);
  return params;
}

/**
 * Build URL query params for timestamp-signed identity (free requests).
 */
export function buildTimestampIdentityParams(
  privateKeyHex: string,
  timestamp?: number
): URLSearchParams {
  const { pubkey, sig, t } = signTimestamp(privateKeyHex, timestamp);
  const params = new URLSearchParams();
  params.set('pubkey', pubkey);
  params.set('sig', sig);
  params.set('t', t.toString());
  return params;
}

/**
 * Append identity params to an existing URL.
 */
export function appendIdentityToUrl(
  url: string,
  token: string | null,
  privateKeyHex: string
): string {
  const urlObj = new URL(url, window.location.origin);

  if (token) {
    // Paid request: sign the token
    const { pubkey, sig } = signToken(token, privateKeyHex);
    urlObj.searchParams.set('pubkey', pubkey);
    urlObj.searchParams.set('sig', sig);
  } else {
    // Free request: sign a timestamp
    const { pubkey, sig, t } = signTimestamp(privateKeyHex);
    urlObj.searchParams.set('pubkey', pubkey);
    urlObj.searchParams.set('sig', sig);
    urlObj.searchParams.set('t', t.toString());
  }

  return urlObj.toString();
}
