/**
 * Auth Store
 * 
 * Centralized Nostr authentication state.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import NDK, { NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import type { NDKSigner } from '@nostr-dev-kit/ndk';
import { debugLog } from './debug';

interface AuthState {
  /** Current user's pubkey (hex) */
  pubkey: string | null;
  /** Private key if logged in with nsec (hex) */
  privkey: string | null;
  /** Auth method used */
  method: 'nip07' | 'nsec' | null;
  
  // Actions
  loginWithNip07: (ndk: NDK) => Promise<void>;
  loginWithNsec: (pubkey: string, privkey: string, ndk: NDK) => void;
  logout: () => void;
  
  /** Get NDK signer for current auth method */
  getSigner: () => NDKSigner | null;
  
  /** Check if logged in */
  isLoggedIn: () => boolean;
}

// Store signer instance outside zustand (not serializable)
let _signer: NDKSigner | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      pubkey: null,
      privkey: null,
      method: null,
      
      loginWithNip07: async (ndk: NDK) => {
        if (!window.nostr) {
          throw new Error('No Nostr extension found');
        }
        
        const signer = new NDKNip07Signer();
        const user = await signer.user();
        
        // Attach signer to NDK
        ndk.signer = signer;
        _signer = signer;
        
        debugLog('auth', 'NIP-07 login successful', { 
          pubkey: user.pubkey.slice(0, 16) + '...' 
        });
        
        set({
          pubkey: user.pubkey,
          privkey: null,
          method: 'nip07',
        });
      },
      
      loginWithNsec: (pubkey: string, privkey: string, ndk: NDK) => {
        const signer = new NDKPrivateKeySigner(privkey);
        
        // Attach signer to NDK
        ndk.signer = signer;
        _signer = signer;
        
        debugLog('auth', 'nsec login successful', { 
          pubkey: pubkey.slice(0, 16) + '...' 
        });
        
        set({
          pubkey,
          privkey,
          method: 'nsec',
        });
      },
      
      logout: () => {
        _signer = null;
        debugLog('auth', 'Logged out');
        set({
          pubkey: null,
          privkey: null,
          method: null,
        });
      },
      
      getSigner: () => {
        const { method, privkey } = get();
        
        // Return cached signer if available
        if (_signer) {
          return _signer;
        }
        
        // Recreate signer from persisted state
        if (method === 'nip07' && window.nostr) {
          _signer = new NDKNip07Signer();
          return _signer;
        }
        
        if (method === 'nsec' && privkey) {
          _signer = new NDKPrivateKeySigner(privkey);
          return _signer;
        }
        
        return null;
      },
      
      isLoggedIn: () => {
        return get().pubkey !== null;
      },
    }),
    {
      name: 'wavlake-auth',
      partialize: (state) => ({
        pubkey: state.pubkey,
        privkey: state.privkey,
        method: state.method,
      }),
    }
  )
);

// Restore signer on page load if we have persisted auth
export function restoreAuth(ndk: NDK) {
  const { method, privkey, pubkey } = useAuthStore.getState();
  
  if (!pubkey || !method) return;
  
  if (method === 'nip07' && window.nostr) {
    const signer = new NDKNip07Signer();
    ndk.signer = signer;
    _signer = signer;
    debugLog('auth', 'Restored NIP-07 signer');
  } else if (method === 'nsec' && privkey) {
    const signer = new NDKPrivateKeySigner(privkey);
    ndk.signer = signer;
    _signer = signer;
    debugLog('auth', 'Restored nsec signer');
  }
}
