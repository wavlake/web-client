'use client';

/**
 * useWalletHistory Hook
 * 
 * Access and query wallet transaction history with filtering,
 * pagination, and real-time updates.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  TransactionRecord,
  TransactionType,
  TransactionStatus,
} from '@wavlake/wallet';
import { useWalletContext } from '../providers/WalletProvider.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Query options for transaction history
 */
export interface HistoryQueryOptions {
  /** Filter by transaction type(s) */
  types?: TransactionType[];
  /** Filter by status */
  status?: TransactionStatus;
  /** Start date (inclusive) */
  since?: Date;
  /** End date (inclusive) */
  until?: Date;
  /** Maximum number of records to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order (default: 'desc' - newest first) */
  order?: 'asc' | 'desc';
}

/**
 * Transaction summary statistics
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

/**
 * Hook return value
 */
export interface UseWalletHistoryResult {
  /** Current page of transaction records */
  records: TransactionRecord[];
  /** Total count (before pagination) */
  total: number;
  /** Whether there are more records */
  hasMore: boolean;
  /** Whether history is loading */
  isLoading: boolean;
  /** Error, if any */
  error: Error | null;
  /** Summary statistics for the filtered set */
  summary: HistorySummary;
  /** Current query options */
  query: HistoryQueryOptions;
  /** Update query options (triggers re-fetch) */
  setQuery: (options: HistoryQueryOptions | ((prev: HistoryQueryOptions) => HistoryQueryOptions)) => void;
  /** Load next page of results */
  loadMore: () => void;
  /** Reset to first page */
  reset: () => void;
  /** Refresh history from wallet */
  refresh: () => void;
  /** Get a single transaction by ID */
  getTransaction: (id: string) => TransactionRecord | null;
}

/**
 * Hook options
 */
