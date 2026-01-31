import { useMemo, useEffect, useState } from 'react';
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

  useEffect(() => {
    const createWallet = async () => {
      let storage;

      if (walletStorage === 'nostr' && isLoggedIn && ndk && connected && signer) {
        console.log('🔄 Using NIP-60 Nostr storage');
        storage = new Nip60Adapter({
          ndk,
          signer,
          mintUrl: MINT_URL,
          unit: 'sat',
        });
      } else {
        console.log('💾 Using local storage');
        storage = new LocalStorageAdapter('paywall-demo-wallet');
      }

      const newWallet = new Wallet({
        mintUrl: MINT_URL,
        storage,
        debug: true,
      });

      await newWallet.load();
      setWallet(newWallet);
    };

    createWallet().catch(console.error);
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
