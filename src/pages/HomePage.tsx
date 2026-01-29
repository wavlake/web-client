import { useTracks } from '../hooks/useTracks';
import type { Track } from '../types/nostr';

function TrackCard({ track }: { track: Track }) {
  const { metadata } = track;
  const isPaywalled = metadata.access_mode === 'paywall';
  const price = metadata.price_credits;
  
  const handleClick = () => {
    if (isPaywalled) {
      // TODO: Show purchase prompt
      console.log('Paywalled track clicked:', track.id, 'Price:', price);
    } else {
      // TODO: Play track
      console.log('Playing track:', track.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group cursor-pointer rounded-lg bg-surface p-4 transition-colors hover:bg-surface-light"
    >
      {/* Artwork */}
      <div className="relative aspect-square w-full rounded-md bg-surface-light mb-3 overflow-hidden">
        {metadata.artwork_url ? (
          <img
            src={metadata.artwork_url}
            alt={metadata.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
        
        {/* Paywall overlay */}
        {isPaywalled && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="bg-primary px-2 py-1 rounded text-xs font-medium text-white flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
              {price ? `${price} credits` : 'Locked'}
            </div>
          </div>
        )}
      </div>
      
      {/* Track info */}
      <p className="text-sm font-medium text-white truncate">
        {metadata.title}
      </p>
      <p className="text-xs text-gray-500 truncate">
        {metadata.artist}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg bg-surface p-4 animate-pulse"
        >
          <div className="aspect-square w-full rounded-md bg-surface-light mb-3" />
          <div className="h-4 bg-surface-light rounded w-3/4 mb-2" />
          <div className="h-3 bg-surface-light rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { tracks, loading, error } = useTracks({ limit: 50 });

  return (
    <div className="space-y-8 pb-24">
      <section>
        <h1 className="mb-6 text-3xl font-bold text-white">Discover Music</h1>
        <p className="text-gray-400 mb-8">
          Browse music from independent artists on the Nostr network.
        </p>
        
        {error && (
          <div className="text-red-500 mb-4">
            Error loading tracks: {error.message}
          </div>
        )}
        
        {loading && tracks.length === 0 ? (
          <LoadingSkeleton />
        ) : tracks.length === 0 ? (
          <div className="text-gray-400 text-center py-12">
            No tracks found. Check back later!
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {tracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
