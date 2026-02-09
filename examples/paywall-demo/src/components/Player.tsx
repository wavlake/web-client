import { useRef, useEffect, useCallback } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import { useWallet } from '@wavlake/paywall-react';

// Config
const PAYMENT_TRIGGER_OFFSET_SECONDS = 3;

export function Player() {
  const {
    currentTrack,
    isLoading,
    error,
    currentTime,
    duration,
    streamState,
    streamHeaders,
    paymentConfirmed,
    receipt,
    stop,
    clearError,
    setAudioElement,
    updateTime,
    triggerPayment,
  } = usePlayer();
  const { balance } = useWallet();
  const audioRef = useRef<HTMLAudioElement>(null);

  // Register audio element with player context
  useEffect(() => {
    setAudioElement(audioRef.current);
    return () => setAudioElement(null);
  }, [setAudioElement]);

  // Handle timeupdate - trigger payment near preview boundary
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    updateTime(audio.currentTime, audio.duration || 0);

    // Calculate preview duration from stream headers
    const previewEnd = streamHeaders
      ? (streamHeaders.durationSeconds > 0
          ? (streamHeaders.previewEndByte / (audio.duration * 128000 / 8)) * audio.duration
          : 60) // Fallback
      : 60;

    // Trigger payment near preview boundary (if not already paid)
    if (
      !paymentConfirmed &&
      streamHeaders &&
      audio.currentTime >= previewEnd - PAYMENT_TRIGGER_OFFSET_SECONDS
    ) {
      triggerPayment();
    }
  }, [streamHeaders, paymentConfirmed, updateTime, triggerPayment]);

  // Handle seek - block past preview until paid
  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const seekTime = percent * audio.duration;

      // Calculate preview duration
      const previewEnd = streamHeaders
        ? (streamHeaders.durationSeconds > 0
            ? (streamHeaders.previewEndByte / (audio.duration * 128000 / 8)) * audio.duration
            : 60)
        : 60;

      // Block seeking past preview if not paid
      if (!paymentConfirmed && seekTime > previewEnd) {
        console.log('[Player] Seek blocked: payment required');
        return;
      }

      audio.currentTime = seekTime;
    },
    [streamHeaders, paymentConfirmed]
  );

  const handleEnded = () => {
    stop();
  };

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get stream state badge
  const getBadge = () => {
    if (streamState === 'streaming' && !paymentConfirmed) {
      return { className: 'badge badge-preview', text: 'Preview' };
    }
    if (streamState === 'paying') {
      return { className: 'badge badge-paying', text: 'Paying...' };
    }
    if (paymentConfirmed || streamState === 'paid') {
      return { className: 'badge badge-paid', text: 'Full Access' };
    }
    return null;
  };

  // Calculate progress percentages
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const previewEnd = streamHeaders && duration > 0
    ? Math.min((streamHeaders.previewEndByte / (duration * 128000 / 8)) * 100, 100)
    : null;

  if (!currentTrack) {
    return null;
  }

  const badge = getBadge();

  return (
    <section className="panel player">
      <div className="now-playing">
        <div className="now-playing-header">
          <span className="label">Now Playing</span>
          {badge && <span className={badge.className}>{badge.text}</span>}
        </div>
        <span className="track-title">{currentTrack.metadata.title}</span>
        <span className="track-artist">{currentTrack.metadata.artist}</span>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            updateTime(0, audioRef.current.duration);
          }
        }}
        style={{ display: 'none' }}
      />

      {/* Custom player controls */}
      <div className="player-controls">
        <button
          className="control-btn stop-btn"
          onClick={stop}
          disabled={isLoading}
          title="Stop"
        >
          ⏹
        </button>

        {/* Progress bar */}
        <div
          className={`progress-bar ${!paymentConfirmed ? 'progress-limited' : ''}`}
          onClick={handleSeek}
        >
          {/* Played progress */}
          <div className="progress-fill" style={{ width: `${progress}%` }} />

          {/* Preview boundary marker */}
          {previewEnd !== null && !paymentConfirmed && (
            <>
              <div
                className="preview-marker"
                style={{ left: `${previewEnd}%` }}
                title="Preview boundary"
              />
              <div
                className="blocked-region"
                style={{ left: `${previewEnd}%`, width: `${100 - previewEnd}%` }}
              />
            </>
          )}
        </div>

        {/* Time display */}
        <div className="time-display">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="separator">/</span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Stream info (debug) */}
      {streamHeaders && (
        <div className="stream-info">
          <span>Price: {streamHeaders.priceCredits} credits</span>
          <span>Balance: {balance}</span>
          {receipt && <span>Receipt: {receipt.id.slice(0, 8)}...</span>}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="error-message">
          <span>{error.message}</span>
          <button onClick={clearError}>✕</button>
        </div>
      )}

      {/* Payment pending indicator */}
      {streamState === 'paying' && (
        <div className="payment-pending">
          <span className="spinner">⏳</span>
          <span>Processing payment...</span>
        </div>
      )}
    </section>
  );
}
