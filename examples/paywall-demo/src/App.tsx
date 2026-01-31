import { useMemo, useEffect, useState, useRef } from 'react';
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
import { Nip60Adapter } from '@wavlake/nostr-wallet';
import { PaywallClient } from '@wavlake/paywall-client';
import { WalletProvider, PaywallProvider } from '@wavlake/paywall-react';
import { NDKProvider, useNDK } from './lib/ndk';
import { SettingsProvider, useSettings } from './hooks/useSettings';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { WalletPanel } from './components/WalletPanel';
import { TrackList } from './components/TrackList';
import { Player } from './components/Player';
import { Settings } from './components/Settings';
import { DebugPanel } from './components/DebugPanel';
import { Nip60DebugPanel } from './components/Nip60DebugPanel';
import { PlayerProvider } from './hooks/usePlayer';
import './styles.css';

// Config (Wavlake staging)
const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app';

function WalletSetup({ children }: { children: React.ReactNode }) {
  const { ndk, connected } = useNDK();
  const { signer, isLoggedIn } = useAuth();
  const { walletStorage } = useSettings();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  
  // Use refs to access latest values without triggering effect
  const ndkRef = useRef(ndk);
  const signerRef = useRef(signer);
  ndkRef.current = ndk;
  signerRef.current = signer;
  
  // Compute effective mode as a stable string key
  const canUseNostr = walletStorage === 'nostr' && isLoggedIn && ndk && connected && signer;
  const effectiveMode = canUseNostr ? 'nostr' : 'local';
  
  // Only re-run when effectiveMode changes
  useEffect(() => {
    let cancelled = false;

    const createWallet = async () => {
      let storage;

      if (effectiveMode === 'nostr') {
        // Use refs to get current values
        const currentNdk = ndkRef.current;
        const currentSigner = signerRef.current;
        
        if (!currentNdk || !currentSigner) {
          console.error('NDK or signer not available for Nostr mode');
          return;
        }
        
        console.log('🔄 Using NIP-60 Nostr storage');
        storage = new Nip60Adapter({
          ndk: currentNdk,
          signer: currentSigner,
          mintUrl: MINT_URL,
          unit: 'usd',
        });
      } else {
        console.log('💾 Using local storage');
        storage = new LocalStorageAdapter('paywall-demo-wallet');
      }

      const newWallet = new Wallet({
        mintUrl: MINT_URL,
        storage,
        unit: 'usd',
        debug: true,
      });

      await newWallet.load();
      
      if (!cancelled) {
        setWallet(newWallet);
      }
    };

    createWallet().catch((err) => {
      console.error('Wallet creation failed:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveMode]); // Only depend on the computed mode

  const client = useMemo(() => new PaywallClient({
    apiUrl: API_URL,
    debug: true,
  }), []);

  if (!wallet) {
    return <div className="app loading">Loading wallet...</div>;
  }

  return (
    <WalletProvider wallet={wallet}>
      <PaywallProvider client={client}>
        {children}
      </PaywallProvider>
    </WalletProvider>
  );
}

function ConnectionStatus() {
  const { connected } = useNDK();
  const { isLoggedIn } = useAuth();
  const { walletStorage } = useSettings();
  
  return (
    <div className="connection-status">
      <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} title={connected ? 'Nostr connected' : 'Nostr disconnected'} />
      {isLoggedIn && <span className="status-badge">🔑</span>}
      {walletStorage === 'nostr' && <span className="status-badge" title="NIP-60 enabled">☁️</span>}
    </div>
  );
}

function AppContent() {
  return (
    <div className="app">
      <header>
        <div className="header-row">
          <h1>⚡ Wavlake Paywall Demo</h1>
          <ConnectionStatus />
        </div>
        <p className="subtitle">SDK-powered music streaming with ecash</p>
      </header>

      <WalletPanel />
      <Settings />
      <Nip60DebugPanel />
      <TrackList />
      <DebugPanel />
      <Player />
    </div>
  );
}

export function App() {
  return (
    <NDKProvider>
      <SettingsProvider>
        <AuthProvider>
          <WalletSetup>
            <PlayerProvider>
              <AppContent />
            </PlayerProvider>
          </WalletSetup>
        </AuthProvider>
      </SettingsProvider>
    </NDKProvider>
  );
}
