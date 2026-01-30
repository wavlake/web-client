import { useState } from 'react';
import { useTracks } from '../hooks/useTracks';
import { useContentAccess } from '../hooks/useContentAccess';
import { debugLog } from '../stores/debug';
import { usePlayerStore } from '../stores/player';
import { useWalletStore } from '../stores/wallet';
import { useTokenCacheStore } from '../stores/tokenCache';
import PaymentModal from './PaymentModal';
import type { Track } from '../types/nostr';

interface PaymentState {
  track: Track;
  price: number;
}

function TrackItem({ 
  track, 
  onPlay, 
  isCurrentTrack,
  isPlaying,
}: { 
  track: Track; 
  onPlay: (track: Track) => void;
  isCurrentTrack: boolean;
  isPlaying: boolean;
}) {
  const { metadata } = track;
  const isPaywalled = metadata.access_mode === 'paywall';
  const price = metadata.price_credits;

  return (
    <button
      onClick={() => onPlay(track)}
      className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-light transition-colors text-left group ${
        isCurrentTrack ? 'bg-surface-light' : ''
      }`}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded bg-surface-light flex-none overflow-hidden relative">
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
        {isCurrentTrack && isPlaying && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex gap-0.5">
              <div className="w-1 h-3 bg-primary animate-pulse" />
              <div className="w-1 h-4 bg-primary animate-pulse delay-75" />
              <div className="w-1 h-2 bg-primary animate-pulse delay-150" />
            </div>
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isCurrentTrack ? 'text-primary' : 'text-white'}`}>
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
  const { checkAccess, purchaseAccess, singleRequestAccess, getTokenCacheStatus } = useContentAccess();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const selectProofsForAmount = useWalletStore((s) => s.selectProofsForAmount);
  const tokenCount = useTokenCacheStore((s) => s.tokens.length);
  
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePlay = async (track: Track) => {
    const isPaywalled = track.metadata.access_mode === 'paywall';
    const cacheStatus = getTokenCacheStatus();
    
    debugLog('event', `Track clicked: ${track.metadata.title}`, {
      trackId: track.id,
      dTag: track.dTag,
      isPaywalled,
      price: track.metadata.price_credits,
      tokenCacheCount: cacheStatus.tokenCount,
      mode: isPaywalled && cacheStatus.tokenCount > 0 ? 'SINGLE-REQUEST' : 'STANDARD',
    });

    // For paywalled tracks with cached tokens, use single-request mode (fastest)
    if (isPaywalled && cacheStatus.tokenCount > 0) {
      debugLog('event', '⚡ Using SINGLE-REQUEST mode');
      const result = await singleRequestAccess(track);
      
      if (result.success) {
        play(track, result.url);
        return;
      }
      
      if (result.requiresPayment) {
        // Token was rejected or insufficient, show payment modal
        setPaymentState({
          track,
          price: result.priceCredits,
        });
        return;
      }
      
      debugLog('error', 'Single-request access failed', { error: 'error' in result ? result.error : 'unknown' });
      return;
    }

    // Standard flow: check access first
    const result = await checkAccess(track);

    if (result.success) {
      // Free track or already purchased - play it
      play(track, result.url);
      return;
    }

    if (result.requiresPayment) {
      // Show payment modal
      setPaymentState({
        track,
        price: result.priceCredits,
      });
      return;
    }

    // Error
    debugLog('error', 'Access check failed', { error: 'error' in result ? result.error : 'unknown' });
  };

  const handlePaymentConfirm = async () => {
    if (!paymentState) return;

    setIsProcessing(true);
    const { track, price } = paymentState;

    // Select proofs for payment
    const proofs = selectProofsForAmount(price);
    if (!proofs || proofs.length === 0) {
      debugLog('error', 'No proofs available for payment');
      setIsProcessing(false);
      return;
    }

    debugLog('wallet', `Spending ${price} credits`, {
      proofCount: proofs.length,
      proofAmounts: proofs.map(p => p.amount),
    });

    // Make payment
    const result = await purchaseAccess(track, proofs);

    if (result.success) {
      // Payment successful - play track
      play(track, result.url);
      setPaymentState(null);
    } else {
      debugLog('error', 'Payment failed', { result });
    }

    setIsProcessing(false);
  };

  const handlePaymentCancel = () => {
    setPaymentState(null);
  };

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
    <>
      <div className="space-y-1">
        {tracks.map((track) => (
          <TrackItem 
            key={track.id} 
            track={track} 
            onPlay={handlePlay}
            isCurrentTrack={currentTrack?.id === track.id}
            isPlaying={isPlaying && currentTrack?.id === track.id}
          />
        ))}
      </div>

      {/* Payment Modal */}
      {paymentState && (
        <PaymentModal
          track={paymentState.track}
          price={paymentState.price}
          onConfirm={handlePaymentConfirm}
          onCancel={handlePaymentCancel}
          isProcessing={isProcessing}
        />
      )}
    </>
  );
}
