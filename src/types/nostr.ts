/**
 * Nostr Event Type Definitions for Wavlake Music
 * Based on NIP-wavlake-music specifications
 */

/**
 * Event kinds used in Wavlake
 */
export enum NostrEventKind {
  // Standard kinds (NIP-01)
  USER_PROFILE = 0,
  TEXT_NOTE = 1,
  
  // Music-specific kinds (custom Wavlake NIPs)
  TRACK_METADATA = 30440,  // A440 Hz reference
  ALBUM_METADATA = 30441,
  ARTIST_PROFILE = 30442,
  MUSIC_PLAYLIST = 30443,
  
  // Social features
  LIKE = 7,
  REPOST = 6,
  ZAP = 9735,
  ZAP_REQUEST = 9734,
}

/** Access mode for track pricing */
export type AccessMode = 'free' | 'honor' | 'paywall';

/**
 * Track metadata content (parsed from kind 30440 event)
 */
export interface TrackMetadata {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  duration?: number; // seconds
  artwork_url?: string;
  audio_url?: string;
  description?: string;
  lyrics?: string;
  access_mode?: AccessMode;
  price_credits?: number;
  tags?: string[];
}

/**
 * Album metadata content (parsed from kind 30441 event)
 */
export interface AlbumMetadata {
  title: string;
  artist: string;
  year?: number;
  genre?: string;
  artwork_url?: string;
  description?: string;
  total_tracks?: number;
  label?: string;
}

/**
 * Artist profile content (parsed from kind 30442 event)
 */
export interface ArtistProfile {
  name: string;
  bio?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string; // Lightning address
  genres?: string[];
}

/**
 * Parsed track with event metadata
 */
export interface Track {
  id: string;  // Event ID
  pubkey: string;
  dTag: string;  // Unique identifier
  metadata: TrackMetadata;
  createdAt: number;
  artistPubkey?: string;
  albumId?: string;
}

/**
 * Parsed album with event metadata
 */
export interface Album {
  id: string;
  pubkey: string;
  dTag: string;
  metadata: AlbumMetadata;
  createdAt: number;
  trackIds: string[];
}

/**
 * Parsed artist profile with event metadata
 */
export interface Artist {
  id: string;
  pubkey: string;
  dTag: string;
  profile: ArtistProfile;
  createdAt: number;
}
