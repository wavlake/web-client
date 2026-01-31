/**
 * Content Access Hook
 * 
 * Handles the paywall flow with multiple modes:
 * 
 * 1. SINGLE-REQUEST (fastest, ~124ms)
 *    - Uses pre-built token from cache
 *    - 1 HTTP call: GET with X-Ecash-Token header
 *    - Requires: tokens pre-built via tokenCache store
 * 
 * 2. STANDARD (fallback, ~400-700ms)
 *    - Discovery request (402) → payment with proofs
 *    - Multiple HTTP calls
 *    - Used when no pre-built tokens available
 * 
 * Identity Modes (for spending cap tracking):
 * - none: Anonymous requests
 * - nip98: NIP-98 Authorization header
 * - urlTokenSig: URL param with Schnorr signature of token hash
 * - urlTimestampSig: URL param with Schnorr signature of timestamp
 */

import { useState, useCallback } from 'react';
import { getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { CONFIG } from '../lib/config';
import { debugLog } from '../stores/debug';
import { useWalletStore } from '../stores/wallet';
import { useTokenCacheStore } from '../stores/tokenCache';
import { useSettingsStore } from '../stores/settings';
import { signToken, signTimestamp, nsecToKeypair } from '../lib/identity';
import { createNip98AuthEvent } from '../lib/nip98';
import type { Track } from '../types/nostr';

interface ContentAccessSuccess {
  success: true;
  url: string;
  streamType?: string;
}

interface ContentAccessPaymentRequired {
  success: false;
  requiresPayment: true;
  priceCredits: number;
  mintUrl: string;
}

interface ContentAccessError {
  success: false;
  requiresPayment: false;
  error: string;
}

type ContentAccessResult = ContentAccessSuccess | ContentAccessPaymentRequired | ContentAccessError;

/**
 * Build URL with identity params for URL-based auth modes.
 */
function buildIdentityUrl(baseUrl: string, token: string | null): string {
  const { identityMode, nsec } = useSettingsStore.getState();

  if (identityMode === 'none' || identityMode === 'nip98' || !nsec) {
    return baseUrl;
  }

  try {
    const keypair = nsecToKeypair(nsec);
    const url = new URL(baseUrl);

    if (identityMode === 'urlTokenSig' && token) {
      const { pubkey, sig } = signToken(token, keypair.privateKeyHex);
      url.searchParams.set('pubkey', pubkey);
      url.searchParams.set('sig', sig);
      debugLog('event', `Added token signature identity: ${pubkey.slice(0, 8)}...`);
    } else if (identityMode === 'urlTimestampSig') {
      const { pubkey, sig, t } = signTimestamp(keypair.privateKeyHex);
      url.searchParams.set('pubkey', pubkey);
      url.searchParams.set('sig', sig);
      url.searchParams.set('t', t.toString());
      debugLog('event', `Added timestamp signature identity: ${pubkey.slice(0, 8)}...`);
    }

    return url.toString();
  } catch (err) {
    debugLog('error', `Failed to build identity URL: ${err}`);
    return baseUrl;
  }
}

/**
 * Build headers with identity for NIP-98 auth mode.
 */
async function buildIdentityHeaders(
  baseHeaders: Record<string, string>,
  url: string,
  method: string
): Promise<Record<string, string>> {
  const { identityMode, nsec } = useSettingsStore.getState();

  if (identityMode !== 'nip98' || !nsec) {
    return baseHeaders;
  }

  try {
    const keypair = nsecToKeypair(nsec);
    const nip98Token = await createNip98AuthEvent(keypair.privateKeyHex, url, method);
    debugLog('event', `Added NIP-98 header: ${keypair.publicKeyHex.slice(0, 8)}...`);
    return {
      ...baseHeaders,
      Authorization: `Nostr ${nip98Token}`,
    };
  } catch (err) {
    debugLog('error', `Failed to create NIP-98 header: ${err}`);
    return baseHeaders;
  }
}

export function useContentAccess() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ContentAccessResult | null>(null);

  const checkAccess = useCallback(async (track: Track): Promise<ContentAccessResult> => {
    setIsLoading(true);
    
    const baseUrl = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    const url = buildIdentityUrl(baseUrl, null);
    const { identityMode } = useSettingsStore.getState();
    
    debugLog('request', `GET ${baseUrl}`, { trackId: track.id, dTag: track.dTag, identityMode });

    try {
      const headers = await buildIdentityHeaders({}, baseUrl, 'GET');
      const response = await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
      
      if (response.status === 402) {
        const data = await response.json();
        debugLog('response', `GET ${url} - 402 Payment Required`, data);
        
        const result: ContentAccessPaymentRequired = {
          success: false,
          requiresPayment: true,
          priceCredits: data.price_credits || data.priceCredits || 0,
          mintUrl: data.mint_url || data.mintUrl || CONFIG.MINT_URL,
        };
        setLastResult(result);
        setIsLoading(false);
        return result;
      }

      if (!response.ok) {
        const errorText = await response.text();
        debugLog('error', `GET ${url} - ${response.status}`, { body: errorText });
        
        const result: ContentAccessError = {
          success: false,
          requiresPayment: false,
          error: `${response.status}: ${errorText}`,
        };
        setLastResult(result);
        setIsLoading(false);
        return result;
      }

      const data = await response.json();
      debugLog('response', `GET ${url} - 200 OK`, data);
      
      // Handle both { url: "..." } and { data: { url: "..." } } response formats
      const contentUrl = data.data?.url || data.url;
      
      const result: ContentAccessSuccess = {
        success: true,
        url: contentUrl,
        streamType: data.data?.stream_type || data.stream_type || data.streamType,
      };
      setLastResult(result);
      setIsLoading(false);
      return result;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      debugLog('error', `Content access error`, { error: message });
      
      const result: ContentAccessError = {
        success: false,
        requiresPayment: false,
        error: message,
      };
      setLastResult(result);
      setIsLoading(false);
      return result;
    }
  }, []);

  const purchaseAccess = useCallback(async (
    track: Track,
    proofs: Proof[]
  ): Promise<ContentAccessResult> => {
    setIsLoading(true);
    
    const baseUrl = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    const { identityMode } = useSettingsStore.getState();
    
    // Log proof details before encoding
    debugLog('wallet', 'Preparing proofs for payment', {
      proofCount: proofs.length,
      proofs: proofs.map(p => ({
        amount: p.amount,
        id: p.id,  // keyset ID
        C: p.C?.slice(0, 20) + '...',
        secret: p.secret?.slice(0, 20) + '...',
      })),
      totalAmount: proofs.reduce((s, p) => s + p.amount, 0),
    });

    // Encode proofs as cashu token
    const token = getEncodedTokenV4({
      mint: CONFIG.MINT_URL,
      proofs,
      unit: 'usd',
    });
    
    // Build URL with identity params if using URL token signature mode
    const url = buildIdentityUrl(baseUrl, token);
    
    debugLog('wallet', 'Encoded Cashu token', {
      mintUrl: CONFIG.MINT_URL,
      unit: 'usd',
      tokenPreview: token.slice(0, 50) + '...',
      tokenLength: token.length,
    });
    
    const totalAmount = proofs.reduce((s, p) => s + p.amount, 0);
    debugLog('request', `GET ${baseUrl} (with X-Ecash-Token)`, { 
      trackId: track.id, 
      dTag: track.dTag,
      identityMode,
      payment: {
        tokenAmount: totalAmount,
        trackPrice: track.metadata.price_credits,
        unit: 'usd',
      },
      headers: {
        'X-Ecash-Token': token.slice(0, 30) + '...',
      },
    });

    try {
      // Build headers with token and optional NIP-98 auth
      const headers = await buildIdentityHeaders({ 'X-Ecash-Token': token }, baseUrl, 'GET');
      const response = await fetch(url, { headers });

      if (response.status === 402) {
        const data = await response.json();
        debugLog('response', `GET ${url} - 402 (payment insufficient?)`, data);
        
        const result: ContentAccessPaymentRequired = {
          success: false,
          requiresPayment: true,
          priceCredits: data.price_credits || data.priceCredits || 0,
          mintUrl: data.mint_url || data.mintUrl || CONFIG.MINT_URL,
        };
        setLastResult(result);
        setIsLoading(false);
        return result;
      }

      if (!response.ok) {
        const errorText = await response.text();
        debugLog('error', `GET ${url} - ${response.status}`, { body: errorText });
        
        const result: ContentAccessError = {
          success: false,
          requiresPayment: false,
          error: `${response.status}: ${errorText}`,
        };
        setLastResult(result);
        setIsLoading(false);
        return result;
      }

      const data = await response.json();
      debugLog('response', `GET ${url} - 200 OK (access granted!)`, data);
      
      // Payment successful - remove proofs from wallet
      useWalletStore.getState().removeProofs(proofs.map(p => p.secret));
      
      // Handle both { url: "..." } and { data: { url: "..." } } response formats
      const contentUrl = data.data?.url || data.url;
      
      const result: ContentAccessSuccess = {
        success: true,
        url: contentUrl,
        streamType: data.data?.stream_type || data.stream_type || data.streamType,
      };
      setLastResult(result);
      setIsLoading(false);
      return result;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      debugLog('error', `Purchase access error`, { error: message });
      
      const result: ContentAccessError = {
        success: false,
        requiresPayment: false,
        error: message,
      };
      setLastResult(result);
      setIsLoading(false);
      return result;
    }
  }, []);

  /**
   * Single-request access using pre-built token (fastest path)
   * 
   * This is the optimized path that achieves ~124ms latency:
   * - Uses a pre-built token from the cache (already exact denomination)
   * - Makes ONE HTTP request with the token
   * - No 402 discovery, no mint swap
   * 
   * Falls back to standard flow if no cached tokens available.
   */
  const singleRequestAccess = useCallback(async (
    track: Track
  ): Promise<ContentAccessResult> => {
    const startTime = performance.now();
    setIsLoading(true);
    
    // Try to get a pre-built token
    const cachedToken = useTokenCacheStore.getState().popToken();
    
    if (!cachedToken) {
      debugLog('tokenCache', 'No cached tokens, falling back to standard flow');
      setIsLoading(false);
      
      // Fall back to checkAccess (will return 402 for paywalled content)
      return checkAccess(track);
    }

    const baseUrl = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    const { identityMode } = useSettingsStore.getState();
    
    // Build URL with identity params if using URL token signature mode
    const url = buildIdentityUrl(baseUrl, cachedToken.token);
    
    debugLog('request', `GET ${baseUrl} [SINGLE-REQUEST MODE]`, { 
      trackId: track.id, 
      dTag: track.dTag,
      identityMode,
      payment: {
        tokenAmount: cachedToken.amount,
        trackPrice: track.metadata.price_credits,
        unit: 'usd',
      },
      headers: {
        'X-Ecash-Token': cachedToken.token.slice(0, 30) + '...',
      },
    });

    try {
      // Build headers with token and optional NIP-98 auth
      const headers = await buildIdentityHeaders({ 'X-Ecash-Token': cachedToken.token }, baseUrl, 'GET');
      const response = await fetch(url, { headers });

      const elapsed = performance.now() - startTime;

      if (response.status === 402) {
        const data = await response.json();
        debugLog('response', `GET ${url} - 402 in ${elapsed.toFixed(0)}ms (token rejected?)`, data);
        
        const result: ContentAccessPaymentRequired = {
          success: false,
          requiresPayment: true,
          priceCredits: data.price_credits || data.priceCredits || 0,
          mintUrl: data.mint_url || data.mintUrl || CONFIG.MINT_URL,
        };
        setLastResult(result);
        setIsLoading(false);
        return result;
      }

      if (!response.ok) {
        const errorText = await response.text();
        debugLog('error', `GET ${url} - ${response.status} in ${elapsed.toFixed(0)}ms`, { body: errorText });
        
        const result: ContentAccessError = {
          success: false,
          requiresPayment: false,
          error: `${response.status}: ${errorText}`,
        };
        setLastResult(result);
        setIsLoading(false);
        return result;
      }

      const data = await response.json();
      debugLog('response', `GET ${url} - 200 OK in ${elapsed.toFixed(0)}ms [SINGLE-REQUEST SUCCESS]`, {
        ...data,
        latencyMs: elapsed.toFixed(0),
      });
      
      // Handle both { url: "..." } and { data: { url: "..." } } response formats
      const contentUrl = data.data?.url || data.url;
      
      const result: ContentAccessSuccess = {
        success: true,
        url: contentUrl,
        streamType: data.data?.stream_type || data.stream_type || data.streamType,
      };
      setLastResult(result);
      setIsLoading(false);
      return result;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      debugLog('error', `Single-request access error`, { error: message });
      
      const result: ContentAccessError = {
        success: false,
        requiresPayment: false,
        error: message,
      };
      setLastResult(result);
      setIsLoading(false);
      return result;
    }
  }, [checkAccess]);

  /**
   * Get token cache status for UI display
   */
  const getTokenCacheStatus = useCallback(() => {
    const store = useTokenCacheStore.getState();
    return {
      tokenCount: store.getTokenCount(),
      isBuilding: store.isBuilding,
      isWalletReady: store.isWalletReady,
    };
  }, []);

  return {
    checkAccess,
    purchaseAccess,
    singleRequestAccess,
    getTokenCacheStatus,
    isLoading,
    lastResult,
  };
}
