import React, { ReactNode, useState, useEffect } from 'react';
import { DebugPanel, JsonViewer } from './DebugPanel';
import { DebugLog } from './DebugLog';
import { LoginModal } from './LoginModal';
import { debugLog } from '../stores/debug';
import { useWalletStore } from '../stores/wallet';
import { usePlayerStore } from '../stores/player';
import { useTokenCacheStore } from '../stores/tokenCache';
import { PurchasePanel } from './PurchasePanel';
import AudioPlayer from './AudioPlayer';

interface DebugLayoutProps {
  trackList: ReactNode;
}

// Wallet panel connected to real store
function WalletPanel() {
  const proofs = useWalletStore(state => state.proofs);
  const pendingProofs = useWalletStore(state => state.pendingProofs);
  const balance = useWalletStore(state => state.getBalance());
  const reset = useWalletStore(state => state.reset);

  return (
    <DebugPanel title="Wallet State">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Balance</span>
          <span className="text-sm font-mono text-green-400">{balance} credits</span>
        </div>
        <div>
          <span className="text-xs text-gray-400 block mb-1">Proofs ({proofs.length})</span>
          {proofs.length > 0 ? (
            <JsonViewer data={proofs.map(p => ({ amount: p.amount, id: p.id?.slice(0, 8) }))} maxHeight="100px" />
          ) : (
            <span className="text-xs text-gray-500">No proofs loaded</span>
          )}
        </div>
        {pendingProofs.length > 0 && (
          <div>
            <span className="text-xs text-yellow-400 block mb-1">Pending ({pendingProofs.length})</span>
            <JsonViewer data={pendingProofs.map(p => ({ amount: p.amount }))} maxHeight="60px" />
          </div>
        )}
        {proofs.length > 0 && (
          <button
            onClick={reset}
            className="w-full py-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            🗑 Clear Wallet
          </button>
        )}
      </div>
    </DebugPanel>
  );
}

