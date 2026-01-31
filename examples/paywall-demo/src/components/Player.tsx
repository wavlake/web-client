import { useRef, useEffect } from 'react';
import { usePlayer } from '../hooks/usePlayer';

export function Player() {
  const { currentTrack, audioUrl, stop } = usePlayer();
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

  return (
    <section className="panel player">
      <div className="now-playing">
        <span className="label">Now Playing</span>
        <span className="track-title">{currentTrack.title}</span>
        <span className="track-artist">{currentTrack.artist}</span>
      </div>

      <audio
        ref={audioRef}
        controls
        onEnded={handleEnded}
        className="audio-element"
      />

      <button onClick={stop} className="stop-btn">
        ⏹️ Stop
      </button>
    </section>
  );
}
