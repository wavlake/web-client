/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import NDK from '@nostr-dev-kit/ndk';

// Default relays for Wavlake content
const DEFAULT_RELAYS = [
  'wss://relay.wavlake.com',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

interface NDKContextType {
  ndk: NDK | null;
  connected: boolean;
}

const NDKContext = createContext<NDKContextType>({
  ndk: null,
  connected: false,
});

export function NDKProvider({ children }: { children: ReactNode }) {
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const instance = new NDK({
      explicitRelayUrls: DEFAULT_RELAYS,
    });

    instance.connect().then(() => {
      setConnected(true);
      console.log('Connected to Nostr relays');
    });

    setNdk(instance);

    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <NDKContext.Provider value={{ ndk, connected }}>
      {children}
    </NDKContext.Provider>
  );
}

export function useNDK() {
  const context = useContext(NDKContext);
  if (!context) {
    throw new Error('useNDK must be used within an NDKProvider');
  }
  return context;
}
