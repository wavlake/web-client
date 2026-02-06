import { useState, useEffect, useRef } from 'react';
import { useTracks } from '../hooks/useTracks';
import { useContentAccess } from '../hooks/useContentAccess';
import { debugLog } from '../stores/debug';
import { usePlayerStore } from '../stores/player';
import { useWalletStore } from '../stores/wallet';
import { useSettingsStore } from '../stores/settings';
import { CONFIG } from '../lib/config';
import { 
  prebuildFromTracks, 
  getTokenForAmount, 
  hasTokenForAmount,
  clearSmartTokens,
} from '../lib/smartPrebuild';
import { jitSwap } from '../lib/jitSwap';
import { getEncodedTokenV4 } from '@cashu/cashu-ts';
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
  const addProofs = useWalletStore((s) => s.addProofs);
  const removeProofs = useWalletStore((s) => s.removeProofs);
  const walletBalance = useWalletStore((s) => s.getBalance());
  const prebuildEnabled = useSettingsStore((s) => s.prebuildEnabled);
  const jitSwapEnabled = useSettingsStore((s) => s.jitSwapEnabled);
  
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Track if we've already prebuilt for this track list
  const prebuildDoneRef = useRef(false);
  const lastPrebuildSetting = useRef(prebuildEnabled);

  // Smart prebuild: when tracks load and prebuild is enabled, prebuild tokens for their prices
  useEffect(() => {
    // If prebuild was just disabled, clear existing tokens
    if (!prebuildEnabled && lastPrebuildSetting.current) {
      debugLog('smartPrebuild', 'Prebuild disabled, clearing tokens');
      clearSmartTokens();
      prebuildDoneRef.current = false;
    }
    lastPrebuildSetting.current = prebuildEnabled;
    
    if (!prebuildEnabled) return;
    if (loading || tracks.length === 0) return;
    if (prebuildDoneRef.current) return;
    if (walletBalance === 0) return;
    
    prebuildDoneRef.current = true;
    debugLog('smartPrebuild', 'Tracks loaded, starting smart prebuild...', {
      trackCount: tracks.length,
      balance: walletBalance,
    });
    
    prebuildFromTracks(tracks).catch((err) => {
      debugLog('error', 'Smart prebuild failed', { error: err.message });
    });
  }, [loading, tracks, walletBalance, prebuildEnabled]);

  const handlePlay = async (track: Track) => {
    const isPaywalled = track.metadata.access_mode === 'paywall';
    const price = track.metadata.price_credits || 0;
    const cacheStatus = getTokenCacheStatus();
    const hasSmartToken = prebuildEnabled && hasTokenForAmount(price);
    
    const mode = !isPaywalled ? 'FREE' :
                 hasSmartToken ? 'PREBUILD' :
                 prebuildEnabled && cacheStatus.tokenCount > 0 ? 'CACHE' :
                 !prebuildEnabled ? 'JIT' : 'STANDARD';
    
    debugLog('event', `Track clicked: ${track.metadata.title}`, {
      trackId: track.id,
      dTag: track.dTag,
      isPaywalled,
      price,
      prebuildEnabled,
      hasSmartToken,
      mode,
    });

    // PREBUILD MODE: Use smart prebuild tokens (exact denomination)
    if (isPaywalled && hasSmartToken) {
      debugLog('event', `⚡ Using PREBUILD token (${price} credits)`);
      const smartToken = getTokenForAmount(price);
      
      if (smartToken) {
        const url = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
        const startTime = performance.now();
        
        debugLog('request', `GET ${url} [PREBUILD MODE]`, {
          trackId: track.id,
          dTag: track.dTag,
          payment: {
            tokenAmount: smartToken.amount,
            trackPrice: price,
            unit: 'usd',
          },
          headers: {
            'X-Ecash-Token': smartToken.token.slice(0, 30) + '...',
          },
        });
        
        try {
          const response = await fetch(url, {
            headers: { 'X-Ecash-Token': smartToken.token },
          });
          
          const elapsed = performance.now() - startTime;
          
          if (response.ok) {
            const data = await response.json();
            const contentUrl = data.data?.url || data.url;
            debugLog('response', `PREBUILD success in ${elapsed.toFixed(0)}ms`, { url: contentUrl?.slice(0, 50) });
            play(track, contentUrl);
            return;
          }
          
          debugLog('error', `PREBUILD request failed: ${response.status}`);
        } catch (err) {
          debugLog('error', 'PREBUILD request error', { error: err instanceof Error ? err.message : 'unknown' });
        }
      }
    }

    // CACHE MODE: Use 1-credit token cache (for 1-credit tracks only)
    if (isPaywalled && prebuildEnabled && price === 1 && cacheStatus.tokenCount > 0) {
      debugLog('event', '⚡ Using CACHE mode (1-credit)');
      const result = await singleRequestAccess(track);
      
      if (result.success) {
        play(track, result.url);
        return;
      }
      
      if (result.requiresPayment) {
        setPaymentState({ track, price: result.priceCredits });
        return;
      }
      
      debugLog('error', 'CACHE mode failed', { error: 'error' in result ? result.error : 'unknown' });
      return;
    }

    // DIRECT PAYMENT MODE: Send proofs, receive change from server (when prebuild disabled, JIT swap disabled)
    if (isPaywalled && !prebuildEnabled && !jitSwapEnabled && walletBalance >= price) {
      debugLog('event', `💸 Using DIRECT mode - sending proofs, expecting server-side change`);
      const startTime = performance.now();
      
      // Select proofs that cover the amount (may be more than needed)
      const selection = selectProofsForAmount(price);
      if (selection) {
        const proofs = selection.selected;
        try {
          const totalSending = proofs.reduce((s, p) => s + p.amount, 0);
          
          // Encode proofs as token
          const token = getEncodedTokenV4({
            mint: CONFIG.MINT_URL,
            proofs,
            unit: 'usd',
          });
          
          const url = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
          
          debugLog('request', `GET ${url} [DIRECT MODE]`, {
            trackId: track.id,
            dTag: track.dTag,
            payment: {
              tokenAmount: totalSending,
              trackPrice: price,
              expectedChange: totalSending - price,
              unit: 'usd',
            },
            headers: {
              'X-Ecash-Token': token.slice(0, 30) + '...',
            },
          });
          
          const response = await fetch(url, {
            headers: { 'X-Ecash-Token': token },
          });
          
          const elapsed = performance.now() - startTime;
          
          if (response.ok) {
            const data = await response.json();
            const contentUrl = data.data?.url || data.url;
            
            // Remove sent proofs from wallet
            const sentSecrets = proofs.map(p => p.secret);
            removeProofs(sentSecrets);
            
            // Handle change proofs from server (if returned)
            const changeProofs = data.data?.change || data.change || [];
            let changeAmount = 0;
            if (changeProofs.length > 0) {
              addProofs(changeProofs);
              changeAmount = changeProofs.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
              debugLog('wallet', 'Received change proofs from server', {
                changeProofCount: changeProofs.length,
                changeAmount,
              });
            }
            
            debugLog('response', `DIRECT success in ${elapsed.toFixed(0)}ms`, { 
              url: contentUrl?.slice(0, 50),
              sent: totalSending,
              price,
              changeReceived: changeAmount,
            });
            play(track, contentUrl);
            return;
          }
          
          if (response.status === 402) {
            const data = await response.json();
            debugLog('error', 'DIRECT payment rejected', { status: 402, data });
            setPaymentState({ track, price: data.price_credits || price });
            return;
          }
          
          debugLog('error', `DIRECT request failed: ${response.status}`);
        } catch (err) {
          debugLog('error', 'DIRECT payment error', { 
            error: err instanceof Error ? err.message : 'unknown' 
          });
        }
      }
    }

    // JIT SWAP MODE: Client-side swap before payment (when prebuild disabled, JIT swap enabled)
    if (isPaywalled && !prebuildEnabled && jitSwapEnabled && walletBalance >= price) {
      debugLog('event', `🔄 Using JIT SWAP mode - swapping ${price} credits client-side first`);
      const startTime = performance.now();
      
      // Select proofs that cover the amount
      const selection = selectProofsForAmount(price);
      if (selection) {
        const proofs = selection.selected;
        try {
          // Swap to exact denomination, keeping change
          const swapResult = await jitSwap(price, proofs);
          
          // Update wallet: remove original proofs, add back change
          const originalSecrets = proofs.map(p => p.secret);
          removeProofs(originalSecrets);
          if (swapResult.keepProofs.length > 0) {
            addProofs(swapResult.keepProofs);
          }
          
          // Make the payment request with exact-amount token
          const url = `${CONFIG.API_BASE_URL}/api/v1/content/${track.dTag}`;
          
          debugLog('request', `GET ${url} [JIT SWAP MODE]`, {
            trackId: track.id,
            dTag: track.dTag,
            payment: {
              tokenAmount: swapResult.sendAmount,
              trackPrice: price,
              changeKept: swapResult.keepAmount,
              unit: 'usd',
            },
            headers: {
              'X-Ecash-Token': swapResult.token.slice(0, 30) + '...',
            },
          });
          
          const response = await fetch(url, {
            headers: { 'X-Ecash-Token': swapResult.token },
          });
          
          const elapsed = performance.now() - startTime;
          
          if (response.ok) {
            const data = await response.json();
            const contentUrl = data.data?.url || data.url;
            debugLog('response', `JIT SWAP success in ${elapsed.toFixed(0)}ms`, { 
              url: contentUrl?.slice(0, 50),
              paid: swapResult.sendAmount,
              changeKept: swapResult.keepAmount,
            });
            play(track, contentUrl);
            return;
          }
          
          if (response.status === 402) {
            const data = await response.json();
            debugLog('error', 'JIT SWAP payment rejected', { status: 402, data });
            setPaymentState({ track, price: data.price_credits || price });
            return;
          }
          
          debugLog('error', `JIT SWAP request failed: ${response.status}`);
        } catch (err) {
          debugLog('error', 'JIT SWAP error', { 
            error: err instanceof Error ? err.message : 'unknown' 
          });
        }
      }
    }

    // STANDARD MODE: Check access first (for free tracks or when no balance)
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
    const selection = selectProofsForAmount(price);
    if (!selection || selection.selected.length === 0) {
      debugLog('error', 'No proofs available for payment');
      setIsProcessing(false);
      return;
    }

    const proofs = selection.selected;
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
