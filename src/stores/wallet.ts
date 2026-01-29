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
  removeProofs: (secrets: string[]) => void;
  selectProofsForAmount: (amount: number) => Proof[] | null;
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
      
      removeProofs: (secrets) => {
        const secretSet = new Set(secrets);
        const { proofs } = get();
        const toRemove = proofs.filter(p => secretSet.has(p.secret));
        debugLog('wallet', 'Removing proofs', { 
          count: toRemove.length,
          amounts: toRemove.map(p => p.amount)
        });
        set((state) => ({
          proofs: state.proofs.filter(p => !secretSet.has(p.secret)),
        }));
      },
      
      selectProofsForAmount: (amount) => {
        const { proofs } = get();
        // Simple greedy selection - pick smallest proofs that sum to >= amount
        const sorted = [...proofs].sort((a, b) => a.amount - b.amount);
        const selected: Proof[] = [];
        let total = 0;
        
        for (const proof of sorted) {
          if (total >= amount) break;
          selected.push(proof);
          total += proof.amount;
        }
        
        if (total < amount) {
          debugLog('wallet', 'Insufficient proofs for amount', { 
            requested: amount, 
            available: total 
          });
          return null;
        }
        
        debugLog('wallet', 'Selected proofs for payment', {
          requestedAmount: amount,
          selectedCount: selected.length,
          selectedAmounts: selected.map(p => p.amount),
          total,
        });
        
        return selected;
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
