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
  
  // Track current storage mode to avoid unnecessary recreations
  const currentModeRef = useRef<string | null>(null);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    // Determine effective storage mode
    const canUseNostr = walletStorage === 'nostr' && isLoggedIn && ndk && connected && signer;
    const effectiveMode = canUseNostr ? 'nostr' : 'local';
    
    // Skip if we're already using this mode or currently creating
    if (currentModeRef.current === effectiveMode || isCreatingRef.current) {
      return;
    }

    const createWallet = async () => {
      isCreatingRef.current = true;
      let storage;

      if (canUseNostr) {
        console.log('🔄 Using NIP-60 Nostr storage');
        storage = new Nip60Adapter({
          ndk: ndk!,
          signer: signer!,
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
      currentModeRef.current = effectiveMode;
      isCreatingRef.current = false;
      setWallet(newWallet);
    };

    createWallet().catch((err) => {
      console.error('Wallet creation failed:', err);
      isCreatingRef.current = false;
    });
  }, [walletStorage, isLoggedIn, ndk, connected, signer]);

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

function AppContent() {
  return (
    <div className="app">
      <header>
        <h1>⚡ Wavlake Paywall Demo</h1>
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
