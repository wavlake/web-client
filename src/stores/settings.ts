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
  
  // Actions
  setPrebuildEnabled: (enabled: boolean) => void;
  togglePrebuild: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      prebuildEnabled: true, // Default: on
      
      setPrebuildEnabled: (enabled) => {
        debugLog('event', `Prebuild ${enabled ? 'enabled' : 'disabled'}`);
        set({ prebuildEnabled: enabled });
      },
      
      togglePrebuild: () => {
        const newValue = !get().prebuildEnabled;
        debugLog('event', `Prebuild ${newValue ? 'enabled' : 'disabled'}`);
        set({ prebuildEnabled: newValue });
      },
    }),
    {
      name: 'wavlake-settings',
    }
  )
);
