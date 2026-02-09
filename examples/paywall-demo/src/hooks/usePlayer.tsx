import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useWallet } from '@wavlake/paywall-react';
import type { Track, StreamState, StreamHeaders, SettlementReceipt } from '../types';
import { getTrackDtag } from '../types';

// ============================================================================
// Config
// ============================================================================

const API_URL = 'https://api-staging-854568123236.us-central1.run.app';

const PAYMENT_CONFIG = {
  /** How many seconds before preview end to trigger payment */
  PAYMENT_TRIGGER_OFFSET_SECONDS: 3,
  /** Minimum ms between payment attempts */
  PAYMENT_DEBOUNCE_MS: 1000,
  /** Payment POST timeout */
  PAYMENT_TIMEOUT_MS: 15000,
};

// ============================================================================
// Types
// ============================================================================

interface PlayerContextValue {
  // Playback state
  currentTrack: Track | null;
  audioUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: Error | null;
  currentTime: number;
  duration: number;

  // Parallel payment streaming state
  streamState: StreamState;
  depositId: string | null;
  streamHeaders: StreamHeaders | null;
  paymentConfirmed: boolean;
  receipt: SettlementReceipt | null;
  firstByteReceived: boolean;

  // Computed: preview duration in seconds
  previewDuration: number;

  // Actions
  play: (track: Track) => Promise<void>;
  stop: () => void;
  clearError: () => void;

  // Audio element management
  setAudioElement: (element: HTMLAudioElement | null) => void;
  updateTime: (time: number, totalDuration: number) => void;

  // Payment trigger (called by timeupdate listener in Player)
  triggerPayment: () => Promise<boolean>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function PlayerProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();

  // Playback state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Parallel payment streaming state
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [depositId, setDepositId] = useState<string | null>(null);
  const [streamHeaders, setStreamHeaders] = useState<StreamHeaders | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [firstByteReceived, setFirstByteReceived] = useState(false);

  // Audio element ref
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Payment debounce refs
  const paymentInFlightRef = useRef(false);
  const lastPaymentAttemptRef = useRef(0);

  // Track ref for current track context
  const currentTrackRef = useRef<Track | null>(null);
  currentTrackRef.current = currentTrack;

  // Computed preview duration
  const previewDuration = streamHeaders
    ? (streamHeaders.previewEndByte / (streamHeaders.durationSeconds > 0
        ? (streamHeaders.previewEndByte / streamHeaders.durationSeconds * duration / streamHeaders.previewEndByte)
        : 128000 / 8)) // Fallback: 128kbps estimate
    : 60; // Default 60s preview

  /**
   * Build stream URL with depositID as query parameter.
   */
  const buildStreamUrl = useCallback(
    (track: Track, depId: string): string => {
      const dtag = getTrackDtag(track);
      const url = new URL(`${API_URL}/api/v1/audio/${dtag}`);
      url.searchParams.set('d', depId);
      return url.toString();
    },
    []
  );

  /**
   * Parse stream headers from HEAD response.
   */
  const fetchStreamHeaders = useCallback(
    async (track: Track, depId: string): Promise<StreamHeaders | null> => {
      try {
        const url = buildStreamUrl(track, depId);
        const response = await fetch(url, { method: 'HEAD' });

        const previewEndByte = response.headers.get('X-Preview-End-Byte');
        const priceCredits = response.headers.get('X-Price-Credits');
        const mintUrl = response.headers.get('X-Mint-URL');
        const durationSeconds = response.headers.get('X-Duration-Seconds');

        if (!previewEndByte || !priceCredits) {
          console.log('[Player] No stream headers (may be free track)');
          return null;
        }

        const headers: StreamHeaders = {
          previewEndByte: parseInt(previewEndByte, 10),
          priceCredits: parseInt(priceCredits, 10),
          mintUrl: mintUrl || 'https://nutshell-staging-854568123236.us-central1.run.app',
          durationSeconds: durationSeconds ? parseFloat(durationSeconds) : 0,
        };

        console.log('[Player] Stream headers:', headers);
        return headers;
      } catch (err) {
        console.error('[Player] Failed to fetch stream headers:', err);
        return null;
      }
    },
    [buildStreamUrl]
  );

  /**
   * Send payment to POST /v1/audio/{dtag}/pay
   */
  const sendPayment = useCallback(
    async (track: Track, depId: string, price: number): Promise<boolean> => {
      // Check balance
      if (wallet.balance < price) {
        setError(new Error(`Insufficient balance: need ${price}, have ${wallet.balance}`));
        return false;
      }

      try {
        // Create token with exact amount
        console.log(`[Player] Creating token for ${price} credits...`);
        const token = await wallet.createToken(price);
        console.log('[Player] Token created');

        // POST to pay endpoint
        const dtag = getTrackDtag(track);
        const payUrl = `${API_URL}/api/v1/audio/${dtag}/pay`;
        console.log(`[Player] POST ${payUrl}`);

        const response = await fetch(payUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ depositId: depId, token }),
          signal: AbortSignal.timeout(PAYMENT_CONFIG.PAYMENT_TIMEOUT_MS),
        });

