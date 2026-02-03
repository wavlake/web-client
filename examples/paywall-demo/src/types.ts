/** Access mode for track pricing */
export type AccessMode = 'free' | 'honor' | 'paywall';

/** Track metadata from Nostr event */
export interface TrackMetadata {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  duration?: number;
  artwork_url?: string;
  audio_url?: string;
  description?: string;
  access_mode?: AccessMode;
  price_credits?: number;
}

/** Parsed track from kind 30440 event */
export interface Track {
  id: string;
  pubkey: string;
  dTag: string;
  metadata: TrackMetadata;
  createdAt: number;
}

// Re-export two-chunk types from SDK for convenience
export type { ChunkType, TwoChunkInfo } from '@wavlake/paywall-client';
