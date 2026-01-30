import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/player';

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const setAudioElement = usePlayerStore((s) => s.setAudioElement);
  const updateTime = usePlayerStore((s) => s.updateTime);
  const setError = usePlayerStore((s) => s.setError);
  
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const error = usePlayerStore((s) => s.error);
  
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const seek = usePlayerStore((s) => s.seek);
  const stop = usePlayerStore((s) => s.stop);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setAudioElement(audio);

    const handleTimeUpdate = () => {
      updateTime(audio.currentTime, audio.duration || 0);
    };

    const handleError = () => {
      setError(audio.error?.message || 'Playback error');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', handleError);
    };
  }, [setAudioElement, updateTime, setError]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  return (
    <div className="h-full flex items-center gap-4">
      {/* Hidden audio element */}
      <audio ref={audioRef} />

      {/* Track info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {currentTrack?.metadata.artwork_url ? (
          <img
            src={currentTrack.metadata.artwork_url}
            alt={currentTrack.metadata.title}
            className="w-12 h-12 rounded object-cover flex-none"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-surface-light flex items-center justify-center flex-none">
            {currentTrack ? '🎵' : ''}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white truncate">
            {currentTrack?.metadata.title || 'No track playing'}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {currentTrack?.metadata.artist || 'Select a track to start'}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={stop}
          disabled={!currentTrack}
          className="text-gray-400 hover:text-white disabled:opacity-30"
        >
          ⏹
        </button>
        <button
          onClick={isPlaying ? pause : resume}
          disabled={!currentTrack}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isLoading ? '⏳' : isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <span className="text-xs text-gray-500 w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          disabled={!currentTrack}
          className="flex-1 h-1 bg-surface-light rounded-lg appearance-none cursor-pointer disabled:opacity-30"
        />
        <span className="text-xs text-gray-500 w-10">
          {formatTime(duration)}
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="text-red-400 text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
