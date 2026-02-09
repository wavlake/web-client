// ============================================================================
// Track Types (Nostr kind 30440)
// ============================================================================

export type AccessMode = 'free' | 'honor' | 'paywall';

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

export interface Track {
  id: string;
  pubkey: string;
  dTag: string;
  metadata: TrackMetadata;
  createdAt: number;
}

// Helper to get track price (for payment)
export function getTrackPrice(track: Track): number {
  return track.metadata.price_credits ?? 1;
}

// Helper to get track dtag (for API calls)
export function getTrackDtag(track: Track): string {
  return track.dTag;
}

// ============================================================================
// Parallel Payment Streaming Types
// ============================================================================

/**
 * Stream state for parallel payment protocol
 * - 'idle': No stream active
 * - 'streaming': Stream connection open, preview bytes flowing
 * - 'paying': Payment POST in flight
 * - 'paid': Payment confirmed, paid bytes flowing
 * - 'error': Stream or payment error
 */
export type StreamState = 'idle' | 'streaming' | 'paying' | 'paid' | 'error';

/**
 * Response headers from the stream endpoint (GET /v1/audio/{dtag}?d={depositID})
 */
export interface StreamHeaders {
  /** Byte offset where preview ends */
  previewEndByte: number;
  /** Track price in credits */
  priceCredits: number;
  /** Cashu mint URL for token validation */
  mintUrl: string;
  /** Total track duration in seconds */
  durationSeconds: number;
}

/**
 * Kind 30444 settlement receipt from POST /pay response
 */
export interface SettlementReceipt {
  kind: 30444;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  id: string;
  sig: string;
}
