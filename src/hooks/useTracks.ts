import { useState, useEffect } from 'react';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK } from '../lib/ndk';
import { parseTrackEvent } from '../lib/parsers';
import { NostrEventKind, type Track } from '../types/nostr';

interface UseTracksOptions {
  limit?: number;
}

interface UseTracksResult {
  tracks: Track[];
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to query and subscribe to track events from Nostr relays
 */
export function useTracks(options: UseTracksOptions = {}): UseTracksResult {
  const { limit = 50 } = options;
  const { ndk, connected } = useNDK();
  
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ndk || !connected) {
      return;
    }

    const filter: NDKFilter = {
      kinds: [NostrEventKind.TRACK_METADATA],
      limit,
    };

    setLoading(true);
    setError(null);

    const subscription = ndk.subscribe(filter, { closeOnEose: false });
    const trackMap = new Map<string, Track>();

    subscription.on('event', (event) => {
      const track = parseTrackEvent(event);
      if (track) {
        // Use dTag as unique key to avoid duplicates
        trackMap.set(track.dTag, track);
        // Sort by createdAt descending and update state
        const sortedTracks = Array.from(trackMap.values())
          .sort((a, b) => b.createdAt - a.createdAt);
        setTracks(sortedTracks);
      }
    });

    subscription.on('eose', () => {
      setLoading(false);
    });

    // Timeout fallback if no eose received
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 10000);

    return () => {
      subscription.stop();
      clearTimeout(timeout);
    };
  }, [ndk, connected, limit]);

  return { tracks, loading, error };
}
