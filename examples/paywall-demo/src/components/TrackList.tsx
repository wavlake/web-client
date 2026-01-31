import { useState } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import { useWallet } from '@wavlake/paywall-react';

export function TrackList() {
  const { balance, isReady } = useWallet();
  const { play, currentTrack, isLoading, error } = usePlayer();
  
  // Custom track input
  const [customDtag, setCustomDtag] = useState('');
  const [customPrice, setCustomPrice] = useState('1');

  const handlePlayCustom = () => {
    if (!customDtag.trim()) return;
    
    const track = {
      dtag: customDtag.trim(),
      title: `Track: ${customDtag.substring(0, 8)}...`,
      artist: 'Unknown',
      price: parseInt(customPrice, 10) || 1,
    };
    
    play(track);
  };

  const canAffordCustom = isReady && balance >= (parseInt(customPrice, 10) || 1);

  return (
    <section className="panel track-list">
      <h2>🎵 Play Track</h2>
      
      {error && (
        <p className="message error">{error.message}</p>
      )}

      <div className="custom-track-form">
        <input
          type="text"
          placeholder="Track d-tag (UUID)"
          value={customDtag}
          onChange={(e) => setCustomDtag(e.target.value)}
          disabled={isLoading}
          className="dtag-input"
        />
        <div className="price-row">
          <label>
            Price:
            <input
              type="number"
              min="1"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              disabled={isLoading}
              className="price-input"
            />
            credits
          </label>
          <button
            onClick={handlePlayCustom}
            disabled={isLoading || !canAffordCustom || !customDtag.trim()}
            className="play-btn"
          >
            {isLoading ? '⏳ Loading...' : '▶️ Play'}
          </button>
        </div>
      </div>

      {currentTrack && (
        <div className="now-playing-info">
          <span>Now playing: {currentTrack.dtag}</span>
        </div>
      )}

      {!isReady && <p className="hint">Loading wallet...</p>}
      {isReady && balance === 0 && (
        <p className="hint">Add funds to your wallet to play tracks</p>
      )}
    </section>
  );
}
