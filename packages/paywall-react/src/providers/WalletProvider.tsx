'use client';

/**
 * WalletProvider
 * 
 * React context provider for Cashu wallet state.
 * SSR-compatible with lazy initialization.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { Wallet, Proof, MintQuote, CheckProofsResult, DefragStats } from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

export interface WalletContextValue {
  /** Current balance in credits */
  balance: number;
  /** Current proofs (readonly copy) */
  proofs: Proof[];
  /** Number of proofs in wallet */
  proofCount: number;
  /** Whether the wallet is ready (false during SSR/hydration) */
  isReady: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Create a token for the specified amount */
  createToken: (amount: number) => Promise<string>;
  /** Receive a token and add to wallet */
  receiveToken: (token: string) => Promise<number>;
  /** Create a mint quote (Lightning invoice) */
  createMintQuote: (amount: number) => Promise<MintQuote>;
  /** Mint tokens from a paid quote */
  mintTokens: (quote: MintQuote | string) => Promise<number>;
  /** Check which proofs are still valid */
  checkProofs: () => Promise<CheckProofsResult>;
  /** Remove spent proofs */
  pruneSpent: () => Promise<number>;
  /** Clear all proofs from wallet */
  clear: () => Promise<void>;
  /** Get defragmentation statistics */
  getDefragStats: () => DefragStats;
  /** Check if defragmentation is recommended */
  needsDefragmentation: () => boolean;
  /** Defragment wallet proofs by consolidating them with the mint */
  defragment: () => Promise<{
    previousProofCount: number;
    newProofCount: number;
    previousBalance: number;
    newBalance: number;
    saved: number;
  }>;
}

// ============================================================================
// Context
// ============================================================================

const WalletContext = createContext<WalletContextValue | null>(null);

// ============================================================================
// Provider Props
// ============================================================================

export interface WalletProviderProps {
  /** Wallet instance to use */
  wallet: Wallet;
  /** Children to render */
  children: ReactNode;
  /** Auto-load wallet on mount (default: true) */
  autoLoad?: boolean;
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Provides wallet state to child components.
 * 
 * @example
 * ```tsx
 * import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
 * import { WalletProvider, useWallet } from '@wavlake/paywall-react';
 * 
 * const wallet = new Wallet({
 *   mintUrl: 'https://mint.wavlake.com',
 *   storage: new LocalStorageAdapter('my-wallet'),
 * });
 * 
 * function App() {
 *   return (
 *     <WalletProvider wallet={wallet}>
 *       <WalletBalance />
 *     </WalletProvider>
 *   );
 * }
 * 
 * function WalletBalance() {
 *   const { balance, isReady } = useWallet();
 *   if (!isReady) return <div>Loading...</div>;
 *   return <div>Balance: {balance} credits</div>;
 * }
 * ```
 */
export function WalletProvider({
  wallet,
  children,
  autoLoad = true,
}: WalletProviderProps) {
  // Use ref to avoid re-renders from wallet instance changes
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  // State
  const [balance, setBalance] = useState(0);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load wallet on mount or when wallet changes
  useEffect(() => {
    if (!autoLoad) return;

    let mounted = true;
    const currentWallet = wallet;

    const loadWallet = async () => {
      try {
        setIsLoading(true);
        setIsReady(false);
        
        // Only load if not already loaded
        if (!currentWallet.isLoaded) {
          await currentWallet.load();
        }
        
        if (mounted) {
          setBalance(currentWallet.balance);
          setProofs(currentWallet.proofs);
          setIsReady(true);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsReady(true); // Mark ready even on error so UI isn't stuck
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadWallet();

    return () => {
      mounted = false;
    };
  }, [autoLoad, wallet]);

  // Subscribe to wallet events - re-subscribe when wallet changes
  useEffect(() => {
    const currentWallet = wallet;
    
    const handleBalanceChange = (newBalance: number) => {
      setBalance(newBalance);
    };

    const handleProofsChange = (newProofs: Proof[]) => {
      setProofs(newProofs);
    };

    const handleError = (err: Error) => {
      setError(err);
    };

    currentWallet.on('balance-change', handleBalanceChange);
    currentWallet.on('proofs-change', handleProofsChange);
    currentWallet.on('error', handleError);

    // Sync state when wallet changes
    if (currentWallet.isLoaded) {
      setBalance(currentWallet.balance);
      setProofs(currentWallet.proofs);
    }

    return () => {
      currentWallet.off('balance-change', handleBalanceChange);
      currentWallet.off('proofs-change', handleProofsChange);
      currentWallet.off('error', handleError);
    };
  }, [wallet]);

  // Actions
  const createToken = useCallback(async (amount: number) => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.createToken(amount);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const receiveToken = useCallback(async (token: string) => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.receiveToken(token);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createMintQuote = useCallback(async (amount: number) => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.createMintQuote(amount);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const mintTokens = useCallback(async (quote: MintQuote | string) => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.mintTokens(quote);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkProofs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.checkProofs();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pruneSpent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.pruneSpent();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await walletRef.current.clear();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDefragStats = useCallback(() => {
    return walletRef.current.getDefragStats();
  }, []);

  const needsDefragmentation = useCallback(() => {
    return walletRef.current.needsDefragmentation();
  }, []);

  const defragment = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.defragment();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: WalletContextValue = {
    balance,
    proofs,
    proofCount: proofs.length,
    isReady,
    isLoading,
    error,
    createToken,
    receiveToken,
    createMintQuote,
    mintTokens,
    checkProofs,
    pruneSpent,
    clear,
    getDefragStats,
    needsDefragmentation,
    defragment,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access wallet state and actions from context.
 * Must be used within a WalletProvider.
 * 
 * @throws Error if used outside WalletProvider
 */
export function useWalletContext(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return context;
}
