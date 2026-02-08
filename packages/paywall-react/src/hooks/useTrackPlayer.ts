'use client';

/**
 * useTrackPlayer Hook
 * 
 * Combined hook for common "pay and play" flow.
 * Supports automatic grant replay for efficient multi-track playback.
 */

import { useState, useCallback, useRef } from 'react';
import { useWalletContext } from '../providers/WalletProvider.js';
import { usePaywallContext } from '../providers/PaywallProvider.js';
import { GrantCache } from './useGrantCache.js';

// ============================================================================
// Types
// ============================================================================

export interface UseTrackPlayerResult {
  /** Play a track (creates token, requests content, returns URL) */
  play: (dtag: string, price: number) => Promise<void>;
  /** Replay current track using cached grant (no payment) */
  replay: () => Promise<void>;
  /** Stop playback and clean up */
  stop: () => void;
  /** Current audio URL (blob or signed URL) */
  audioUrl: string | null;
  /** Current track's d-tag (null if nothing played) */
  currentDtag: string | null;
  /** Grant ID for replay (if using content endpoint) */
  grantId: string | null;
  /** Whether the current track can be replayed without payment */
  canReplay: boolean;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Clear the error state */
  clearError: () => void;
  /** Check if a specific track has a valid (non-expired) grant */
  hasGrantFor: (dtag: string) => boolean;
  /** Number of tracks with valid grants in cache */
  cachedGrantCount: number;
}

