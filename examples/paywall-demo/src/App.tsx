import { useMemo } from 'react';
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
import { PaywallClient } from '@wavlake/paywall-client';
import { WalletProvider, PaywallProvider } from '@wavlake/paywall-react';
import { NDKProvider } from './lib/ndk';
import { SettingsProvider } from './hooks/useSettings';
import { WalletPanel } from './components/WalletPanel';
import { TrackList } from './components/TrackList';
import { Player } from './components/Player';
import { Settings } from './components/Settings';
import { PlayerProvider } from './hooks/usePlayer';
import './styles.css';

// Config (Wavlake staging)
const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app';

export function App() {
  // Create wallet and client once
  const wallet = useMemo(() => new Wallet({
    mintUrl: MINT_URL,
    storage: new LocalStorageAdapter('paywall-demo-wallet'),
  }), []);

  const client = useMemo(() => new PaywallClient({
    apiUrl: API_URL,
  }), []);

  return (
    <NDKProvider>
      <WalletProvider wallet={wallet}>
        <PaywallProvider client={client}>
          <SettingsProvider>
            <PlayerProvider>
              <div className="app">
                <header>
                  <h1>⚡ Wavlake Paywall Demo</h1>
                  <p className="subtitle">SDK-powered music streaming with ecash</p>
                </header>

                <WalletPanel />
                <Settings />
                <TrackList />
                <Player />
              </div>
            </PlayerProvider>
          </SettingsProvider>
        </PaywallProvider>
      </WalletProvider>
    </NDKProvider>
  );
}