        if (response.ok) {
          // Parse receipt from response
          try {
            const data = await response.json();
            if (data.success && data.data?.receipt) {
              setReceipt(data.data.receipt as SettlementReceipt);
              console.log('[Player] Receipt received:', data.data.receipt.id);
            }
          } catch {
            console.log('[Player] Could not parse receipt');
          }

          console.log('[Player] Payment confirmed');
          return true;
        }

        if (response.status === 402) {
          console.log('[Player] Payment rejected (402)');
          setError(new Error('Payment rejected: proofs invalid or insufficient'));
          return false;
        }

        if (response.status === 404) {
          console.log('[Player] Deposit not found (404)');
          setError(new Error('Stream timed out. Please restart playback.'));
          return false;
        }

        if (response.status === 409) {
          console.log('[Player] Deposit already paid (409)');
          return true; // Already paid, treat as success
        }

        const text = await response.text();
        console.error('[Player] Payment failed:', response.status, text);
        setError(new Error(`Payment failed: ${response.status}`));
        return false;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Payment error';
        console.error('[Player] Payment error:', message);
        setError(new Error(message));
        return false;
      }
    },
    [wallet]
  );

  /**
   * Trigger payment for the currently playing stream.
   * Called by timeupdate listener when nearing preview boundary.
   */
  const triggerPayment = useCallback(async (): Promise<boolean> => {
    // Debounce
    if (paymentInFlightRef.current) return false;
    const now = Date.now();
    if (now - lastPaymentAttemptRef.current < PAYMENT_CONFIG.PAYMENT_DEBOUNCE_MS) {
      return false;
    }

    const track = currentTrackRef.current;
    if (!track || !depositId || !streamHeaders) {
      console.log('[Player] Payment trigger skipped: no active stream');
      return false;
    }

    if (paymentConfirmed) return false;
    if (!firstByteReceived) {
      console.log('[Player] Payment trigger skipped: waiting for first byte');
      return false;
    }

    paymentInFlightRef.current = true;
    lastPaymentAttemptRef.current = now;

    console.log('[Player] Payment triggered', {
      trackId: getTrackDtag(track),
      depositId,
      price: streamHeaders.priceCredits,
      currentTime,
    });

    setStreamState('paying');

    try {
      const success = await sendPayment(track, depositId, streamHeaders.priceCredits);

      if (success) {
        setPaymentConfirmed(true);
        setStreamState('paid');
        console.log('[Player] Payment flow complete');
      } else {
        setStreamState('error');
      }

      return success;
    } finally {
      paymentInFlightRef.current = false;
    }
  }, [depositId, streamHeaders, paymentConfirmed, firstByteReceived, currentTime, sendPayment]);

  /**
   * Play a track using parallel payment streaming protocol.
   */
  const play = useCallback(
    async (track: Track) => {
      setIsLoading(true);
      setError(null);

      // Reset state
      setStreamState('idle');
      setDepositId(null);
      setStreamHeaders(null);
      setPaymentConfirmed(false);
      setReceipt(null);
      setFirstByteReceived(false);
      setCurrentTime(0);
      setDuration(0);

      try {
        // Generate depositID
        const depId = crypto.randomUUID();
        setDepositId(depId);

        // Fetch stream headers via HEAD
        const headers = await fetchStreamHeaders(track, depId);
        if (headers) {
          setStreamHeaders(headers);
        }

        // Build stream URL
        const url = buildStreamUrl(track, depId);
        console.log('[Player] Starting stream:', url.replace(/d=[^&]+/, 'd=***'));

        // Set audio source
        setCurrentTrack(track);
        setAudioUrl(url);
        setStreamState('streaming');

        // Play via audio element
        if (audioElementRef.current) {
          audioElementRef.current.src = url;
          await audioElementRef.current.play();
          setIsPlaying(true);
          setFirstByteReceived(true);
        }
      } catch (err) {
        console.error('[Player] Play error:', err);
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStreamState('error');
      } finally {
        setIsLoading(false);
      }
    },
    [buildStreamUrl, fetchStreamHeaders]
  );

  const stop = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
    }
    setAudioUrl(null);
    setIsPlaying(false);
    setCurrentTrack(null);
    setStreamState('idle');
    setDepositId(null);
    setStreamHeaders(null);
    setPaymentConfirmed(false);
    setReceipt(null);
    setFirstByteReceived(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const setAudioElement = useCallback((element: HTMLAudioElement | null) => {
    audioElementRef.current = element;
  }, []);

  const updateTime = useCallback((time: number, totalDuration: number) => {
    setCurrentTime(time);
    setDuration(totalDuration);
  }, []);

  const value: PlayerContextValue = {
    currentTrack,
    audioUrl,
    isPlaying,
    isLoading,
    error,
    currentTime,
    duration,
    streamState,
    depositId,
    streamHeaders,
    paymentConfirmed,
    receipt,
    firstByteReceived,
    previewDuration,
    play,
    stop,
    clearError,
    setAudioElement,
    updateTime,
    triggerPayment,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
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
