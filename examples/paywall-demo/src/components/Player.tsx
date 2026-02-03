import { useRef, useEffect } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import { useWallet } from '@wavlake/paywall-react';

export function Player() {
  const { 
    currentTrack, 
    audioUrl, 
    stop,
    chunkType,
    streamState,
    resumeInfo,
    paymentRequired,
    resumeWithToken,
    isLoading,
  } = usePlayer();
  const { balance } = useWallet();
  const audioRef = useRef<HTMLAudioElement>(null);

  // Sync audio element with state
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(console.error);
    }
  }, [audioUrl]);

  // Handle audio ended
  const handleEnded = () => {
    stop();
  };

  if (!currentTrack) {
    return null;
  }

  // Check if resume is available
  const canResume = resumeInfo !== null && 
    Date.now() < resumeInfo.expiresAt && 
    balance >= currentTrack.price;

  // Get badge info
  const getBadgeClass = () => {
    if (chunkType === 'preview') return 'badge badge-preview';
    if (chunkType === 'paid' || chunkType === 'full') return 'badge badge-paid';
    return '';
  };

  const getBadgeText = () => {
    if (chunkType === 'preview') return 'Preview';
    if (chunkType === 'paid' || chunkType === 'full') return 'Full Access';
    return '';
  };

  return (
    <section className="panel player">
      <div className="now-playing">
        <div className="now-playing-header">
          <span className="label">Now Playing</span>
          {chunkType && (
            <span className={getBadgeClass()}>{getBadgeText()}</span>
          )}
        </div>
        <span className="track-title">{currentTrack.title}</span>
        <span className="track-artist">{currentTrack.artist}</span>
        
        {/* Debug info */}
        {streamState !== 'idle' && (
          <span className="debug-info">
            Stream: {streamState}
            {resumeInfo && ` | Resume expires: ${Math.ceil((resumeInfo.expiresAt - Date.now()) / 60000)}m`}
          </span>
        )}
      </div>

      <audio
        ref={audioRef}
        controls
        onEnded={handleEnded}
        className="audio-element"
      />

      {/* Payment prompt for interrupted streams */}
      {(paymentRequired || (resumeInfo && streamState === 'waiting')) && (
        <div className="payment-prompt">
          <p className="payment-prompt-title">⏸️ Preview Ended</p>
          <p className="payment-prompt-text">
            Add {currentTrack.price} credit(s) to continue listening.
            {resumeInfo && ` Resume available for ${Math.ceil((resumeInfo.expiresAt - Date.now()) / 60000)} min.`}
          </p>
          <button 
            onClick={resumeWithToken}
            disabled={!canResume || isLoading}
            className={`resume-btn ${canResume ? '' : 'disabled'}`}
          >
            {isLoading ? '⏳ Resuming...' : canResume ? '▶️ Resume Playback' : '💰 Insufficient Balance'}
          </button>
        </div>
      )}

      <button onClick={stop} className="stop-btn">
        ⏹️ Stop
      </button>
    </section>
  );
}
