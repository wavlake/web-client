import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { useWallet, usePaywall } from '@wavlake/paywall-react';

interface Track {
  dtag: string;
  title: string;
  artist: string;
  price: number;
  artwork?: string;
}

interface PlayerContextValue {
  currentTrack: Track | null;
  audioUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: Error | null;
  play: (track: Track) => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const paywall = usePaywall();

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track blob URLs for cleanup
  const blobUrlRef = useRef<string | null>(null);

  const cleanupBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const play = useCallback(async (track: Track) => {
    setIsLoading(true);
    setError(null);

    try {
      // Check balance
      if (wallet.balance < track.price) {
        throw new Error(`Insufficient balance: need ${track.price}, have ${wallet.balance}`);
      }

      // Create token
      console.log(`Creating token for ${track.price} credits...`);
      const token = await wallet.createToken(track.price);
      console.log('Token created:', token.substring(0, 50) + '...');

      // Request content
      console.log(`Requesting content for ${track.dtag}...`);
      const result = await paywall.requestContent(track.dtag, token);
      console.log('Content result:', result);

      // Handle change if any
      if (result.change) {
        console.log('Receiving change...');
        try {
          const changeAmount = await wallet.receiveToken(result.change);
          console.log(`Received ${changeAmount} credits as change`);
        } catch (err) {
          console.warn('Failed to receive change:', err);
        }
      }

      // Set up playback
      cleanupBlobUrl();
      setCurrentTrack(track);
      setAudioUrl(result.url);
      setIsPlaying(true);

    } catch (err) {
      console.error('Play error:', err);
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, paywall, cleanupBlobUrl]);

  const stop = useCallback(() => {
    cleanupBlobUrl();
    setAudioUrl(null);
    setIsPlaying(false);
    setCurrentTrack(null);
  }, [cleanupBlobUrl]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: PlayerContextValue = {
    currentTrack,
    audioUrl,
    isPlaying,
    isLoading,
    error,
    play,
    stop,
    clearError,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
}
