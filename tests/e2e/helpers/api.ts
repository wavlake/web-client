/**
 * API helpers for E2E tests
 * 
 * Wavlake paywall API interactions
 */

import { config } from '../config';
import { createNip98Auth } from './nostr';

const { apiUrl } = config;

/**
 * Request content with payment
 * 
 * @param dtag - Track d-tag
 * @param token - Cashu token for payment
 * @param options - Additional options
 */
export async function requestContent(
  dtag: string,
  token?: string,
  options?: {
    grantId?: string;
    nip98Nsec?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  data?: {
    url: string;
    grant: { id: string; expires_at: string; stream_type: string };
    change?: string;
    change_amount?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: { required?: number; mint_url?: string };
  };
  // Raw 402 response (staging API format)
  priceCredits?: number;
  mintUrl?: string;
}> {
  const url = `${apiUrl}/api/v1/content/${dtag}`;
  const headers: Record<string, string> = {};
  
  if (token) {
    headers['X-Ecash-Token'] = token;
  }
  
  if (options?.grantId) {
    headers['X-Grant-ID'] = options.grantId;
  }
  
  if (options?.nip98Nsec) {
    headers['Authorization'] = createNip98Auth(url, 'GET', options.nip98Nsec);
  }
  
  const response = await fetch(url, { headers });
  const json = await response.json();
  
  if (response.ok) {
    return { ok: true, status: response.status, data: json.data || json };
  } else if (response.status === 402) {
    // Handle both API formats:
    // New format: { price_credits, mint_url, payment_methods }
    // Standard format: { error: { code, message, details } }
    return { 
      ok: false, 
      status: response.status, 
      error: json.error,
      priceCredits: json.price_credits,
      mintUrl: json.mint_url,
    };
  } else {
    return { ok: false, status: response.status, error: json.error };
  }
}

/**
 * Request audio binary stream
 * 
 * @param dtag - Track d-tag
 * @param token - Cashu token for payment
 * @param options - Additional options
 */
export async function requestAudio(
  dtag: string,
  token?: string,
  options?: {
    nip98Nsec?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  contentType?: string;
  contentLength?: number;
  // Note: changeToken/changeAmount removed - server-side change was removed in Phase 5
  error?: {
    code: string;
    message: string;
    details?: { required?: number; mint_url?: string };
  };
}> {
  const url = `${apiUrl}/api/v1/audio/${dtag}`;
  const headers: Record<string, string> = {};
  
  if (token) {
    headers['X-Ecash-Token'] = token;
  }
  
  if (options?.nip98Nsec) {
    headers['Authorization'] = createNip98Auth(url, 'GET', options.nip98Nsec);
  }
  
  const response = await fetch(url, { headers });
  
  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get('content-type') || undefined,
      contentLength: parseInt(response.headers.get('content-length') || '0'),
      // Note: Server-side change was removed in Phase 5 of Sat-to-USD PRD.
      // Overpayment now becomes artist tip. Clients should prepare exact denominations.
    };
  } else {
    const json = await response.json();
    return { ok: false, status: response.status, error: json.error };
  }
}

/**
 * Get content price
 */
export async function getContentPrice(dtag: string): Promise<number> {
  const result = await requestContent(dtag);
  if (result.status === 402) {
    // Try new format first, then standard format
    return result.priceCredits || result.error?.details?.required || 0;
  }
  return 0; // Free
}

/**
 * Get artist stats (requires NIP-98 auth)
 */
export async function getArtistStats(nsec: string): Promise<{
  ok: boolean;
  status: number;
  data?: {
    balance: { available_credits: number; pending_credits: number };
    streams: { total: number; paid: number; free: number };
    deposits: { total_amount: number; recouped: boolean };
  };
  error?: { code: string; message: string };
}> {
  const url = `${apiUrl}/api/v1/artist/stats`;
  const headers = {
    'Authorization': createNip98Auth(url, 'GET', nsec),
  };
  
  const response = await fetch(url, { headers });
  const json = await response.json();
  
  if (response.ok) {
    return { ok: true, status: response.status, data: json.data };
  } else {
    return { ok: false, status: response.status, error: json.error };
  }
}

/**
 * Get artist earnings (requires NIP-98 auth)
 */
