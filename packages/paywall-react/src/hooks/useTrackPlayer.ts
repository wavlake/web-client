'use client';

/**
 * useTrackPlayer Hook
 * 
 * Combined hook for common "pay and play" flow.
 */

import { useState, useCallback, useRef } from 'react';
import { useWalletContext } from '../providers/WalletProvider.js';
import { usePaywallContext } from '../providers/PaywallProvider.js';

// ============================================================================
// Types
// ============================================================================

export interface UseTrackPlayerResult {
  /** Play a track (creates token, requests content, returns URL) */
  play: (dtag: string, price: number) => Promise<void>;
  /** Stop playback and clean up */
  stop: () => void;
  /** Current audio URL (blob or signed URL) */
  audioUrl: string | null;
  /** Grant ID for replay (if using content endpoint) */
  grantId: string | null;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Clear the error state */
  clearError: () => void;
}

export interface UseTrackPlayerOptions {
  /** Use /v1/content endpoint (default: true for grant support) */
  useContentEndpoint?: boolean;
  /** Auto-receive change tokens */
  autoReceiveChange?: boolean;
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
 * - Change processing
 * - Error handling
 * 
 * @example
 * ```tsx
 * function Player({ dtag, price }: { dtag: string; price: number }) {
 *   const { play, stop, audioUrl, isPlaying, isLoading, error } = useTrackPlayer();
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
 *     </div>
 *   );
 * }
 * ```
 */
export function useTrackPlayer(options: UseTrackPlayerOptions = {}): UseTrackPlayerResult {
  const {
    useContentEndpoint = true,
    autoReceiveChange = true,
  } = options;

  const wallet = useWalletContext();
  const paywall = usePaywallContext();

  // State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [grantId, setGrantId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track blob URLs for cleanup
  const blobUrlRef = useRef<string | null>(null);

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
      // Check balance first
      if (wallet.balance < price) {
        throw new Error(`Insufficient balance: need ${price}, have ${wallet.balance}`);
      }

      // Create token
      const token = await wallet.createToken(price);

      if (useContentEndpoint) {
        // Use content endpoint (supports grant replay)
        const result = await paywall.requestContent(dtag, token);

        // Handle change
        if (autoReceiveChange && result.change) {
          try {
            await wallet.receiveToken(result.change);
          } catch (err) {
            console.warn('Failed to receive change:', err);
          }
        }

        // Store grant for potential replay
        setGrantId(result.grant.id);
        setAudioUrl(result.url);
      } else {
        // Use audio endpoint (direct binary)
        const result = await paywall.requestAudio(dtag, token);

        // Handle change
        if (autoReceiveChange && result.change) {
          try {
            await wallet.receiveToken(result.change);
          } catch (err) {
            console.warn('Failed to receive change:', err);
          }
        }

        // Create blob URL
        cleanupBlobUrl();
        const url = URL.createObjectURL(result.audio);
        blobUrlRef.current = url;
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
  }, [wallet, paywall, useContentEndpoint, autoReceiveChange, cleanupBlobUrl]);

  // Stop playback
  const stop = useCallback(() => {
    cleanupBlobUrl();
    setAudioUrl(null);
    setIsPlaying(false);
    // Keep grantId for potential replay
  }, [cleanupBlobUrl]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    play,
    stop,
    audioUrl,
    grantId,
    isPlaying,
    isLoading,
    error,
    clearError,
  };
}