export interface UseTrackPlayerOptions {
  /** Use /v1/content endpoint (default: true for grant support) */
  useContentEndpoint?: boolean;
  /**
   * Enable grant caching across tracks (default: true).
   *
   * When enabled, playing the same track again within the grant
   * window (typically 10 minutes) replays the grant instead of
   * re-paying. This saves credits when switching between tracks.
   */
  enableGrantCache?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Combined hook for the common "pay and play" flow.
 * 
 * Handles:
 * - Token creation from wallet
 * - Content/audio request
 * - Automatic grant replay for recently played tracks
 * - Error handling
 * 
 * @example
 * ```tsx
 * function Player({ dtag, price }: { dtag: string; price: number }) {
 *   const { play, stop, replay, audioUrl, isPlaying, canReplay, isLoading, error } = useTrackPlayer();
 *   const audioRef = useRef<HTMLAudioElement>(null);
 *   
 *   useEffect(() => {
 *     if (audioUrl && audioRef.current) {
 *       audioRef.current.src = audioUrl;
 *       audioRef.current.play();
 *     }
 *   }, [audioUrl]);
 *   
 *   return (
 *     <div>
 *       <audio ref={audioRef} onEnded={stop} />
 *       {error && <div>Error: {error.message}</div>}
 *       <button onClick={() => play(dtag, price)} disabled={isLoading}>
 *         {isPlaying ? 'Playing...' : 'Play'}
 *       </button>
 *       {isPlaying && <button onClick={stop}>Stop</button>}
 *       {canReplay && <button onClick={replay}>Replay</button>}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // Multi-track playlist: second play of same track is free
 * function Playlist({ tracks }: { tracks: Array<{ dtag: string; price: number }> }) {
 *   const player = useTrackPlayer(); // grant cache enabled by default
 *   
 *   return (
 *     <ul>
 *       {tracks.map(t => (
 *         <li key={t.dtag}>
 *           <button onClick={() => player.play(t.dtag, t.price)}>
 *             {player.hasGrantFor(t.dtag) ? '▶ (cached)' : `▶ ${t.price}¢`}
 *           </button>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useTrackPlayer(options: UseTrackPlayerOptions = {}): UseTrackPlayerResult {
  const {
    useContentEndpoint = true,
    enableGrantCache = true,
  } = options;

  const wallet = useWalletContext();
  const paywall = usePaywallContext();

  // State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [grantId, setGrantId] = useState<string | null>(null);
  const [currentDtag, setCurrentDtag] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track blob URLs for cleanup
  const blobUrlRef = useRef<string | null>(null);

  // Grant cache (persists across renders, shared within this hook instance)
  const grantCacheRef = useRef<GrantCache>(new GrantCache());

  // Clean up blob URLs
  const cleanupBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  // Play a track
  const play = useCallback(async (dtag: string, price: number) => {
    setIsLoading(true);
    setError(null);

    try {
      // ── Grant cache replay ──────────────────────────────────
      // If we have a valid grant for this track, replay it (free!)
      if (useContentEndpoint && enableGrantCache) {
        const cached = grantCacheRef.current.get(dtag);
        if (cached) {
          const result = await paywall.replayGrant(dtag, cached.id);

          // Update grant cache with refreshed expiry
          grantCacheRef.current.set(dtag, result.grant);

          cleanupBlobUrl();
          setGrantId(result.grant.id);
          setCurrentDtag(dtag);
          setAudioUrl(result.url);
          setIsPlaying(true);
          setIsLoading(false);
          return;
        }
      }

      // ── Normal payment flow ────────────────────────────────
      // Check balance first
      if (wallet.balance < price) {
        throw new Error(`Insufficient balance: need ${price}, have ${wallet.balance}`);
      }

      // Create token
      const token = await wallet.createToken(price);

      if (useContentEndpoint) {
        // Use content endpoint (supports grant replay)
        const result = await paywall.requestContent(dtag, token);

        // Cache grant for future replay
        if (enableGrantCache) {
          grantCacheRef.current.set(dtag, result.grant);
        }

        // Store grant for potential replay
        setGrantId(result.grant.id);
        setCurrentDtag(dtag);
        setAudioUrl(result.url);
      } else {
        // Use audio endpoint (direct binary)
        const result = await paywall.requestAudio(dtag, token);

        // Create blob URL
        cleanupBlobUrl();
        const url = URL.createObjectURL(result.audio);
        blobUrlRef.current = url;
        setCurrentDtag(dtag);
        setAudioUrl(url);
        setGrantId(null);
      }

      setIsPlaying(true);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [wallet, paywall, useContentEndpoint, enableGrantCache, cleanupBlobUrl]);

  // Replay current track using cached grant
  const replay = useCallback(async () => {
    if (!currentDtag) {
      throw new Error('No track to replay — call play() first');
    }

    // Check grant cache first, fall back to current grantId
    const cached = grantCacheRef.current.get(currentDtag);
    const replayId = cached?.id ?? grantId;

    if (!replayId) {
      throw new Error('No valid grant available for replay');
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await paywall.replayGrant(currentDtag, replayId);

      // Update cache with refreshed data
      if (enableGrantCache) {
        grantCacheRef.current.set(currentDtag, result.grant);
      }

      setGrantId(result.grant.id);
      setAudioUrl(result.url);
      setIsPlaying(true);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [currentDtag, grantId, paywall, enableGrantCache]);

  // Stop playback
  const stop = useCallback(() => {
    cleanupBlobUrl();
    setAudioUrl(null);
    setIsPlaying(false);
    // Keep grantId and currentDtag for potential replay
  }, [cleanupBlobUrl]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check if a specific track has a cached grant
  const hasGrantFor = useCallback((dtag: string): boolean => {
    return grantCacheRef.current.has(dtag);
  }, []);

  // Derive canReplay from grant state
  const canReplay = (() => {
    if (!currentDtag) return false;
    // Check cache first
    if (grantCacheRef.current.has(currentDtag)) return true;
    // Fall back to non-expired grantId (we don't track expiry for bare grantId,
    // but if the cache doesn't have it, assume it may have expired)
    return !!grantId;
  })();

  return {
    play,
    replay,
    stop,
    audioUrl,
    currentDtag,
    grantId,
    canReplay,
    isPlaying,
    isLoading,
    error,
    clearError,
    hasGrantFor,
    get cachedGrantCount() {
      return grantCacheRef.current.size;
    },
  };
}