export interface UseWalletHistoryOptions {
  /** Initial query options */
  initialQuery?: HistoryQueryOptions;
  /** Automatically refresh when wallet transactions change (default: true) */
  autoRefresh?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access wallet transaction history with filtering and pagination.
 * 
 * Provides:
 * - Paginated transaction records
 * - Filtering by type, status, date range
 * - Summary statistics
 * - Real-time updates on new transactions
 * 
 * @example
 * ```tsx
 * function TransactionList() {
 *   const { 
 *     records, 
 *     hasMore, 
 *     loadMore, 
 *     summary,
 *     setQuery 
 *   } = useWalletHistory();
 * 
 *   return (
 *     <div>
 *       <div className="summary">
 *         Spent: {summary.totalSent} | Received: {summary.totalReceived}
 *       </div>
 *       
 *       <select onChange={(e) => setQuery({ types: e.target.value ? [e.target.value as TransactionType] : undefined })}>
 *         <option value="">All</option>
 *         <option value="send">Payments</option>
 *         <option value="receive">Received</option>
 *         <option value="mint">Minted</option>
 *       </select>
 *       
 *       <ul>
 *         {records.map(tx => (
 *           <li key={tx.id}>
 *             {tx.type}: {tx.amount} credits - {tx.timestamp.toLocaleString()}
 *           </li>
 *         ))}
 *       </ul>
 *       
 *       {hasMore && <button onClick={loadMore}>Load More</button>}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // Filter to show only payments from the last 24 hours
 * const { records } = useWalletHistory({
 *   initialQuery: {
 *     types: ['send'],
 *     since: new Date(Date.now() - 24 * 60 * 60 * 1000),
 *   }
 * });
 * ```
 * 
 * @example
 * ```tsx
 * // Group transactions by date
 * function DailyTransactions() {
 *   const { records } = useWalletHistory({ initialQuery: { limit: 100 } });
 *   
 *   const grouped = useMemo(() => {
 *     const groups: Record<string, TransactionRecord[]> = {};
 *     for (const tx of records) {
 *       const date = tx.timestamp.toISOString().split('T')[0];
 *       (groups[date] ??= []).push(tx);
 *     }
 *     return groups;
 *   }, [records]);
 *   
 *   return (
 *     <div>
 *       {Object.entries(grouped).map(([date, txs]) => (
 *         <div key={date}>
 *           <h3>{date}</h3>
 *           {txs.map(tx => <div key={tx.id}>{tx.amount}</div>)}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useWalletHistory(options: UseWalletHistoryOptions = {}): UseWalletHistoryResult {
  const {
    initialQuery = {},
    autoRefresh = true,
  } = options;

  // Get wallet context
  const context = useWalletContext();
  const { isReady, getHistory, getHistorySummary, getTransaction: walletGetTransaction } = context;

  // State
  const [query, setQueryState] = useState<HistoryQueryOptions>({
    limit: 20,
    offset: 0,
    order: 'desc',
    ...initialQuery,
  });
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Calculate summary for current filters (excluding pagination)
  const summary = useMemo<HistorySummary>(() => {
    if (!getHistorySummary) {
      return { totalSent: 0, totalReceived: 0, netChange: 0, transactionCount: 0 };
    }
    return getHistorySummary({
      since: query.since,
      until: query.until,
    });
  }, [getHistorySummary, query.since, query.until, refreshTrigger]);

  // Fetch history when query or refresh trigger changes
  useEffect(() => {
    if (!isReady || !getHistory) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = getHistory(query);
      setRecords(result.records);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load history'));
      setRecords([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [isReady, getHistory, query, refreshTrigger]);

  // Subscribe to transaction events for auto-refresh
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    // When transaction count changes, trigger refresh
    // This relies on the WalletContext updating historyCount
    const historyCount = context.historyCount ?? 0;
    
    // Only refresh if we've loaded at least once
    if (records.length > 0 || total > 0) {
      setRefreshTrigger(prev => prev + 1);
    }
  }, [autoRefresh, context.historyCount]);

  // Set query with state update
  const setQuery = useCallback((
    optionsOrFn: HistoryQueryOptions | ((prev: HistoryQueryOptions) => HistoryQueryOptions)
  ) => {
    setQueryState(prev => {
      const newOptions = typeof optionsOrFn === 'function' ? optionsOrFn(prev) : optionsOrFn;
      // Reset offset when filter changes (but not when explicitly set)
      if (!('offset' in newOptions) && (
        newOptions.types !== prev.types ||
        newOptions.status !== prev.status ||
        newOptions.since !== prev.since ||
        newOptions.until !== prev.until
      )) {
        return { ...newOptions, offset: 0 };
      }
      return { ...prev, ...newOptions };
    });
  }, []);

  // Load next page
  const loadMore = useCallback(() => {
    setQueryState(prev => ({
      ...prev,
      offset: (prev.offset ?? 0) + (prev.limit ?? 20),
    }));
  }, []);

  // Reset to first page
  const reset = useCallback(() => {
    setQueryState(prev => ({
      ...prev,
      offset: 0,
    }));
  }, []);

  // Manual refresh
  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Get single transaction
  const getTransaction = useCallback((id: string): TransactionRecord | null => {
    if (!walletGetTransaction) {
      return null;
    }
    return walletGetTransaction(id);
  }, [walletGetTransaction]);

  return {
    records,
    total,
    hasMore,
    isLoading,
    error,
    summary,
    query,
    setQuery,
    loadMore,
    reset,
    refresh,
    getTransaction,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Get recent transactions with a simple interface.
 * 
 * @param limit - Maximum number of transactions (default: 10)
 * @returns Recent transactions
 * 
 * @example
 * ```tsx
 * function RecentActivity() {
 *   const transactions = useRecentTransactions(5);
 *   return (
 *     <ul>
 *       {transactions.map(tx => (
 *         <li key={tx.id}>{tx.type}: {tx.amount}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useRecentTransactions(limit: number = 10): TransactionRecord[] {
  const { records } = useWalletHistory({
    initialQuery: { limit, order: 'desc' },
  });
  return records;
}

/**
 * Get spending summary for a time period.
 * 
 * @param since - Start of time period (default: last 30 days)
 * @returns Spending summary
 * 
 * @example
 * ```tsx
 * function SpendingSummary() {
 *   const { totalSent, totalReceived, netChange } = useSpendingSummary();
 *   return (
 *     <div>
 *       <p>Spent: {totalSent} credits</p>
 *       <p>Received: {totalReceived} credits</p>
 *       <p>Net: {netChange > 0 ? '+' : ''}{netChange}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSpendingSummary(since?: Date): HistorySummary {
  const defaultSince = useMemo(
    () => since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    [since]
  );
  
  const { summary } = useWalletHistory({
    initialQuery: { since: defaultSince },
  });
  
  return summary;
}

// Re-export types for convenience
export type { TransactionRecord, TransactionType, TransactionStatus } from '@wavlake/wallet';