export async function getArtistEarnings(
  nsec: string,
  options?: { startDate?: string; endDate?: string }
): Promise<{
  ok: boolean;
  status: number;
  data?: {
    summary: {
      total_streams: number;
      total_earnings_credits: number;
      total_tips_credits: number;
    };
    by_track: Array<{
      track_id: string;
      title: string;
      streams: number;
      earnings_credits: number;
    }>;
  };
  error?: { code: string; message: string };
}> {
  let url = `${apiUrl}/api/v1/artist/earnings`;
  const params = new URLSearchParams();
  if (options?.startDate) params.set('start_date', options.startDate);
  if (options?.endDate) params.set('end_date', options.endDate);
  if (params.toString()) url += `?${params}`;
  
  const headers = {
    'Authorization': createNip98Auth(url, 'GET', nsec),
  };
  
  const response = await fetch(url, { headers });
  const json = await response.json();
  
  if (response.ok) {
    return { ok: true, status: response.status, data: json.data };
  } else {
    return { ok: false, status: response.status, error: json.error };
  }
}

/**
 * Get artist's recent streams (requires NIP-98 auth)
 */
export async function getArtistStreams(
  nsec: string,
  limit = 20
): Promise<{
  ok: boolean;
  status: number;
  data?: {
    streams: Array<{
      id: string;
      track_id: string;
      stream_type: string;
      amount_credits: number;
      created_at: string;
    }>;
  };
  error?: { code: string; message: string };
}> {
  const url = `${apiUrl}/api/v1/artist/streams?limit=${limit}`;
  const headers = {
    'Authorization': createNip98Auth(url, 'GET', nsec),
  };
  
  const response = await fetch(url, { headers });
  const json = await response.json();
  
  if (response.ok) {
    return { ok: true, status: response.status, data: json.data };
  } else {
    return { ok: false, status: response.status, error: json.error };
  }
}

// ============================================================================
// Phase 5: URL Token Parameter & Change Recovery
// ============================================================================

/**
 * Request audio with URL token parameter (Phase 5)
 * 
 * Uses ?token= query parameter instead of X-Ecash-Token header.
 * This enables native HTML audio element usage:
 *   <audio src="/v1/audio/track?token=cashuB...">
 * 
 * @param dtag - Track d-tag
 * @param token - Cashu token for payment (sent via URL)
 * @param options - Additional options including payment-id for change recovery
 */
export async function requestAudioWithUrlToken(
  dtag: string,
  token?: string,
  options?: {
    paymentId?: string;
    nip98Nsec?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  contentType?: string;
  contentLength?: number;
  // Change is stored for retrieval via /v1/change/{payment-id} when using URL tokens
  error?: {
    code: string;
    message: string;
    details?: { required?: number; provided?: number; mint_url?: string };
  };
}> {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (options?.paymentId) params.set('payment-id', options.paymentId);
  
  const url = `${apiUrl}/api/v1/audio/${dtag}?${params}`;
  const headers: Record<string, string> = {};
  
  if (options?.nip98Nsec) {
    // For URL-based auth, the signed URL should NOT include the auth param
    const signedUrl = `${apiUrl}/api/v1/audio/${dtag}`;
    headers['Authorization'] = createNip98Auth(signedUrl, 'GET', options.nip98Nsec);
  }
  
  const response = await fetch(url, { headers });
  
  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get('content-type') || undefined,
      contentLength: parseInt(response.headers.get('content-length') || '0'),
    };
  } else {
    const json = await response.json();
    return { ok: false, status: response.status, error: json.error };
  }
}

/**
 * Claim change from a URL-based audio payment (Phase 5)
 * 
 * After making a payment with ?payment-id=, call this endpoint
 * to retrieve any change tokens.
 * 
 * @param paymentId - The payment ID used in the audio request
 */
export async function claimChange(paymentId: string): Promise<{
  ok: boolean;
  status: number;
  data?: {
    payment_id: string;
    change_token: string | null;
    change_amount: number | null;
  };
  error?: { code: string; message: string };
}> {
  const url = `${apiUrl}/api/v1/change/${paymentId}`;
  
  const response = await fetch(url);
  const text = await response.text();
  
  // Handle non-JSON responses (e.g., plain "404 page not found")
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { 
      ok: false, 
      status: response.status, 
      error: { code: 'INVALID_RESPONSE', message: text || 'Non-JSON response' }
    };
  }
  
  if (response.ok) {
    return { ok: true, status: response.status, data: json };
  } else {
    return { ok: false, status: response.status, error: json.error || { code: 'UNKNOWN', message: 'Unknown error' } };
  }
}

/**
 * Generate a unique payment ID for change recovery
 */
export function generatePaymentId(): string {
  return crypto.randomUUID();
}
