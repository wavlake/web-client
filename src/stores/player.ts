import { create } from 'zustand';
import { debugLog } from './debug';
import type { Track } from '../types/nostr';

interface PlayerState {
  // Current track
  currentTrack: Track | null;
  signedUrl: string | null;
  
  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  
  // Audio element reference
  audioElement: HTMLAudioElement | null;
  
  // Loading/error states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setAudioElement: (el: HTMLAudioElement | null) => void;
  play: (track: Track, signedUrl: string) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  updateTime: (time: number, duration: number) => void;
  setError: (error: string | null) => void;
  stop: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  signedUrl: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  audioElement: null,
  isLoading: false,
  error: null,

  setAudioElement: (el) => {
    set({ audioElement: el });
  },

  play: (track, signedUrl) => {
    const { audioElement } = get();
    
    debugLog('player', `Playing: ${track.metadata.title}`, {
      trackId: track.id,
      dTag: track.dTag,
      signedUrlLength: signedUrl.length,
    });
    
    set({
      currentTrack: track,
      signedUrl,
      isLoading: true,
      error: null,
    });

    if (audioElement) {
      audioElement.src = signedUrl;
      audioElement.play()
        .then(() => {
          debugLog('player', 'Playback started');
          set({ isPlaying: true, isLoading: false });
        })
        .catch((err) => {
          debugLog('error', 'Playback failed', { error: err.message });
          set({ isPlaying: false, isLoading: false, error: err.message });
        });
    }
  },

  pause: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      debugLog('player', 'Paused');
      set({ isPlaying: false });
    }
  },

  resume: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.play()
        .then(() => {
          debugLog('player', 'Resumed');
          set({ isPlaying: true });
        })
        .catch((err) => {
          debugLog('error', 'Resume failed', { error: err.message });
          set({ error: err.message });
        });
    }
  },

  seek: (time) => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.currentTime = time;
      debugLog('player', `Seek to ${time}s`);
    }
  },

  updateTime: (currentTime, duration) => {
    set({ currentTime, duration });
  },

  setError: (error) => {
    if (error) {
      debugLog('error', 'Player error', { error });
    }
    set({ error, isLoading: false });
  },

  stop: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }
    set({
      currentTrack: null,
      signedUrl: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
    debugLog('player', 'Stopped');
  },
}));
