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
  useMemo,
  type ReactNode,
} from 'react';
import type {
  Wallet,
  Proof,
  MintQuote,
  CheckProofsResult,
  TokenPreview,
  DefragStats,
  TransactionRecord,
  HistoryQueryOptions,
  HistoryResult,
} from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

/**
 * Defragmentation result returned by defragment()
 */
export interface DefragmentResult {
  /** Number of proofs before defragmentation */
  previousProofCount: number;
  /** Number of proofs after defragmentation */
  newProofCount: number;
  /** Balance before defragmentation */
  previousBalance: number;
  /** Balance after defragmentation */
  newBalance: number;
  /** Number of proofs saved (previousProofCount - newProofCount) */
  saved: number;
}

/**
 * Summary of wallet transaction history
 */
export interface HistorySummary {
  /** Total amount sent (absolute value) */
  totalSent: number;
  /** Total amount received */
  totalReceived: number;
  /** Net change (received - sent) */
  netChange: number;
  /** Number of transactions */
  transactionCount: number;
}

export interface WalletContextValue {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

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
  /** Mint URL this wallet is configured for */
  mintUrl: string;
  /** Number of recorded transactions in history */
  historyCount: number;

  // -------------------------------------------------------------------------
  // Token Operations
  // -------------------------------------------------------------------------

  /** Create a token for the specified amount */
  createToken: (amount: number, memo?: string, metadata?: Record<string, unknown>) => Promise<string>;
  /** Receive a token and add to wallet */
  receiveToken: (token: string, memo?: string, metadata?: Record<string, unknown>) => Promise<number>;
  /**
   * Preview token creation before committing.
   * Synchronous - returns immediately with preview data.
   */
  previewToken: (amount: number) => TokenPreview;

  // -------------------------------------------------------------------------
  // Minting (NUT-04)
  // -------------------------------------------------------------------------

  /** Create a mint quote (Lightning invoice) */
  createMintQuote: (amount: number) => Promise<MintQuote>;
  /** Mint tokens from a paid quote */
  mintTokens: (quote: MintQuote | string) => Promise<number>;

  // -------------------------------------------------------------------------
  // Proof Management
  // -------------------------------------------------------------------------

  /** Check which proofs are still valid */
  checkProofs: () => Promise<CheckProofsResult>;
  /** Remove spent proofs */
  pruneSpent: () => Promise<number>;
  /** Clear all proofs from wallet */
  clear: (clearHistory?: boolean) => Promise<void>;

  // -------------------------------------------------------------------------
  // Defragmentation
  // -------------------------------------------------------------------------

  /**
   * Get defragmentation statistics.
   * Synchronous - returns immediately.
   */
  getDefragStats: () => DefragStats;
  /**
   * Check if defragmentation is recommended.
   * Synchronous - returns immediately.
   */
  needsDefragmentation: () => boolean;
  /**
   * Defragment wallet proofs by consolidating them with the mint.
   * Reduces the number of proofs while maintaining the same balance.
   */
  defragment: () => Promise<DefragmentResult>;

  // -------------------------------------------------------------------------
  // Transaction History
  // -------------------------------------------------------------------------

