import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import type { NDKSigner } from '@nostr-dev-kit/ndk';
import { useNDK } from '../lib/ndk';

type AuthMethod = 'nip07' | 'nsec' | null;

interface AuthContextValue {
  pubkey: string | null;
  method: AuthMethod;
  signer: NDKSigner | null;
  isLoggedIn: boolean;
  loginWithNip07: () => Promise<void>;
  loginWithNsec: (nsec: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'paywall-demo-auth';

// Decode nsec bech32 to hex
function decodeNsec(nsec: string): string | null {
  try {
    if (!nsec.startsWith('nsec1')) return null;
    // Dynamic import to avoid bundling issues
    const { bech32 } = require('@scure/base');
    const { prefix, words } = bech32.decode(nsec, 1500);
    if (prefix !== 'nsec') return null;
    const bytes = bech32.fromWords(words);
    return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { ndk } = useNDK();
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [method, setMethod] = useState<AuthMethod>(null);
  const [signer, setSigner] = useState<NDKSigner | null>(null);

  // Restore auth on mount
  useEffect(() => {
    if (!ndk) return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { pubkey: storedPubkey, method: storedMethod, privkey } = JSON.parse(stored);
        
        if (storedMethod === 'nip07' && window.nostr) {
          const nip07Signer = new NDKNip07Signer();
          ndk.signer = nip07Signer;
          setSigner(nip07Signer);
          setPubkey(storedPubkey);
          setMethod('nip07');
        } else if (storedMethod === 'nsec' && privkey) {
          const nsecSigner = new NDKPrivateKeySigner(privkey);
          ndk.signer = nsecSigner;
          setSigner(nsecSigner);
          setPubkey(storedPubkey);
          setMethod('nsec');
        }
      }
    } catch (e) {
      console.warn('Failed to restore auth:', e);
    }
  }, [ndk]);

  const loginWithNip07 = useCallback(async () => {
    if (!ndk || !window.nostr) {
      throw new Error('NIP-07 extension not available');
    }

    const nip07Signer = new NDKNip07Signer();
    const user = await nip07Signer.user();
    
    ndk.signer = nip07Signer;
    setSigner(nip07Signer);
    setPubkey(user.pubkey);
    setMethod('nip07');
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pubkey: user.pubkey,
      method: 'nip07',
    }));
  }, [ndk]);

  const loginWithNsec = useCallback(async (nsec: string) => {
    if (!ndk) {
      throw new Error('NDK not initialized');
    }

    let privkey = nsec;
    if (nsec.startsWith('nsec1')) {
      const decoded = decodeNsec(nsec);
      if (!decoded) throw new Error('Invalid nsec');
      privkey = decoded;
    }

    const nsecSigner = new NDKPrivateKeySigner(privkey);
    const user = await nsecSigner.user();
    
    ndk.signer = nsecSigner;
    setSigner(nsecSigner);
    setPubkey(user.pubkey);
    setMethod('nsec');
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pubkey: user.pubkey,
      method: 'nsec',
      privkey,
    }));
  }, [ndk]);

  const logout = useCallback(() => {
    if (ndk) {
      ndk.signer = undefined;
    }
    setSigner(null);
    setPubkey(null);
    setMethod(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [ndk]);

  return (
    <AuthContext.Provider value={{
      pubkey,
      method,
      signer,
      isLoggedIn: !!pubkey,
      loginWithNip07,
      loginWithNsec,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
