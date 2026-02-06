/**
 * Content Access Hook
 * 
 * Handles paywall flow with deferred debit model:
 * - Proofs stay in wallet until payment is confirmed
 * - Pending proofs tracked per-track for recovery on early stop
 * - Recovery timers validate against mint at 60s checkpoint
 * 
 * Modes:
 * 1. SINGLE-REQUEST (~124ms): Pre-built token from cache
 * 2. STANDARD (~400-700ms): Discovery + payment
 * 
 * Ported from monorepo paywall-poc for consistent UX.
 */

import { useState, useCallback } from 'react';
import { getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { CONFIG } from '../lib/config';
import { debugLog } from '../stores/debug';
import { useWalletStore } from '../stores/wallet';
import { useTokenCacheStore } from '../stores/tokenCache';
import { useSettingsStore } from '../stores/settings';
import { validateProofs } from '../lib/blinding';
import { signToken, signTimestamp, nsecToKeypair } from '../lib/identity';
import { createNip98AuthEvent } from '../lib/nip98';
import type { Track } from '../types/nostr';

// Recovery timer constant: 60s from track start
const RECOVERY_CHECKPOINT_MS = 60000;

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
    } else if (identityMode === 'urlTimestampSig') {
      const { pubkey, sig, t } = signTimestamp(keypair.privateKeyHex);
      url.searchParams.set('pubkey', pubkey);
      url.searchParams.set('sig', sig);
      url.searchParams.set('t', t.toString());
    }

    return url.toString();
  } catch {
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
    return { ...baseHeaders, Authorization: `Nostr ${nip98Token}` };
  } catch {
    return baseHeaders;
  }
}