  /**
   * Query transaction history with filtering and pagination.
   * Synchronous - returns immediately.
   */
  getHistory: (options?: HistoryQueryOptions) => HistoryResult;
  /**
   * Get a single transaction by ID.
   * Synchronous - returns immediately.
   */
  getTransaction: (id: string) => TransactionRecord | null;
  /**
   * Get transaction summary for a time period.
   * Synchronous - returns immediately.
   */
  getHistorySummary: (options?: { since?: Date; until?: Date }) => HistorySummary;
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
 * Exposes all wallet methods including:
 * - Token creation/receiving with previews
 * - Minting via Lightning
 * - Proof management and health checks
 * - Defragmentation
 * - Transaction history
 * 
 * @example Basic usage
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
 * 
 * @example Token preview before payment
 * ```tsx
 * function PayButton({ price }: { price: number }) {
 *   const { previewToken, createToken, balance } = useWallet();
 *   
 *   const preview = previewToken(price);
 *   
 *   if (!preview.canCreate) {
 *     return <span>{preview.issue}</span>;
 *   }
 *   
 *   return (
 *     <button onClick={() => createToken(price)}>
 *       Pay {price} ({preview.needsSwap ? 'swap required' : 'exact match'})
 *     </button>
 *   );
 * }
 * ```
 * 
 * @example Defragmentation
 * ```tsx
 * function WalletMaintenance() {
 *   const { needsDefragmentation, getDefragStats, defragment, isLoading } = useWallet();
 *   
 *   if (!needsDefragmentation()) return null;
 *   
 *   const stats = getDefragStats();
 *   
 *   return (
 *     <div>
 *       <p>Wallet is fragmented ({stats.fragmentation}%)</p>
 *       <button onClick={defragment} disabled={isLoading}>
 *         Consolidate proofs
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example Transaction history
 * ```tsx
 * function TransactionList() {
 *   const { getHistory, getHistorySummary } = useWallet();
 *   
 *   const { records, hasMore } = getHistory({ limit: 10 });
 *   const summary = getHistorySummary();
 *   
 *   return (
 *     <div>
 *       <p>Total spent: {summary.totalSent}</p>
 *       <ul>
 *         {records.map(tx => (
 *           <li key={tx.id}>{tx.type}: {tx.amount}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
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
  const [historyCount, setHistoryCount] = useState(0);

  // Derived state (synchronous)
  const mintUrl = useMemo(() => wallet.mintUrl, [wallet]);

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
          setHistoryCount(currentWallet.historyCount);
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

    const handleTransaction = () => {
      // Update history count when transactions are recorded
      setHistoryCount(currentWallet.historyCount);
    };

    const handleError = (err: Error) => {
      setError(err);
    };

    currentWallet.on('balance-change', handleBalanceChange);
    currentWallet.on('proofs-change', handleProofsChange);
    currentWallet.on('transaction', handleTransaction);
    currentWallet.on('error', handleError);

    // Sync state when wallet changes
    if (currentWallet.isLoaded) {
      setBalance(currentWallet.balance);
      setProofs(currentWallet.proofs);
      setHistoryCount(currentWallet.historyCount);
    }

    return () => {
      currentWallet.off('balance-change', handleBalanceChange);
      currentWallet.off('proofs-change', handleProofsChange);
      currentWallet.off('transaction', handleTransaction);
      currentWallet.off('error', handleError);
    };
  }, [wallet]);

  // ---------------------------------------------------------------------------
  // Token Operations
  // ---------------------------------------------------------------------------

  const createToken = useCallback(async (
    amount: number,
    memo?: string,
    metadata?: Record<string, unknown>
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.createToken(amount, memo, metadata);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const receiveToken = useCallback(async (
    token: string,
    memo?: string,
    metadata?: Record<string, unknown>
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      return await walletRef.current.receiveToken(token, memo, metadata);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const previewToken = useCallback((amount: number): TokenPreview => {
    return walletRef.current.previewToken(amount);
  }, []);

  // ---------------------------------------------------------------------------
  // Minting (NUT-04)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Proof Management
  // ---------------------------------------------------------------------------

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

  const clear = useCallback(async (clearHistory: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      await walletRef.current.clear(clearHistory);
      if (clearHistory) {
        setHistoryCount(0);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Defragmentation
  // ---------------------------------------------------------------------------

  const getDefragStats = useCallback((): DefragStats => {
    return walletRef.current.getDefragStats();
  }, []);

  const needsDefragmentation = useCallback((): boolean => {
    return walletRef.current.needsDefragmentation();
  }, []);

  const defragment = useCallback(async (): Promise<DefragmentResult> => {
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

  // ---------------------------------------------------------------------------
  // Transaction History
  // ---------------------------------------------------------------------------

  const getHistory = useCallback((options?: HistoryQueryOptions): HistoryResult => {
    return walletRef.current.getHistory(options);
  }, []);

  const getTransaction = useCallback((id: string): TransactionRecord | null => {
    return walletRef.current.getTransaction(id);
  }, []);

  const getHistorySummary = useCallback((options?: { since?: Date; until?: Date }): HistorySummary => {
    return walletRef.current.getHistorySummary(options);
  }, []);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: WalletContextValue = {
    // State
    balance,
    proofs,
    isReady,
    isLoading,
    error,
    mintUrl,
    historyCount,
    // Token Operations
    createToken,
    receiveToken,
    previewToken,
    // Minting
    createMintQuote,
    mintTokens,
    // Proof Management
    checkProofs,
    pruneSpent,
    clear,
    // Defragmentation
    getDefragStats,
    needsDefragmentation,
    defragment,
    // Transaction History
    getHistory,
    getTransaction,
    getHistorySummary,
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
