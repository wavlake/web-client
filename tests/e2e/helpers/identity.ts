/**
 * Identity helpers for E2E tests
 * 
 * URL-based identity signing for spending cap support
 */

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { decodeNsec, getPubkeyFromNsec } from './nostr';

/**
 * Create a schnorr signature of the token hash for URL-based identity
 * 
 * Used with: ?token=...&pubkey=<hex>&sig=<schnorr-sig-of-token-hash>
 * 
 * @param token - The ecash token being submitted
 * @param nsec - Nostr secret key
 * @returns Object with pubkey and signature
 */
export function signTokenForIdentity(token: string, nsec: string): { pubkey: string; sig: string } {
  const privkey = decodeNsec(nsec);
  const pubkey = getPubkeyFromNsec(nsec);
  
  // Hash the token
  const tokenHash = sha256(new TextEncoder().encode(token));
  
  // Sign the hash
  const sig = schnorr.sign(tokenHash, privkey);
  
  return {
    pubkey,
    sig: bytesToHex(sig),
  };
}

/**
 * Create a schnorr signature of a timestamp for identity-only requests (free tier)
 * 
 * Used with: ?pubkey=<hex>&sig=<schnorr-sig-of-timestamp>&t=<timestamp>
 * 
 * @param nsec - Nostr secret key
 * @param timestamp - Unix timestamp (defaults to now)
 * @returns Object with pubkey, signature, and timestamp
 */
export function signTimestampForIdentity(nsec: string, timestamp?: number): { pubkey: string; sig: string; t: number } {
  const privkey = decodeNsec(nsec);
  const pubkey = getPubkeyFromNsec(nsec);
  
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  
  // Hash the timestamp as string
  const timestampHash = sha256(new TextEncoder().encode(String(t)));
  
  // Sign the hash
  const sig = schnorr.sign(timestampHash, privkey);
  
  return {
    pubkey,
    sig: bytesToHex(sig),
    t,
  };
}

/**
 * Build URL params for token + identity
 */
export function buildTokenIdentityParams(token: string, nsec: string): URLSearchParams {
  const { pubkey, sig } = signTokenForIdentity(token, nsec);
  const params = new URLSearchParams();
  params.set('token', token);
  params.set('pubkey', pubkey);
  params.set('sig', sig);
  return params;
}

/**
 * Build URL params for identity-only (free tier after cap)
 */
export function buildIdentityOnlyParams(nsec: string): URLSearchParams {
  const { pubkey, sig, t } = signTimestampForIdentity(nsec);
  const params = new URLSearchParams();
  params.set('pubkey', pubkey);
  params.set('sig', sig);
  params.set('t', String(t));
  return params;
}
