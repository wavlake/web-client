import { useEffect } from 'react';
import { NDKProvider } from './lib/ndk';
import { WalletProvider } from './lib/wallet';
import DebugLayout from './components/DebugLayout';
import TrackList from './components/TrackList';
import { initTokenCache } from './stores/tokenCache';
import { debugLog } from './stores/debug';

function App() {
  // Initialize token cache on app load (pre-warm wallet + build tokens)
  useEffect(() => {
    debugLog('app', 'Initializing token cache for single-request mode...');
    initTokenCache()
      .then(() => {
        debugLog('app', 'Token cache initialized');
      })
      .catch((err) => {
        debugLog('error', 'Token cache init failed', { error: err.message });
      });
  }, []);

  return (
    <NDKProvider>
      <WalletProvider>
        <DebugLayout trackList={<TrackList />} />
      </WalletProvider>
    </NDKProvider>
  );
}

export default App;
