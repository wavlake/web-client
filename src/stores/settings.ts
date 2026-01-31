/**
 * Settings Store
 * 
 * App-wide settings with persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debugLog } from './debug';

export type WalletStorageMode = 'local' | 'nostr';

interface SettingsState {
  /** Enable smart prebuild (pre-swap tokens based on track prices) */
  prebuildEnabled: boolean;
  
  /** Enable client-side JIT swap before payment (off = rely on server-side change) */
  jitSwapEnabled: boolean;
  
  /** Wallet storage mode: 'local' = localStorage, 'nostr' = NIP-60 relays */
  walletStorageMode: WalletStorageMode;
  
  // Actions
  setPrebuildEnabled: (enabled: boolean) => void;
  togglePrebuild: () => void;
  setJitSwapEnabled: (enabled: boolean) => void;
  toggleJitSwap: () => void;
  setWalletStorageMode: (mode: WalletStorageMode) => void;
  toggleWalletStorageMode: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      prebuildEnabled: true, // Default: on
      jitSwapEnabled: false, // Default: off (rely on server-side change)
      walletStorageMode: 'local', // Default: localStorage
      
      setPrebuildEnabled: (enabled) => {
        debugLog('event', `Prebuild ${enabled ? 'enabled' : 'disabled'}`);
        set({ prebuildEnabled: enabled });
      },
      
      togglePrebuild: () => {
        const newValue = !get().prebuildEnabled;
        debugLog('event', `Prebuild ${newValue ? 'enabled' : 'disabled'}`);
        set({ prebuildEnabled: newValue });
      },
      
      setJitSwapEnabled: (enabled) => {
        debugLog('event', `JIT Swap ${enabled ? 'enabled' : 'disabled'}`);
        set({ jitSwapEnabled: enabled });
      },
      
      toggleJitSwap: () => {
        const newValue = !get().jitSwapEnabled;
        debugLog('event', `JIT Swap ${newValue ? 'enabled' : 'disabled'}`);
        set({ jitSwapEnabled: newValue });
      },
      
      setWalletStorageMode: (mode) => {
        debugLog('event', `Wallet storage mode: ${mode}`);
        set({ walletStorageMode: mode });
      },
      
      toggleWalletStorageMode: () => {
        const current = get().walletStorageMode;
        const newMode = current === 'local' ? 'nostr' : 'local';
        debugLog('event', `Wallet storage mode: ${newMode}`);
        set({ walletStorageMode: newMode });
      },
    }),
    {
      name: 'wavlake-settings',
    }
  )
);