export function useContentAccess() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ContentAccessResult | null>(null);

  /**
   * Check access without payment (free tracks)
   */
  const checkAccess = useCallback(async (track: Track): Promise<ContentAccessResult> => {
    setIsLoading(true);
    
    const baseUrl = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    const url = buildIdentityUrl(baseUrl, null);
    
    debugLog('request', `GET ${baseUrl}`, { trackId: track.id, dTag: track.dTag });

    try {
      const headers = await buildIdentityHeaders({}, baseUrl, 'GET');
      const response = await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
      
      if (response.status === 402) {
        const data = await response.json();
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
   * Purchase access with deferred debit model.
   * Proofs stay in wallet until X-Payment-Settled received.
   */
  const purchaseAccess = useCallback(async (
    track: Track,
    proofs: Proof[]
  ): Promise<ContentAccessResult> => {
    setIsLoading(true);
    
    const baseUrl = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    const walletStore = useWalletStore.getState();

    const token = getEncodedTokenV4({
      mint: CONFIG.MINT_URL,
      proofs,
      unit: 'usd',
    });
    
    const url = buildIdentityUrl(baseUrl, token);
    const totalAmount = proofs.reduce((s, p) => s + p.amount, 0);
    
    debugLog('request', `GET ${baseUrl} (with payment)`, { 
      trackId: track.id, 
      dTag: track.dTag,
      amount: totalAmount,
    });

    // Mark proofs as pending BEFORE request (deferred debit)
    walletStore.markProofsPending(track.dTag, proofs);

    try {
      const headers = await buildIdentityHeaders({ 'X-Ecash-Token': token }, baseUrl, 'GET');
      const response = await fetch(url, { headers });

      // Check for X-Payment-Settled header
      const paymentSettled = response.headers.get('X-Payment-Settled') !== null;

      if (response.status === 402) {
        const data = await response.json();
        debugLog('wallet', 'Payment rejected, clearing pending (proofs still in wallet)');
        walletStore.resolvePendingProofs(track.dTag, false);
        
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
        debugLog('wallet', 'Request failed, clearing pending (proofs still in wallet)');
        walletStore.resolvePendingProofs(track.dTag, false);
        
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
      const contentUrl = data.data?.url || data.url;

      // If X-Payment-Settled, resolve as spent immediately
      if (paymentSettled) {
        debugLog('wallet', 'X-Payment-Settled received, resolving pending as spent');
        walletStore.cancelRecoveryTimer(track.dTag);
        walletStore.resolvePendingProofs(track.dTag, true);
      }
      // Otherwise, pending proofs will be resolved by handleStreamCompletion or recovery timer
      
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
      debugLog('wallet', 'Network error, clearing pending (proofs still in wallet)');
      walletStore.resolvePendingProofs(track.dTag, false);
      
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
   * Single-request access using pre-built token (fast path).
   * Uses deferred debit model.
   */
  const singleRequestAccess = useCallback(async (
    track: Track
  ): Promise<ContentAccessResult> => {
    const startTime = performance.now();
    setIsLoading(true);
    
    const walletStore = useWalletStore.getState();
    const price = track.metadata.price_credits || 1;

    // Try to find exact proof in wallet (deferred debit: don't pop, just find)
    const exactProof = walletStore.findExactProof(price);
    
    if (!exactProof) {
      // Try pre-built token cache
      const cachedToken = useTokenCacheStore.getState().popToken();
      
      if (!cachedToken) {
        debugLog('tokenCache', 'No cached tokens or exact proofs, falling back to standard flow');
        setIsLoading(false);
        return checkAccess(track);
      }

      // Use cached token (tokens in cache are already "spent" from wallet during prebuild)
      const baseUrl = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
      const url = buildIdentityUrl(baseUrl, cachedToken.token);
      
      debugLog('request', `GET ${baseUrl} [SINGLE-REQUEST from cache]`, { 
        trackId: track.id, 
        dTag: track.dTag,
        amount: cachedToken.amount,
      });

      try {
        const headers = await buildIdentityHeaders({ 'X-Ecash-Token': cachedToken.token }, baseUrl, 'GET');
        const response = await fetch(url, { headers });
        const elapsed = performance.now() - startTime;

        if (!response.ok) {
          debugLog('response', `GET ${url} - ${response.status} in ${elapsed.toFixed(0)}ms`);
          setIsLoading(false);
          return checkAccess(track);
        }

        const data = await response.json();
        debugLog('response', `GET ${url} - 200 OK in ${elapsed.toFixed(0)}ms [SINGLE-REQUEST SUCCESS]`);
        
        const result: ContentAccessSuccess = {
          success: true,
          url: data.data?.url || data.url,
          streamType: data.data?.stream_type || data.stream_type || data.streamType,
        };
        setLastResult(result);
        setIsLoading(false);
        return result;

      } catch (err) {
        setIsLoading(false);
        return checkAccess(track);
      }
    }

    // Use exact proof with deferred debit
    const token = getEncodedTokenV4({
      mint: CONFIG.MINT_URL,
      proofs: [exactProof],
      unit: 'usd',
    });

    const baseUrl = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
    const url = buildIdentityUrl(baseUrl, token);

    debugLog('request', `GET ${baseUrl} [SINGLE-REQUEST from wallet]`, { 
      trackId: track.id, 
      dTag: track.dTag,
      amount: price,
    });

    // Mark as pending (deferred debit)
    walletStore.markProofsPending(track.dTag, [exactProof]);

    try {
      const headers = await buildIdentityHeaders({ 'X-Ecash-Token': token }, baseUrl, 'GET');
      const response = await fetch(url, { headers });
      const elapsed = performance.now() - startTime;

      const paymentSettled = response.headers.get('X-Payment-Settled') !== null;

      if (!response.ok) {
        debugLog('wallet', 'Token rejected, clearing pending (proof still in wallet)');
        walletStore.resolvePendingProofs(track.dTag, false);
        setIsLoading(false);
        return checkAccess(track);
      }

      const data = await response.json();
      debugLog('response', `GET ${url} - 200 OK in ${elapsed.toFixed(0)}ms [SINGLE-REQUEST SUCCESS]`);

      if (paymentSettled) {
        debugLog('wallet', 'X-Payment-Settled received, resolving pending as spent');
        walletStore.cancelRecoveryTimer(track.dTag);
        walletStore.resolvePendingProofs(track.dTag, true);
      }
      
      const result: ContentAccessSuccess = {
        success: true,
        url: data.data?.url || data.url,
        streamType: data.data?.stream_type || data.stream_type || data.streamType,
      };
      setLastResult(result);
      setIsLoading(false);
      return result;

    } catch (err) {
      debugLog('wallet', 'Network error, clearing pending (proof still in wallet)');
      walletStore.resolvePendingProofs(track.dTag, false);
      setIsLoading(false);
      return checkAccess(track);
    }
  }, [checkAccess]);

  /**
   * Handle early stop or skip before 60s checkpoint.
   * Starts recovery timer to validate proofs at mint.
   */
  const handleEarlyStop = useCallback((trackDtag: string, elapsedSeconds: number) => {
    const walletStore = useWalletStore.getState();
    const pending = walletStore.getPendingProofs(trackDtag);
    
    if (!pending) {
      debugLog('wallet', 'No pending proofs for early stop', { trackDtag, elapsedSeconds });
      return;
    }

    const elapsedMs = elapsedSeconds * 1000;
    const remainingMs = RECOVERY_CHECKPOINT_MS - elapsedMs;

    if (remainingMs <= 0) {
      // Past checkpoint - server likely consumed token
      debugLog('wallet', 'Early stop past checkpoint, resolving as spent', { trackDtag, elapsedSeconds });
      walletStore.resolvePendingProofs(trackDtag, true);
      return;
    }

    debugLog('wallet', 'Early stop detected, starting recovery timer', {
      trackDtag,
      elapsedSeconds,
      remainingMs,
    });

    // Start recovery timer
    walletStore.startRecoveryTimer(trackDtag, remainingMs, validateProofs);
  }, []);

  /**
   * Handle stream completion past 60s mark.
   * Server definitely consumed the token.
   */
  const handleStreamCompletion = useCallback((trackDtag: string) => {
    const walletStore = useWalletStore.getState();
    const pending = walletStore.getPendingProofs(trackDtag);
    
    if (!pending) {
      debugLog('wallet', 'No pending proofs for stream completion', { trackDtag });
      return;
    }

    debugLog('wallet', 'Stream completed past checkpoint, resolving as spent', {
      trackDtag,
      amount: pending.proofs.reduce((s, p) => s + p.amount, 0),
    });

    walletStore.cancelRecoveryTimer(trackDtag);
    walletStore.resolvePendingProofs(trackDtag, true);
  }, []);

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
    // Pending credit recovery
    handleEarlyStop,
    handleStreamCompletion,
    // State
    isLoading,
    lastResult,
  };
}
