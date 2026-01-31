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
import type { Wallet, Proof, MintQuote, CheckProofsResult } from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

export interface WalletContextValue {
  /** Current balance in credits */
  balance: number;
  /** Current proofs (readonly copy) */
  proofs: Proof[];
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

  // Load wallet on mount (client-side only)
  useEffect(() => {
    if (!autoLoad) return;

    let mounted = true;

    const loadWallet = async () => {
      try {
        setIsLoading(true);
        await walletRef.current.load();
        
        if (mounted) {
          setBalance(walletRef.current.balance);
          setProofs(walletRef.current.proofs);
          setIsReady(true);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
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
  }, [autoLoad]);

  // Subscribe to wallet events
  useEffect(() => {
    const handleBalanceChange = (newBalance: number) => {
      setBalance(newBalance);
    };

    const handleProofsChange = (newProofs: Proof[]) => {
      setProofs(newProofs);
    };

    const handleError = (err: Error) => {
      setError(err);
    };

    walletRef.current.on('balance-change', handleBalanceChange);
    walletRef.current.on('proofs-change', handleProofsChange);
    walletRef.current.on('error', handleError);

    return () => {
      walletRef.current.off('balance-change', handleBalanceChange);
      walletRef.current.off('proofs-change', handleProofsChange);
      walletRef.current.off('error', handleError);
    };
  }, []);

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

  const value: WalletContextValue = {
    balance,
    proofs,
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
