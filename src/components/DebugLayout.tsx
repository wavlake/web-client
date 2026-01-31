import React, { ReactNode, useState } from 'react';
import { DebugPanel, JsonViewer } from './DebugPanel';
import { DebugLog } from './DebugLog';
import { LoginModal } from './LoginModal';
import { debugLog } from '../stores/debug';
import { useWalletStore } from '../stores/wallet';
import { usePlayerStore } from '../stores/player';
import { useTokenCacheStore } from '../stores/tokenCache';
import { useSettingsStore } from '../stores/settings';
import { useAuthStore } from '../stores/auth';
import { useNDK } from '../lib/ndk';
import { useWallet } from '../lib/wallet';
import { PurchasePanel } from './PurchasePanel';
import AudioPlayer from './AudioPlayer';
import { getDecodedToken, type Token } from '@cashu/cashu-ts';

interface DebugLayoutProps {
  trackList: ReactNode;
}

// Wallet panel connected to real store with token import
function WalletPanel() {
  // Use the new wallet context
  const { balance, proofs, isReady, isSyncing, storageMode, error: walletError, reload, addProofs: addProofsToWallet } = useWallet();
  
  // Also keep the old store for backward compatibility during transition
  const storeProofs = useWalletStore(state => state.proofs);
  const pendingProofs = useWalletStore(state => state.pendingProofs);
  const storeBalance = useWalletStore(state => state.getBalance());
  const storeAddProofs = useWalletStore(state => state.addProofs);
  const reset = useWalletStore(state => state.reset);
  
  // Use the new wallet context when available, fall back to store
  const displayBalance = isReady ? balance : storeBalance;
  const displayProofs = isReady ? proofs : storeProofs;
  
  const addProofs = async (newProofs: typeof proofs) => {
    if (isReady) {
      await addProofsToWallet(newProofs);
    } else {
      storeAddProofs(newProofs);
    }
  };

  const [tokenInput, setTokenInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedProofIndex, setSelectedProofIndex] = useState<number | null>(null);

  const handleImportToken = async () => {
    setImportError(null);
    setImportSuccess(null);

    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setImportError('Please enter a token');
      return;
    }

    // Validate token format
    if (!trimmed.startsWith('cashuA') && !trimmed.startsWith('cashuB')) {
      setImportError('Invalid token format. Must start with cashuA or cashuB');
      return;
    }

    try {
      debugLog('wallet', 'Attempting to decode token', { 
        prefix: trimmed.slice(0, 10),
        length: trimmed.length 
      });

      const decoded: Token = getDecodedToken(trimmed);
      
      // Extract proofs from the decoded token
      // Token structure: { mint: string, proofs: Proof[], unit?: string }
      // or for v3: { token: [{ mint, proofs }] }
      let importedProofs: typeof proofs = [];
      
      if ('proofs' in decoded && Array.isArray(decoded.proofs)) {
        // v4 format
        importedProofs = decoded.proofs;
      } else if ('token' in decoded && Array.isArray((decoded as { token: { proofs: typeof proofs }[] }).token)) {
        // v3 format
        const v3 = decoded as { token: { proofs: typeof proofs }[] };
        importedProofs = v3.token.flatMap(t => t.proofs);
      }

      if (importedProofs.length === 0) {
        setImportError('No proofs found in token');
        return;
      }

      const totalAmount = importedProofs.reduce((sum, p) => sum + p.amount, 0);
      
      debugLog('wallet', 'Token decoded successfully', {
        proofCount: importedProofs.length,
        totalAmount,
        proofs: importedProofs.map(p => ({ amount: p.amount, id: p.id }))
      });

      addProofs(importedProofs);
      setImportSuccess(`Imported ${importedProofs.length} proof(s) totaling ${totalAmount} credits`);
      setTokenInput('');
      
      // Clear success message after 3s
      setTimeout(() => setImportSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to decode token';
      debugLog('error', 'Token import failed', { error: message });
      setImportError(message);
    }
  };

  return (
    <DebugPanel title="Wallet State">
      <div className="space-y-3">
        {/* Storage mode indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${storageMode === 'nostr' ? 'text-purple-400' : 'text-gray-400'}`}>
              {storageMode === 'nostr' ? '☁️ Nostr' : '💾 Local'}
            </span>
            {isSyncing && (
              <span className="text-[10px] text-yellow-400 animate-pulse">syncing...</span>
            )}
          </div>
          {storageMode === 'nostr' && isReady && (
            <button
              onClick={reload}
              disabled={isSyncing}
              className="text-[10px] text-purple-400 hover:text-purple-300 disabled:opacity-50"
            >
              ↻ Refresh
            </button>
          )}
        </div>

        {/* Error display */}
        {walletError && (
          <div className="text-xs text-red-400 p-2 bg-red-400/10 rounded">
            {walletError}
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Balance</span>
          <span className="text-sm font-mono text-green-400">{displayBalance} credits</span>
        </div>
        
        {/* Proofs list with click-to-inspect */}
        <div>
          <span className="text-xs text-gray-400 block mb-1">Proofs ({displayProofs.length})</span>
          {displayProofs.length > 0 ? (
            <div className="space-y-1">
              {proofs.map((p, i) => (
                <div key={p.secret?.slice(0, 8) || i}>
                  <button
                    onClick={() => setSelectedProofIndex(selectedProofIndex === i ? null : i)}
                    className="w-full text-left p-1.5 bg-surface-light hover:bg-surface rounded text-xs font-mono flex justify-between items-center"
                  >
                    <span className="text-gray-300">
                      {p.amount} credits
                    </span>
                    <span className="text-gray-500 text-[10px]">
                      {selectedProofIndex === i ? '▼' : '▶'} {p.id?.slice(0, 8)}
                    </span>
                  </button>
                  {selectedProofIndex === i && (
                    <div className="mt-1 ml-2">
                      <JsonViewer 
                        data={{
                          amount: p.amount,
                          id: p.id,
                          C: p.C,
                          secret: p.secret
                        }} 
                        maxHeight="120px" 
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
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

        {/* Token Import Section */}
        <div className="border-t border-surface-light pt-3">
          <button
            onClick={() => setShowImport(!showImport)}
            className="w-full py-1.5 text-xs font-medium bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors"
          >
            {showImport ? '− Hide Import' : '+ Import Token'}
          </button>
          
          {showImport && (
            <div className="mt-2 space-y-2">
              <textarea
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste cashuA... or cashuB... token"
                className="w-full px-2 py-1.5 text-xs font-mono bg-background border border-surface-light rounded text-white focus:outline-none focus:border-primary resize-none"
                rows={3}
              />
              <button
                onClick={handleImportToken}
                disabled={!tokenInput.trim()}
                className="w-full py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import Proofs
              </button>
              
              {importError && (
                <div className="p-2 bg-red-900/30 border border-red-500/50 rounded">
                  <p className="text-xs text-red-400">{importError}</p>
                </div>
              )}
              
              {importSuccess && (
                <div className="p-2 bg-green-900/30 border border-green-500/50 rounded">
                  <p className="text-xs text-green-400">{importSuccess}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {displayProofs.length > 0 && (
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

// Settings panel with feature toggles
function SettingsPanel() {
  const prebuildEnabled = useSettingsStore((s) => s.prebuildEnabled);
  const togglePrebuild = useSettingsStore((s) => s.togglePrebuild);
  const jitSwapEnabled = useSettingsStore((s) => s.jitSwapEnabled);
  const toggleJitSwap = useSettingsStore((s) => s.toggleJitSwap);
  const walletStorageMode = useSettingsStore((s) => s.walletStorageMode);
  const toggleWalletStorageMode = useSettingsStore((s) => s.toggleWalletStorageMode);
  const identityMode = useSettingsStore((s) => s.identityMode);
  const setIdentityMode = useSettingsStore((s) => s.setIdentityMode);
  const nsec = useSettingsStore((s) => s.nsec);
  const setNsec = useSettingsStore((s) => s.setNsec);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn());

  const [nsecInput, setNsecInput] = useState('');
  const [nsecError, setNsecError] = useState<string | null>(null);

  // Validate nsec format
  const validateAndSetNsec = (value: string) => {
    setNsecInput(value);
    setNsecError(null);

    if (!value || value === '') {
      setNsec(null);
      return;
    }

    if (value.startsWith('nsec1') && value.length >= 59) {
      // Basic format check - full validation happens in identity.ts
      try {
        // Import dynamically to avoid circular deps
        import('../lib/identity').then(({ isValidNsec }) => {
          if (isValidNsec(value)) {
            setNsec(value);
            setNsecError(null);
            debugLog('event', 'Identity nsec configured');
          } else {
            setNsecError('Invalid nsec');
          }
        });
      } catch {
        setNsecError('Invalid nsec format');
      }
    }
  };

  const clearNsec = () => {
    setNsecInput('');
    setNsec(null);
    setNsecError(null);
    setIdentityMode('none');
  };

  // Identity mode options
  const identityModes = [
    { value: 'none' as const, label: 'None', desc: 'Anonymous' },
    { value: 'nip98' as const, label: 'NIP-98', desc: 'Header auth' },
    { value: 'urlTokenSig' as const, label: 'URL Token', desc: 'Sign token' },
    { value: 'urlTimestampSig' as const, label: 'URL Time', desc: 'Sign timestamp' },
  ];

  return (
    <DebugPanel title="⚙️ Settings">
      <div className="space-y-3">
        {/* Wallet Storage Mode Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white block">Wallet Storage</span>
            <span className="text-[10px] text-gray-500">
              {walletStorageMode === 'nostr' ? '☁️ Nostr relays (NIP-60)' : '💾 Local browser storage'}
            </span>
          </div>
          <button
            onClick={toggleWalletStorageMode}
            disabled={walletStorageMode === 'local' && !isLoggedIn}
            title={!isLoggedIn && walletStorageMode === 'local' ? 'Login required for Nostr storage' : ''}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              walletStorageMode === 'nostr' ? 'bg-purple-500' : 'bg-surface-light'
            } ${!isLoggedIn && walletStorageMode === 'local' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                walletStorageMode === 'nostr' ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Nostr storage info */}
        {walletStorageMode === 'nostr' && (
          <div className="text-[10px] text-purple-400 p-2 bg-purple-500/10 rounded border border-purple-500/20">
            ☁️ Tokens synced to Nostr relays. Access your wallet from any NIP-60 compatible client.
          </div>
        )}

        {!isLoggedIn && walletStorageMode === 'local' && (
          <div className="text-[10px] text-gray-500 p-2 bg-surface rounded">
            💡 Login to enable Nostr wallet sync
          </div>
        )}

        <div className="border-t border-surface-light pt-3" />

        {/* Prebuild Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white block">Smart Prebuild</span>
            <span className="text-[10px] text-gray-500">
              {prebuildEnabled ? 'Pre-swap tokens on load' : 'Direct payment mode'}
            </span>
          </div>
          <button
            onClick={togglePrebuild}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              prebuildEnabled ? 'bg-primary' : 'bg-surface-light'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                prebuildEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* JIT Swap Toggle (only visible when prebuild is off) */}
        {!prebuildEnabled && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-white block">Client-side JIT Swap</span>
              <span className="text-[10px] text-gray-500">
                {jitSwapEnabled ? 'Swap before sending' : 'Server returns change'}
              </span>
            </div>
            <button
              onClick={toggleJitSwap}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                jitSwapEnabled ? 'bg-primary' : 'bg-surface-light'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  jitSwapEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}

        {/* Info */}
        <div className="text-[10px] text-gray-500 p-2 bg-surface rounded">
          {prebuildEnabled ? (
            <>
              <span className="text-green-400">PREBUILD:</span> Tokens pre-built for track prices on load.
              Single request per play (~120ms).
            </>
          ) : jitSwapEnabled ? (
            <>
              <span className="text-yellow-400">JIT SWAP:</span> Client swaps proofs to exact amount before sending.
              Extra mint call (~300-500ms).
            </>
          ) : (
            <>
              <span className="text-cyan-400">DIRECT:</span> Send proofs, server returns change.
              Single request, simplest flow.
            </>
          )}
        </div>

        <div className="border-t border-surface-light pt-3" />

        {/* Identity Mode Section */}
        <div>
          <span className="text-xs text-white block mb-2">🔑 Identity (Spending Cap)</span>
          
          {/* Nsec Input */}
          <div className="relative mb-2">
            <input
              type="password"
              value={nsecInput}
              onChange={(e) => validateAndSetNsec(e.target.value)}
              placeholder="nsec1..."
              className={`w-full px-2 py-1.5 text-xs font-mono bg-background border rounded text-white focus:outline-none pr-8 ${
                nsecError ? 'border-red-500 focus:border-red-500' : 'border-surface-light focus:border-primary'
              }`}
            />
            {nsec && (
              <button
                onClick={clearNsec}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-400 text-xs"
                title="Clear nsec"
              >
                ✕
              </button>
            )}
          </div>
          
          {nsecError && (
            <div className="text-[10px] text-red-400 mb-2">{nsecError}</div>
          )}
          
          {nsec && (
            <div className="text-[10px] text-green-400 mb-2">✓ Nsec configured</div>
          )}

          {/* Identity Mode Selector */}
          <div className="flex flex-wrap gap-1 mb-2">
            {identityModes.map((mode) => {
              const isDisabled = mode.value !== 'none' && !nsec;
              const isActive = identityMode === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() => !isDisabled && setIdentityMode(mode.value)}
                  disabled={isDisabled}
                  className={`px-2 py-1 text-[10px] rounded transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : isDisabled
                      ? 'bg-surface-light text-gray-600 cursor-not-allowed'
                      : 'bg-surface-light text-gray-300 hover:bg-surface hover:text-white'
                  }`}
                  title={isDisabled ? 'Configure nsec first' : mode.desc}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          {/* Identity Mode Info */}
          <div className="text-[10px] text-gray-500 p-2 bg-surface rounded">
            {identityMode === 'none' ? (
              <>
                <span className="text-gray-400">ANONYMOUS:</span> No identity attached.
                Spending caps disabled.
              </>
            ) : identityMode === 'nip98' ? (
              <>
                <span className="text-blue-400">NIP-98:</span> Authorization header with signed event.
                Works with fetch() requests.
              </>
            ) : identityMode === 'urlTokenSig' ? (
              <>
                <span className="text-green-400">URL TOKEN SIG:</span> Signs SHA256(token).
                For native &lt;audio&gt; with payment.
              </>
            ) : (
              <>
                <span className="text-orange-400">URL TIMESTAMP SIG:</span> Signs SHA256(timestamp).
                For free/cap-check requests.
              </>
            )}
          </div>
        </div>
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
  const { ndk } = useNDK();
  const { pubkey, loginWithNip07, loginWithNsec, logout } = useAuthStore();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const handleConnect = () => {
    if (pubkey) {
      logout();
      return;
    }
    setShowLoginModal(true);
  };

  const handleLogin = async (newPubkey: string, privkey?: string) => {
    if (!ndk) {
      debugLog('error', 'NDK not initialized');
      return;
    }
    
    if (privkey) {
      loginWithNsec(newPubkey, privkey, ndk);
    } else {
      try {
        await loginWithNip07(ndk);
      } catch (err) {
        debugLog('error', 'NIP-07 login failed', { error: String(err) });
      }
    }
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
            <SettingsPanel />
            <TokenCachePanel />
            <PurchasePanel />
            <WalletPanel />
            <ApiConfigPanel />
          </div>
        </aside>
      </div>

      {/* Bottom: Debug log stream */}
      <div 
        className={`flex-none relative transition-all duration-200 ${
          logExpanded ? 'h-[50vh]' : 'h-48'
        }`}
      >
        {/* Expand/collapse button */}
        <button
          onClick={() => setLogExpanded(!logExpanded)}
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 px-3 py-1 text-xs bg-surface border border-surface-light rounded-full text-gray-400 hover:text-white hover:bg-surface-light transition-colors"
          title={logExpanded ? 'Collapse log' : 'Expand log to 50%'}
        >
          {logExpanded ? '▼ Collapse' : '▲ Expand'}
        </button>
        <DebugLog />
      </div>
    </div>
  );
}
