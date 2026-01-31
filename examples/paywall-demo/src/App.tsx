import { useMemo } from 'react';
import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
import { PaywallClient } from '@wavlake/paywall-client';
import { WalletProvider, PaywallProvider } from '@wavlake/paywall-react';
import { NDKProvider } from './lib/ndk';
import { WalletPanel } from './components/WalletPanel';
import { TrackList } from './components/TrackList';
import { Player } from './components/Player';
import { PlayerProvider } from './hooks/usePlayer';
import './styles.css';

// Config
const MINT_URL = 'https://mint.minibits.cash/Bitcoin';
const API_URL = 'https://wavlake.com';

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
          <PlayerProvider>
            <div className="app">
              <header>
                <h1>⚡ Wavlake Paywall Demo</h1>
                <p className="subtitle">SDK-powered music streaming with ecash</p>
              </header>

              <WalletPanel />
              <TrackList />
              <Player />
            </div>
          </PlayerProvider>
        </PaywallProvider>
      </WalletProvider>
    </NDKProvider>
  );
}
