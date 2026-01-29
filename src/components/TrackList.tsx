import { useTracks } from '../hooks/useTracks';
import { debugLog } from '../stores/debug';
import type { Track } from '../types/nostr';

function TrackItem({ track }: { track: Track }) {
  const { metadata } = track;
  const isPaywalled = metadata.access_mode === 'paywall';
  const price = metadata.price_credits;

  const handleClick = () => {
    debugLog('event', `Track clicked: ${metadata.title}`, {
      trackId: track.id,
      dTag: track.dTag,
      isPaywalled,
      price,
    });

    if (isPaywalled) {
      debugLog('player', `Paywalled track - payment required`, {
        price,
      });
    } else {
      debugLog('player', `Loading track: ${metadata.title}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-light transition-colors text-left group"
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded bg-surface-light flex-none overflow-hidden">
        {metadata.artwork_url ? (
          <img
            src={metadata.artwork_url}
            alt={metadata.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">
          {metadata.title}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {metadata.artist}
        </p>
      </div>

      {/* Paywall badge */}
      {isPaywalled && (
        <div className="flex-none">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
            {price}
          </span>
        </div>
      )}
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-2 animate-pulse"
        >
          <div className="w-10 h-10 rounded bg-surface-light" />
          <div className="flex-1">
            <div className="h-3 bg-surface-light rounded w-3/4 mb-1.5" />
            <div className="h-2.5 bg-surface-light rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TrackList() {
  const { tracks, loading, error } = useTracks({ limit: 50 });

  if (error) {
    return (
      <div className="text-red-400 text-xs p-2">
        Error: {error.message}
      </div>
    );
  }

  if (loading && tracks.length === 0) {
    return <LoadingSkeleton />;
  }

  if (tracks.length === 0) {
    return (
      <div className="text-gray-500 text-xs text-center py-4">
        No tracks found
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tracks.map((track) => (
        <TrackItem key={track.id} track={track} />
      ))}
    </div>
  );
}
