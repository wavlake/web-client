import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type EndpointType = 'content' | 'audio';

interface SettingsContextValue {
  endpoint: EndpointType;
  setEndpoint: (endpoint: EndpointType) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const STORAGE_KEY = 'paywall-demo-settings';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [endpoint, setEndpointState] = useState<EndpointType>('content');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.endpoint === 'audio' || settings.endpoint === 'content') {
          setEndpointState(settings.endpoint);
        }
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  const setEndpoint = (newEndpoint: EndpointType) => {
    setEndpointState(newEndpoint);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ endpoint: newEndpoint }));
    } catch (e) {
      // Ignore
    }
  };

  return (
    <SettingsContext.Provider value={{ endpoint, setEndpoint }}>
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
