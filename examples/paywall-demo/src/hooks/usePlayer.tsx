import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { useWallet, usePaywall } from '@wavlake/paywall-react';
import type { ChunkType, TwoChunkInfo } from '@wavlake/paywall-client';
import { useSettings } from './useSettings';

// ============================================================================
// Types
// ============================================================================

interface Track {
  dtag: string;
  title: string;
  artist: string;
  price: number;
  artwork?: string;
}

/**
 * Stream state for two-chunk delivery
 */
type StreamState = 'idle' | 'preview' | 'waiting' | 'paid' | 'complete';

/**
 * Resume token info for continuing interrupted streams
 */
interface ResumeInfo {
  token: string;
  trackDtag: string;
  expiresAt: number;
}

interface PlayerContextValue {
  // Playback state
  currentTrack: Track | null;
  audioUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: Error | null;
  
  // Two-chunk state
  chunkType: ChunkType | null;
  streamState: StreamState;
  resumeInfo: ResumeInfo | null;
  paymentRequired: boolean;
  
  // Actions
  play: (track: Track) => Promise<void>;
  stop: () => void;
  clearError: () => void;
  resumeWithToken: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function PlayerProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const paywall = usePaywall();
  const { endpoint } = useSettings();

  // Playback state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Two-chunk state
  const [chunkType, setChunkType] = useState<ChunkType | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);
  const [paymentRequired, setPaymentRequired] = useState(false);

  // Track blob URLs for cleanup
  const blobUrlRef = useRef<string | null>(null);

  const cleanupBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const resetTwoChunkState = useCallback(() => {
    setChunkType(null);
    setStreamState('idle');
    setResumeInfo(null);
    setPaymentRequired(false);
  }, []);

  const updateTwoChunkState = useCallback((twoChunk: TwoChunkInfo | undefined, track: Track) => {
    if (!twoChunk) return;

    // Update chunk type
    if (twoChunk.chunk) {
      setChunkType(twoChunk.chunk);
      
      // Update stream state based on chunk
      if (twoChunk.chunk === 'preview') {
        setStreamState('preview');
      } else if (twoChunk.chunk === 'paid' || twoChunk.chunk === 'full') {
        setStreamState('paid');
      }
    }

    // Handle payment required (60s checkpoint reached without payment)
    if (twoChunk.paymentRequired) {
      setPaymentRequired(true);
      setStreamState('waiting');
    }

    // Handle payment settled
    if (twoChunk.paymentSettled) {
      setPaymentRequired(false);
      setStreamState('paid');
    }

    // Store resume token if provided
    if (twoChunk.resumeToken) {
      setResumeInfo({
        token: twoChunk.resumeToken,
        trackDtag: track.dtag,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
      });
    }
  }, []);

  const play = useCallback(async (track: Track) => {
    setIsLoading(true);
    setError(null);
    resetTwoChunkState();

    try {
      // Check balance
      if (wallet.balance < track.price) {
        throw new Error(`Insufficient balance: need ${track.price}, have ${wallet.balance}`);
      }

      // Create token with exact amount (no change returned by server)
      console.log(`[${endpoint}] Creating token for ${track.price} credits...`);
      const token = await wallet.createToken(track.price);
      console.log('Token created:', token.substring(0, 50) + '...');

      let url: string;

      if (endpoint === 'content') {
        // Use /api/v1/content - JSON with signed URL + grant
        console.log(`[content] Requesting content for ${track.dtag}...`);
        const result = await paywall.requestContent(track.dtag, token);
        console.log('Content result:', result);
        url = result.url;
        // Content endpoint doesn't support two-chunk (uses grants instead)
        setChunkType('full');
        setStreamState('paid');
      } else if (endpoint === 'audio') {
        // Use /api/v1/audio - Direct binary stream via header
        console.log(`[audio] Requesting audio for ${track.dtag}...`);
        const result = await paywall.requestAudio(track.dtag, token);
        console.log('Audio result: blob received, size:', result.audio.size);
        
        // Create blob URL for audio element
        cleanupBlobUrl();
        url = URL.createObjectURL(result.audio);
        blobUrlRef.current = url;

        // Update two-chunk state from headers
        updateTwoChunkState(result.twoChunk, track);
        
        // Log two-chunk info
        if (result.twoChunk) {
          console.log('Two-chunk info:', result.twoChunk);
        }
      } else {
        // Use /api/v1/audio?token= - URL param for native <audio>
        console.log(`[audio-url] Getting URL with token for ${track.dtag}...`);
        url = paywall.getAudioUrl(track.dtag, token);
        console.log('Audio URL:', url.substring(0, 80) + '...');
        // URL mode - can't read headers, assume full access
        setChunkType('full');
        setStreamState('paid');
      }

      // Set up playback
      setCurrentTrack(track);
      setAudioUrl(url);
      setIsPlaying(true);

    } catch (err) {
      console.error('Play error:', err);
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, paywall, endpoint, cleanupBlobUrl, resetTwoChunkState, updateTwoChunkState]);

  const resumeWithToken = useCallback(async () => {
    if (!resumeInfo || !currentTrack) {
      setError(new Error('No resume token available'));
      return;
    }

    // Check if resume token expired
    if (Date.now() > resumeInfo.expiresAt) {
      setError(new Error('Resume token expired'));
      setResumeInfo(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check balance
      if (wallet.balance < currentTrack.price) {
        throw new Error(`Insufficient balance: need ${currentTrack.price}, have ${wallet.balance}`);
      }

      // Create new token for resumed playback
      console.log(`[resume] Creating token for ${currentTrack.price} credits...`);
      const token = await wallet.createToken(currentTrack.price);
      console.log('Token created for resume:', token.substring(0, 50) + '...');

      // Request audio with resume token header
      console.log(`[resume] Resuming audio for ${currentTrack.dtag}...`);
      const result = await paywall.requestAudio(currentTrack.dtag, token, {
        headers: {
          'X-Resume-Token': resumeInfo.token,
        },
      });

      console.log('Resume result: blob received, size:', result.audio.size);
      
      // Create blob URL
      cleanupBlobUrl();
      const url = URL.createObjectURL(result.audio);
      blobUrlRef.current = url;

      // Update state
      updateTwoChunkState(result.twoChunk, currentTrack);
      setAudioUrl(url);
      setIsPlaying(true);
      setPaymentRequired(false);
      setResumeInfo(null); // Clear resume token after use

    } catch (err) {
      console.error('Resume error:', err);
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, paywall, currentTrack, resumeInfo, cleanupBlobUrl, updateTwoChunkState]);

  const stop = useCallback(() => {
    cleanupBlobUrl();
    setAudioUrl(null);
    setIsPlaying(false);
    setCurrentTrack(null);
    resetTwoChunkState();
  }, [cleanupBlobUrl, resetTwoChunkState]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: PlayerContextValue = {
    currentTrack,
    audioUrl,
    isPlaying,
    isLoading,
    error,
    chunkType,
    streamState,
    resumeInfo,
    paymentRequired,
    play,
    stop,
    clearError,
    resumeWithToken,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
}
