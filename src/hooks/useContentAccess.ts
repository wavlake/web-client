/**
 * Content Access Hook
 * 
 * Handles the paywall flow:
 * 1. Request content access
 * 2. If 402 → show price, require payment
 * 3. If paid → get signed URL
 */

import { useState, useCallback } from 'react';
import { getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { CONFIG } from '../lib/config';
import { debugLog } from '../stores/debug';
import { useWalletStore } from '../stores/wallet';
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
      
      const result: ContentAccessSuccess = {
        success: true,
        url: data.url,
        streamType: data.stream_type || data.streamType,
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
    
    // Encode proofs as cashu token
    const token = getEncodedTokenV4({
      mint: CONFIG.MINT_URL,
      proofs,
      unit: 'usd',
    });
    
    debugLog('request', `GET ${url} (with payment)`, { 
      trackId: track.id, 
      dTag: track.dTag,
      tokenLength: token.length,
      proofCount: proofs.length,
      totalAmount: proofs.reduce((s, p) => s + p.amount, 0),
    });

    try {
      const response = await fetch(url, {
        headers: {
          'X-Cashu-Token': token,
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
      
      const result: ContentAccessSuccess = {
        success: true,
        url: data.url,
        streamType: data.stream_type || data.streamType,
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

  return {
    checkAccess,
    purchaseAccess,
    isLoading,
    lastResult,
  };
}
