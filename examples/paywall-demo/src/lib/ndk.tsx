import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import NDK from '@nostr-dev-kit/ndk';

const RELAYS = ['wss://relay.wavlake.com'];

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
      explicitRelayUrls: RELAYS,
    });

    instance.connect().then(() => {
      setConnected(true);
      console.log('Connected to Nostr relays');
    });

    setNdk(instance);
  }, []);

  return (
    <NDKContext.Provider value={{ ndk, connected }}>
      {children}
    </NDKContext.Provider>
  );
}

export function useNDK() {
  return useContext(NDKContext);
}
