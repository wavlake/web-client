/**
 * Nostr helpers for E2E tests
 * 
 * NIP-98 auth, key management, event signing
 */

import { nip19, getPublicKey, finalizeEvent, type UnsignedEvent } from 'nostr-tools';

/**
 * Decode nsec to hex private key
 */
export function decodeNsec(nsec: string): string {
  const { type, data } = nip19.decode(nsec);
  if (type !== 'nsec') {
    throw new Error(`Expected nsec, got ${type}`);
  }
  return data as string;
}

/**
 * Get hex public key from nsec
 */
export function getPubkeyFromNsec(nsec: string): string {
  const privkey = decodeNsec(nsec);
  return getPublicKey(Buffer.from(privkey, 'hex'));
}

/**
 * Get npub from nsec
 */
export function getNpubFromNsec(nsec: string): string {
  const pubkey = getPubkeyFromNsec(nsec);
  return nip19.npubEncode(pubkey);
}

/**
 * Create a NIP-98 authorization header
 * 
 * @param url - Full URL including query params
 * @param method - HTTP method (GET, POST, etc.)
 * @param nsec - Nostr secret key
 * @returns Authorization header value: "Nostr <base64-event>"
 */
export function createNip98Auth(url: string, method: string, nsec: string): string {
  const privkey = decodeNsec(nsec);
  const pubkey = getPublicKey(Buffer.from(privkey, 'hex'));
  
  const unsignedEvent: UnsignedEvent = {
    kind: 27235,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method.toUpperCase()],
    ],
    content: '',
  };
  
  const signedEvent = finalizeEvent(unsignedEvent, Buffer.from(privkey, 'hex'));
  const eventJson = JSON.stringify(signedEvent);
  const base64Event = Buffer.from(eventJson).toString('base64');
  
  return `Nostr ${base64Event}`;
}

/**
 * Make an authenticated API request with NIP-98
 */
export async function fetchWithNip98(
  url: string,
  options: RequestInit & { nsec: string }
): Promise<Response> {
  const { nsec, ...fetchOptions } = options;
  const method = fetchOptions.method || 'GET';
  
  const authHeader = createNip98Auth(url, method, nsec);
  
  return fetch(url, {
    ...fetchOptions,
    headers: {
      ...fetchOptions.headers,
      'Authorization': authHeader,
    },
  });
}
