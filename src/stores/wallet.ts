import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Proof } from '@cashu/cashu-ts';
import { debugLog } from './debug';

interface WalletState {
  proofs: Proof[];
  pendingProofs: Proof[];
  
  // Computed
  getBalance: () => number;
  
  // Actions
  addProofs: (proofs: Proof[]) => void;
  removeProofs: (proofs: Proof[]) => void;
  markPending: (proofs: Proof[]) => void;
  clearPending: () => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      proofs: [],
      pendingProofs: [],
      
      getBalance: () => {
        const { proofs } = get();
        return proofs.reduce((sum, p) => sum + p.amount, 0);
      },
      
      addProofs: (newProofs) => {
        debugLog('wallet', 'Adding proofs', { 
          count: newProofs.length, 
          amounts: newProofs.map(p => p.amount),
          total: newProofs.reduce((s, p) => s + p.amount, 0)
        });
        set((state) => ({
          proofs: [...state.proofs, ...newProofs],
        }));
      },
      
      removeProofs: (proofsToRemove) => {
        const secrets = new Set(proofsToRemove.map(p => p.secret));
        debugLog('wallet', 'Removing proofs', { 
          count: proofsToRemove.length,
          amounts: proofsToRemove.map(p => p.amount)
        });
        set((state) => ({
          proofs: state.proofs.filter(p => !secrets.has(p.secret)),
        }));
      },
      
      markPending: (proofs) => {
        debugLog('wallet', 'Marking proofs as pending', { 
          count: proofs.length,
          amounts: proofs.map(p => p.amount)
        });
        set({ pendingProofs: proofs });
      },
      
      clearPending: () => {
        debugLog('wallet', 'Clearing pending proofs');
        set({ pendingProofs: [] });
      },
      
      reset: () => {
        debugLog('wallet', 'Wallet reset');
        set({ proofs: [], pendingProofs: [] });
      },
    }),
    {
      name: 'wavlake-wallet',
      partialize: (state) => ({ proofs: state.proofs }),
    }
  )
);
