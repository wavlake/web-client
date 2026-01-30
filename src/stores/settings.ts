/**
 * Settings Store
 * 
 * App-wide settings with persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debugLog } from './debug';

interface SettingsState {
  /** Enable smart prebuild (pre-swap tokens based on track prices) */
  prebuildEnabled: boolean;
  
  /** Enable client-side JIT swap before payment (off = rely on server-side change) */
  jitSwapEnabled: boolean;
  
  // Actions
  setPrebuildEnabled: (enabled: boolean) => void;
  togglePrebuild: () => void;
  setJitSwapEnabled: (enabled: boolean) => void;
  toggleJitSwap: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      prebuildEnabled: true, // Default: on
      jitSwapEnabled: false, // Default: off (rely on server-side change)
      
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
    }),
    {
      name: 'wavlake-settings',
    }
  )
);
