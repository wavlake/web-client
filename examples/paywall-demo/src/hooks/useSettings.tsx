import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type EndpointType = 'content' | 'audio' | 'audio-url';
export type WalletStorageMode = 'local' | 'nostr';

interface SettingsContextValue {
  endpoint: EndpointType;
  setEndpoint: (endpoint: EndpointType) => void;
  walletStorage: WalletStorageMode;
  setWalletStorage: (mode: WalletStorageMode) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const STORAGE_KEY = 'paywall-demo-settings';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [endpoint, setEndpointState] = useState<EndpointType>('content');
  const [walletStorage, setWalletStorageState] = useState<WalletStorageMode>('local');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.endpoint === 'audio' || settings.endpoint === 'content' || settings.endpoint === 'audio-url') {
          setEndpointState(settings.endpoint);
        }
        if (settings.walletStorage === 'local' || settings.walletStorage === 'nostr') {
          setWalletStorageState(settings.walletStorage);
        }
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  const saveSettings = (settings: { endpoint: EndpointType; walletStorage: WalletStorageMode }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // Ignore
    }
  };

  const setEndpoint = (newEndpoint: EndpointType) => {
    setEndpointState(newEndpoint);
    saveSettings({ endpoint: newEndpoint, walletStorage });
  };

  const setWalletStorage = (mode: WalletStorageMode) => {
    setWalletStorageState(mode);
    saveSettings({ endpoint, walletStorage: mode });
  };

  return (
    <SettingsContext.Provider value={{ endpoint, setEndpoint, walletStorage, setWalletStorage }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
