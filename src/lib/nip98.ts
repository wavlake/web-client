/**
 * NIP-98 HTTP Auth
 *
 * Creates NIP-98 authentication events for Authorization header.
 * Used for fetch-based requests where headers can be set.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/98.md
 */

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

interface UnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}

interface SignedEvent extends UnsignedEvent {
  id: string;
  sig: string;
}

/**
 * Serialize a Nostr event for hashing (NIP-01)
 */
function serializeEvent(event: UnsignedEvent): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
}

/**
 * Compute the event ID (SHA256 of serialized event)
 */
function getEventId(event: UnsignedEvent): string {
  const serialized = serializeEvent(event);
  const hash = sha256(utf8ToBytes(serialized));
  return bytesToHex(hash);
}

/**
 * Sign a Nostr event
 */
function signEvent(event: UnsignedEvent, privateKeyHex: string): SignedEvent {
  const id = getEventId(event);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const idBytes = hexToBytes(id);
  const signature = schnorr.sign(idBytes, privateKeyBytes);

  return {
    ...event,
    id,
    sig: bytesToHex(signature),
  };
}

/**
 * Create a NIP-98 authentication event.
 *
 * @param privateKeyHex - The signer's private key in hex format
 * @param url - The URL being accessed
 * @param method - The HTTP method (GET, POST, etc.)
 * @param payload - Optional request body for payload hash
 * @returns Base64-encoded signed event (without "Nostr " prefix)
 */
export async function createNip98AuthEvent(
  privateKeyHex: string,
  url: string,
  method: string,
  payload?: string
): Promise<string> {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  const tags: string[][] = [
    ['u', url],
    ['method', method.toUpperCase()],
  ];

  // Add payload hash if provided (required by NIP-98 spec for POST/PUT)
  if (payload) {
    const payloadHash = sha256(utf8ToBytes(payload));
    tags.push(['payload', bytesToHex(payloadHash)]);
  }

  const unsignedEvent: UnsignedEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
    pubkey: publicKeyHex,
  };

  const signedEvent = signEvent(unsignedEvent, privateKeyHex);

  // Return as base64-encoded JSON (without "Nostr " prefix)
  return btoa(JSON.stringify(signedEvent));
}

/**
 * Create the full Authorization header value for NIP-98.
 *
 * @param privateKeyHex - The signer's private key in hex format
 * @param url - The URL being accessed
 * @param method - The HTTP method
 * @param payload - Optional request body
 * @returns Full header value including "Nostr " prefix
 */
export async function createNip98Header(
  privateKeyHex: string,
  url: string,
  method: string,
  payload?: string
): Promise<string> {
  const token = await createNip98AuthEvent(privateKeyHex, url, method, payload);
  return `Nostr ${token}`;
}