// Token Cache panel - shows single-request mode status
function TokenCachePanel() {
  const tokens = useTokenCacheStore(state => state.tokens);
  const isWalletReady = useTokenCacheStore(state => state.isWalletReady);
  const isBuilding = useTokenCacheStore(state => state.isBuilding);
  const error = useTokenCacheStore(state => state.error);
  const prebuildTokens = useTokenCacheStore(state => state.prebuildTokens);
  const clear = useTokenCacheStore(state => state.clear);
  const walletBalance = useWalletStore(state => state.getBalance());

  const handleBuild = async () => {
    debugLog('tokenCache', 'Manual token build triggered');
    const built = await prebuildTokens(5);
    debugLog('tokenCache', `Built ${built} tokens`);
  };

  return (
    <DebugPanel title="⚡ Token Cache (Single-Request)">
      <div className="space-y-3">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            tokens.length > 0 ? 'bg-green-400' : 
            isBuilding ? 'bg-yellow-400 animate-pulse' : 
            'bg-gray-500'
          }`} />
          <span className="text-xs text-gray-400">
            {tokens.length > 0 ? 'Ready for single-request' :
             isBuilding ? 'Building tokens...' :
             'No tokens cached'}
          </span>
        </div>

        {/* Token count */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Cached Tokens</span>
          <span className="text-sm font-mono text-primary">{tokens.length}</span>
        </div>

        {/* Wallet status */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Wallet</span>
          <span className={`text-xs ${isWalletReady ? 'text-green-400' : 'text-gray-500'}`}>
            {isWalletReady ? '✓ Ready' : '○ Not initialized'}
          </span>
        </div>

        {/* Available for building */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Available to build</span>
          <span className="text-xs text-gray-300">{walletBalance} credits</span>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 p-2 bg-red-400/10 rounded">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleBuild}
            disabled={isBuilding || walletBalance === 0}
            className="flex-1 py-1.5 text-xs bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBuilding ? 'Building...' : 'Build Tokens'}
          </button>
          {tokens.length > 0 && (
            <button
              onClick={clear}
              className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Info box */}
        <div className="text-[10px] text-gray-500 p-2 bg-surface rounded">
          ⚡ Single-request mode: Pre-built tokens skip 402 discovery + mint swap.
          Target latency: ~120ms vs ~500ms cold.
        </div>
      </div>
    </DebugPanel>
  );
}

// API Config panel
function ApiConfigPanel() {
  const [apiUrl, setApiUrl] = useState('https://api.wavlake.com');

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiUrl(e.target.value);
    debugLog('event', 'API URL changed', { url: e.target.value });
  };

  return (
    <DebugPanel title="API Config">
      <div className="space-y-2">
        <label className="text-xs text-gray-400 block">API Base URL</label>
        <input
          type="text"
          value={apiUrl}
          onChange={handleUrlChange}
          className="w-full px-2 py-1.5 text-xs font-mono bg-background border border-surface-light rounded text-white focus:outline-none focus:border-primary"
        />
      </div>
    </DebugPanel>
  );
}

// Now playing area with player state
function NowPlaying() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const signedUrl = usePlayerStore((s) => s.signedUrl);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="w-48 h-48 rounded-lg bg-surface-light mb-6 flex items-center justify-center">
          <svg className="w-16 h-16 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
        <p className="text-gray-400 text-sm mb-2">No track selected</p>
        <p className="text-gray-500 text-xs">Select a track from the list to start</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Album art */}
      <div className="w-48 h-48 rounded-lg bg-surface-light mb-6 overflow-hidden shadow-lg">
        {currentTrack.metadata.artwork_url ? (
          <img
            src={currentTrack.metadata.artwork_url}
            alt={currentTrack.metadata.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl">🎵</span>
          </div>
        )}
      </div>
      
      {/* Track info */}
      <h2 className="text-xl font-bold text-white mb-1">{currentTrack.metadata.title}</h2>
      <p className="text-gray-400 mb-4">{currentTrack.metadata.artist}</p>
      
      {/* Playing indicator */}
      {isPlaying && (
        <div className="flex items-center gap-1 text-primary">
          <div className="flex gap-0.5">
            <div className="w-1 h-4 bg-primary animate-pulse" />
            <div className="w-1 h-6 bg-primary animate-pulse delay-75" />
            <div className="w-1 h-3 bg-primary animate-pulse delay-150" />
            <div className="w-1 h-5 bg-primary animate-pulse delay-200" />
          </div>
          <span className="text-sm ml-2">Now Playing</span>
        </div>
      )}
      
      {/* Debug: Show signed URL (truncated) */}
      {signedUrl && (
        <div className="mt-4 p-2 bg-surface rounded text-xs font-mono text-gray-500 max-w-md truncate">
          URL: {signedUrl.slice(0, 60)}...
        </div>
      )}
    </div>
  );
}

export default function DebugLayout({ trackList }: DebugLayoutProps) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Check for existing login on mount
  useEffect(() => {
    const stored = localStorage.getItem('nostr_pubkey');
    if (stored) {
      setPubkey(stored);
      debugLog('event', 'Restored pubkey from storage', { pubkey: stored.slice(0, 16) + '...' });
    }
  }, []);

  const handleConnect = () => {
    if (pubkey) {
      // Logout
      localStorage.removeItem('nostr_pubkey');
      localStorage.removeItem('nostr_privkey');
      setPubkey(null);
      debugLog('event', 'User logged out');
      return;
    }

    // Show login modal
    setShowLoginModal(true);
  };

  const handleLogin = (newPubkey: string, privkey?: string) => {
    localStorage.setItem('nostr_pubkey', newPubkey);
    if (privkey) {
      localStorage.setItem('nostr_privkey', privkey);
    }
    setPubkey(newPubkey);
    debugLog('event', 'User logged in', { 
      pubkey: newPubkey.slice(0, 16) + '...',
      method: privkey ? 'nsec' : 'NIP-07'
    });
  };

  const shortPubkey = pubkey ? `${pubkey.slice(0, 8)}...` : null;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
      />

      {/* Header */}
      <header className="flex-none border-b border-surface-light bg-surface/80 backdrop-blur-sm">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎵</span>
            <span className="text-lg font-bold text-white">Wavlake</span>
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">
              DEBUG
            </span>
          </div>
          <div>
            <button 
              onClick={handleConnect}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 transition-colors"
            >
              {pubkey ? shortPubkey : 'Connect'}
            </button>
          </div>
        </div>
      </header>

      {/* Main 3-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Track list (narrow) */}
        <aside className="w-72 flex-none border-r border-surface-light overflow-auto bg-surface/30">
          <div className="p-3">
            <h2 className="text-sm font-medium text-white mb-3">Tracks</h2>
            {trackList}
          </div>
        </aside>

        {/* Center: Now playing area */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-auto">
            <NowPlaying />
          </div>
          {/* Audio player controls */}
          <div className="flex-none h-20 border-t border-surface-light bg-surface px-4">
            <AudioPlayer />
          </div>
        </main>

        {/* Right: Debug panels */}
        <aside className="w-80 flex-none border-l border-surface-light overflow-auto bg-surface/30">
          <div className="p-3 space-y-3">
            <h2 className="text-sm font-medium text-white">Debug Panels</h2>
            <TokenCachePanel />
            <PurchasePanel />
            <WalletPanel />
            <ApiConfigPanel />
          </div>
        </aside>
      </div>

      {/* Bottom: Debug log stream */}
      <div className="flex-none h-48 relative">
        <DebugLog />
      </div>
    </div>
  );
}
