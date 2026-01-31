import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { Track, TrackMetadata, AccessMode } from '../types';

/** Parse a kind 30440 Nostr event into Track */
export function parseTrackEvent(event: NDKEvent): Track | null {
  try {
    const tags = event.tags;
    
    const dTag = getTagValue(tags, 'd') || event.id;
    
    const metadata: TrackMetadata = {
      title: getTagValue(tags, 'title') || getTagValue(tags, 'subject') || 'Untitled',
      artist: getTagValue(tags, 'artist') || 'Unknown Artist',
      album: getTagValue(tags, 'album'),
      genre: getTagValue(tags, 'genre'),
      duration: parseNumber(getTagValue(tags, 'duration')),
      artwork_url: getTagValue(tags, 'image') || getTagValue(tags, 'thumb'),
      audio_url: getTagValue(tags, 'media') || getTagValue(tags, 'url'),
      description: event.content || undefined,
      access_mode: parseAccessMode(getTagValue(tags, 'access_mode')),
      price_credits: parseNumber(getTagValue(tags, 'price')),
    };
    
    return {
      id: event.id,
      pubkey: event.pubkey,
      dTag,
      metadata,
      createdAt: event.created_at || Date.now() / 1000,
    };
  } catch (error) {
    console.error('Failed to parse track event:', error);
    return null;
  }
}

function getTagValue(tags: string[][], tagName: string): string | undefined {
  const tag = tags.find(t => t[0] === tagName);
  return tag?.[1];
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

function parseAccessMode(value: string | undefined): AccessMode | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === 'free' || lower === 'honor' || lower === 'paywall') {
    return lower;
  }
  return undefined;
}
