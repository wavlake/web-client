/**
 * Wallet Provider
 * 
 * Manages the Cashu wallet with switchable storage backends:
 * - localStorage (default)
 * - NIP-60 Nostr relays
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Proof } from '@cashu/cashu-ts';
import { Wallet, LocalStorageAdapter, MemoryAdapter } from '@wavlake/wallet';
import { Nip60Adapter } from '@wavlake/nostr-wallet';
import { useNDK } from './ndk';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore, type WalletStorageMode } from '../stores/settings';
import { debugLog } from '../stores/debug';

// Wavlake mint URL
const MINT_URL = 'https://mint.wavlake.com';
const WALLET_UNIT = 'usd';

interface WalletContextType {
  /** Current wallet instance */
  wallet: Wallet | null;
  /** Current balance */
  balance: number;
  /** Current proofs */
  proofs: Proof[];
  /** Whether wallet is loaded and ready */
  isReady: boolean;
  /** Whether wallet is syncing with Nostr */
  isSyncing: boolean;
  /** Current storage mode */
  storageMode: WalletStorageMode;
  /** Error message if any */
  error: string | null;
  
  // Actions
  /** Reload wallet from storage */
  reload: () => Promise<void>;
  /** Add proofs to wallet */
  addProofs: (proofs: Proof[]) => Promise<void>;
  /** Create a token for payment */
  createToken: (amount: number) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | null>(null);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const { ndk, connected } = useNDK();
  const { pubkey, getSigner, isLoggedIn } = useAuthStore();
  const { walletStorageMode } = useSettingsStore();
  
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState(0);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reinitialize wallet when storage mode or auth changes
  useEffect(() => {
    const initWallet = async () => {
      setIsReady(false);
      setError(null);

      try {
        let storage;

        if (walletStorageMode === 'nostr') {
          // NIP-60 mode requires login
          if (!isLoggedIn() || !ndk || !connected) {
            debugLog('wallet', 'NIP-60 mode requires login, using memory adapter');
            storage = new MemoryAdapter();
          } else {
            const signer = getSigner();
            if (!signer) {
              throw new Error('No signer available');
            }

            debugLog('wallet', 'Initializing NIP-60 adapter');
            setIsSyncing(true);
            
            storage = new Nip60Adapter({
              ndk,
              signer,
              mintUrl: MINT_URL,
              unit: WALLET_UNIT,
            });
          }
        } else {
          // Local storage mode
          debugLog('wallet', 'Using localStorage adapter');
          storage = new LocalStorageAdapter('wavlake-wallet-proofs');
        }

        const newWallet = new Wallet({
          mintUrl: MINT_URL,
          storage,
          unit: WALLET_UNIT,
        });

        await newWallet.load();
        
        setWallet(newWallet);
        setBalance(newWallet.balance);
        setProofs(newWallet.proofs);
        setIsReady(true);
        setIsSyncing(false);

        debugLog('wallet', 'Wallet initialized', {
          mode: walletStorageMode,
          balance: newWallet.balance,
          proofCount: newWallet.proofs.length,
        });

        // Subscribe to wallet events
        newWallet.on('balance-change', (newBalance) => {
          setBalance(newBalance);
          debugLog('wallet', 'Balance changed', { balance: newBalance });
        });

        newWallet.on('proofs-change', (newProofs) => {
          setProofs(newProofs);
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize wallet';
        setError(message);
        setIsReady(false);
        setIsSyncing(false);
        debugLog('error', 'Wallet init failed', { error: message });
      }
    };

    initWallet();
  }, [walletStorageMode, pubkey, connected, ndk, getSigner, isLoggedIn]);

  const reload = useCallback(async () => {
    if (!wallet) return;
    
    setIsSyncing(true);
    try {
      await wallet.load();
      setBalance(wallet.balance);
      setProofs(wallet.proofs);
      debugLog('wallet', 'Wallet reloaded', { balance: wallet.balance });
    } catch (err) {
      debugLog('error', 'Wallet reload failed', { error: String(err) });
    } finally {
      setIsSyncing(false);
    }
  }, [wallet]);

  const addProofs = useCallback(async (newProofs: Proof[]) => {
    if (!wallet) {
      throw new Error('Wallet not initialized');
    }
    
    await wallet.addProofs(newProofs);
    setBalance(wallet.balance);
    setProofs(wallet.proofs);
    
    debugLog('wallet', 'Proofs added', {
      count: newProofs.length,
      amounts: newProofs.map(p => p.amount),
      newBalance: wallet.balance,
    });
  }, [wallet]);

  const createToken = useCallback(async (amount: number): Promise<string> => {
    if (!wallet) {
      throw new Error('Wallet not initialized');
    }
    
    const token = await wallet.createToken(amount);
    setBalance(wallet.balance);
    setProofs(wallet.proofs);
    
    debugLog('wallet', 'Token created', { amount, newBalance: wallet.balance });
    return token;
  }, [wallet]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        balance,
        proofs,
        isReady,
        isSyncing,
        storageMode: walletStorageMode,
        error,
        reload,
        addProofs,
        createToken,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
