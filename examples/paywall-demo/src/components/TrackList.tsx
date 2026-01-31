import { useState } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import { useTracks } from '../hooks/useTracks';
import { useWallet } from '@wavlake/paywall-react';
import type { Track } from '../types';

export function TrackList() {
  const { balance, isReady } = useWallet();
  const { play, currentTrack, isLoading } = usePlayer();
  const { tracks, loading, error } = useTracks({ limit: 20 });
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handlePlay = (track: Track) => {
    const price = track.metadata.price_credits || 1;
    play({
      dtag: track.dTag,
      title: track.metadata.title,
      artist: track.metadata.artist,
      price,
      artwork: track.metadata.artwork_url,
    });
  };

  return (
    <section className="panel track-list">
      <h2 className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span>{isCollapsed ? '▶' : '▼'} 🎵 Tracks</span>
        <span className="header-badge">{tracks.length} tracks</span>
      </h2>
      
      {isCollapsed ? null : (
      <>
      {error && (
        <p className="message error">{error.message}</p>
      )}

      {loading && tracks.length === 0 && (
        <p className="hint">Loading tracks from Nostr...</p>
      )}

      {!loading && tracks.length === 0 && (
        <p className="hint">No tracks found</p>
      )}

      <ul>
        {tracks.map((track) => {
          const price = track.metadata.price_credits || 1;
          const isPaywalled = track.metadata.access_mode === 'paywall';
          const isPlaying = currentTrack?.dtag === track.dTag;
          const canAfford = isReady && balance >= price;
          
          return (
            <li key={track.id} className={isPlaying ? 'playing' : ''}>
              <div className="track-row">
                {track.metadata.artwork_url && (
                  <img 
                    src={track.metadata.artwork_url} 
                    alt={track.metadata.title}
                    className="track-artwork"
                  />
                )}
                <div className="track-info">
                  <span className="track-title">{track.metadata.title}</span>
                  <span className="track-artist">{track.metadata.artist}</span>
                </div>
                <div className="track-actions">
                  {isPaywalled && (
                    <span className="track-price">{price}¢</span>
                  )}
                  <button
                    onClick={() => handlePlay(track)}
                    disabled={isLoading || (isPaywalled && !canAfford)}
                    className={isPlaying ? 'playing' : ''}
                  >
                    {isLoading && currentTrack?.dtag === track.dTag
                      ? '⏳'
                      : isPlaying
                      ? '🔊'
                      : '▶️'}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!isReady && <p className="hint">Loading wallet...</p>}
      {isReady && balance === 0 && tracks.some(t => t.metadata.access_mode === 'paywall') && (
        <p className="hint">Add funds to play paywalled tracks</p>
      )}
      </>
      )}
    </section>
  );
}
