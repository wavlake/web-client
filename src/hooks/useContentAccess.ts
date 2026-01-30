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
 */

import { useState, useCallback } from 'react';
import { getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { CONFIG } from '../lib/config';
import { debugLog } from '../stores/debug';
import { useWalletStore } from '../stores/wallet';
import { useTokenCacheStore } from '../stores/tokenCache';
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

export function useContentAccess() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ContentAccessResult | null>(null);

  const checkAccess = useCallback(async (track: Track): Promise<ContentAccessResult> => {
    setIsLoading(true);
    
    const url = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    debugLog('request', `GET ${url}`, { trackId: track.id, dTag: track.dTag });

    try {
      const response = await fetch(url);
      
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
    
    const url = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    
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
    
    debugLog('wallet', 'Encoded Cashu token', {
      mintUrl: CONFIG.MINT_URL,
      unit: 'usd',
      tokenPreview: token.slice(0, 50) + '...',
      tokenLength: token.length,
    });
    
    const totalAmount = proofs.reduce((s, p) => s + p.amount, 0);
    debugLog('request', `GET ${url} (with X-Ecash-Token)`, { 
      trackId: track.id, 
      dTag: track.dTag,
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
      const response = await fetch(url, {
        headers: {
          'X-Ecash-Token': token,
        },
      });

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

    const url = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    
    debugLog('request', `GET ${url} [SINGLE-REQUEST MODE]`, { 
      trackId: track.id, 
      dTag: track.dTag,
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
      const response = await fetch(url, {
        headers: {
          'X-Ecash-Token': cachedToken.token,
        },
      });

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
