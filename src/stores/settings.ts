/**
 * Settings Store
 * 
 * App-wide settings with persistence.
 * 
 * Identity Modes (for spending cap tracking):
 * - NONE: Anonymous requests, no identity attached
 * - NIP98: NIP-98 Authorization header (fetch-based requests)
 * - URL_TOKEN_SIG: URL param with Schnorr signature of token hash (paid requests)
 * - URL_TIMESTAMP_SIG: URL param with Schnorr signature of timestamp (free requests)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debugLog } from './debug';

export type WalletStorageMode = 'local' | 'nostr';
export type IdentityMode = 'none' | 'nip98' | 'urlTokenSig' | 'urlTimestampSig';

interface SettingsState {
  /** Enable smart prebuild (pre-swap tokens based on track prices) */
  prebuildEnabled: boolean;
  
  /** Enable client-side JIT swap before payment (off = rely on server-side change) */
  jitSwapEnabled: boolean;
  
  /** Wallet storage mode: 'local' = localStorage, 'nostr' = NIP-60 relays */
  walletStorageMode: WalletStorageMode;
  
  /** Identity mode for spending cap tracking */
  identityMode: IdentityMode;
  
  /** Stored nsec for identity signing (null = not configured) */
  nsec: string | null;
  
  // Actions
  setPrebuildEnabled: (enabled: boolean) => void;
  togglePrebuild: () => void;
  setJitSwapEnabled: (enabled: boolean) => void;
  toggleJitSwap: () => void;
  setWalletStorageMode: (mode: WalletStorageMode) => void;
  toggleWalletStorageMode: () => void;
  setIdentityMode: (mode: IdentityMode) => void;
  setNsec: (nsec: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      prebuildEnabled: true, // Default: on
      jitSwapEnabled: false, // Default: off (rely on server-side change)
      walletStorageMode: 'local', // Default: localStorage
      identityMode: 'none', // Default: anonymous
      nsec: null, // Default: not configured
      
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
      
      setIdentityMode: (mode) => {
        debugLog('event', `Identity mode: ${mode}`);
        set({ identityMode: mode });
      },
      
      setNsec: (nsec) => {
        debugLog('event', nsec ? 'Nsec configured (redacted)' : 'Nsec cleared');
        set({ nsec });
      },
    }),
    {
      name: 'wavlake-settings-v2', // Bumped version for new fields
    }
  )
);

// ============================================================================
// Mode Descriptions (for UI)
// ============================================================================

export const IDENTITY_MODE_DESCRIPTIONS: Record<
  IdentityMode,
  { label: string; description: string; requiresNsec: boolean }
> = {
  none: {
    label: 'Anonymous',
    description: 'No identity attached. Spending caps disabled.',
    requiresNsec: false,
  },
  nip98: {
    label: 'NIP-98 Header',
    description: 'Authorization header with signed event. Works with fetch() requests.',
    requiresNsec: true,
  },
  urlTokenSig: {
    label: 'URL Token Signature',
    description: 'Schnorr signature of token hash in URL params. For native <audio> elements with payment.',
    requiresNsec: true,
  },
  urlTimestampSig: {
    label: 'URL Timestamp Signature',
    description: 'Schnorr signature of timestamp in URL params. For free requests or cap-check.',
    requiresNsec: true,
  },
};
