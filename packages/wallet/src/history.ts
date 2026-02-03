/**
 * Transaction History
 * 
 * Records and queries wallet transaction history for auditing,
 * debugging, and user-facing spending displays.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Type of transaction
 */
export type TransactionType = 
  | 'send'      // Created token for payment
  | 'receive'   // Received token/change
  | 'mint'      // Minted new tokens from Lightning
  | 'swap';     // Internal proof swap

/**
 * Status of a transaction
 */
export type TransactionStatus = 
  | 'completed'  // Successfully processed
  | 'pending'    // In progress (e.g., mint quote unpaid)
  | 'failed';    // Failed (e.g., token rejected)

/**
 * A single transaction record
 */
export interface TransactionRecord {
  /** Unique transaction ID */
  id: string;
  /** Transaction type */
  type: TransactionType;
  /** Amount in credits (positive for receive, negative for send) */
  amount: number;
  /** Timestamp of transaction */
  timestamp: Date;
  /** Transaction status */
  status: TransactionStatus;
  /** Optional description/memo */
  memo?: string;
  /** Optional metadata (e.g., dtag for content, quote ID for minting) */
  metadata?: Record<string, unknown>;
}

/**
 * Options for querying transaction history
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
 * Paginated history result
 */
export interface HistoryResult {
  /** Transaction records */
  records: TransactionRecord[];
  /** Total count (before limit/offset) */
  total: number;
  /** Whether there are more records */
  hasMore: boolean;
}

/**
 * Serialized format for storage
 */
export interface SerializedTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  timestamp: string; // ISO string
  status: TransactionStatus;
  memo?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Transaction Store
// ============================================================================

/**
 * In-memory transaction store with query capabilities.
 * 
 * Maintains transactions in memory and provides methods
 * for querying and exporting for persistence.
 * 
 * @example
 * ```ts
 * const store = new TransactionStore();
 * 
 * // Record a payment
 * store.add({
 *   type: 'send',
 *   amount: -5,
 *   memo: 'Track payment',
 *   metadata: { dtag: 'track-123' },
 * });
 * 
 * // Query recent transactions
 * const { records } = store.query({ limit: 10 });
 * ```
 */
export class TransactionStore {
  private transactions: TransactionRecord[] = [];

  constructor(initial?: TransactionRecord[]) {
    if (initial) {
      this.transactions = [...initial];
    }
  }

  /**
   * Add a new transaction record.
   * Returns the created record with generated ID and timestamp.
   */
  add(tx: Omit<TransactionRecord, 'id' | 'timestamp' | 'status'> & {
    status?: TransactionStatus;
    timestamp?: Date;
  }): TransactionRecord {
    const record: TransactionRecord = {
      id: generateId(),
      type: tx.type,
      amount: tx.amount,
      timestamp: tx.timestamp ?? new Date(),
      status: tx.status ?? 'completed',
      memo: tx.memo,
      metadata: tx.metadata,
    };

    this.transactions.push(record);
    return record;
  }

  /**
   * Update an existing transaction (e.g., change status from pending to completed).
   */
  update(id: string, updates: Partial<Pick<TransactionRecord, 'status' | 'memo' | 'metadata'>>): TransactionRecord | null {
    const index = this.transactions.findIndex(tx => tx.id === id);
    if (index === -1) return null;

    this.transactions[index] = {
      ...this.transactions[index],
      ...updates,
    };
    return this.transactions[index];
  }

  /**
   * Get a transaction by ID.
   */
  get(id: string): TransactionRecord | null {
    return this.transactions.find(tx => tx.id === id) ?? null;
  }

  /**
   * Query transactions with filtering and pagination.
   */
  query(options: HistoryQueryOptions = {}): HistoryResult {
    const {
      types,
      status,
      since,
      until,
      limit = 50,
      offset = 0,
      order = 'desc',
    } = options;

    // Filter
    let filtered = this.transactions.filter(tx => {
      if (types && types.length > 0 && !types.includes(tx.type)) {
        return false;
      }
      if (status && tx.status !== status) {
        return false;
      }
      if (since && tx.timestamp < since) {
        return false;
      }
      if (until && tx.timestamp > until) {
        return false;
      }
      return true;
    });

    // Sort
    filtered = filtered.sort((a, b) => {
      const diff = a.timestamp.getTime() - b.timestamp.getTime();
      return order === 'asc' ? diff : -diff;
    });

    // Paginate
    const total = filtered.length;
    const records = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { records, total, hasMore };
  }

  /**
   * Get summary statistics for a time period.
   */
  getSummary(options: { since?: Date; until?: Date } = {}): {
    totalSent: number;
    totalReceived: number;
    netChange: number;
    transactionCount: number;
  } {
    const { records } = this.query({
      since: options.since,
      until: options.until,
      limit: Number.MAX_SAFE_INTEGER,
    });

    let totalSent = 0;
    let totalReceived = 0;

    for (const tx of records) {
      if (tx.status !== 'completed') continue;
      
      if (tx.amount < 0) {
        totalSent += Math.abs(tx.amount);
      } else {
        totalReceived += tx.amount;
      }
    }

    return {
      totalSent,
      totalReceived,
      netChange: totalReceived - totalSent,
      transactionCount: records.length,
    };
  }

  /**
   * Get all transactions (for export/persistence).
   */
  all(): TransactionRecord[] {
    return [...this.transactions];
  }

  /**
   * Clear all transactions.
   */
  clear(): void {
    this.transactions = [];
  }

  /**
   * Get transaction count.
   */
  get count(): number {
    return this.transactions.length;
  }

  /**
   * Serialize for storage.
   */
  serialize(): SerializedTransaction[] {
    return this.transactions.map(tx => ({
      ...tx,
      timestamp: tx.timestamp.toISOString(),
    }));
  }

  /**
   * Load from serialized data.
   */
  static deserialize(data: SerializedTransaction[]): TransactionStore {
    const records = data.map(tx => ({
      ...tx,
      timestamp: new Date(tx.timestamp),
    }));
    return new TransactionStore(records);
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a unique transaction ID.
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `tx_${timestamp}_${random}`;
}

/**
 * Format a transaction for display.
 * 
 * @example
 * ```ts
 * const tx = { type: 'send', amount: -5, timestamp: new Date() };
 * console.log(formatTransaction(tx));
 * // "-5 credits (sent)"
 * ```
 */
export function formatTransaction(tx: TransactionRecord): string {
  const sign = tx.amount >= 0 ? '+' : '';
  const verb = tx.type === 'send' ? 'sent' 
    : tx.type === 'receive' ? 'received'
    : tx.type === 'mint' ? 'minted'
    : 'swapped';
  
  return `${sign}${tx.amount} credits (${verb})`;
}

/**
 * Group transactions by date.
 * 
 * @example
 * ```ts
 * const grouped = groupByDate(transactions);
 * // { '2024-01-15': [...], '2024-01-14': [...] }
 * ```
 */
export function groupByDate(transactions: TransactionRecord[]): Record<string, TransactionRecord[]> {
  const groups: Record<string, TransactionRecord[]> = {};
  
  for (const tx of transactions) {
    const date = tx.timestamp.toISOString().split('T')[0];
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(tx);
  }
  
  return groups;
}

/**
 * Calculate running balance from transactions.
 * 
 * @param transactions - Transactions in chronological order
 * @param startingBalance - Balance before first transaction
 * @returns Array of [transaction, balance after] pairs
 */
export function calculateRunningBalance(
  transactions: TransactionRecord[],
  startingBalance: number = 0
): Array<[TransactionRecord, number]> {
  let balance = startingBalance;
  return transactions.map(tx => {
    if (tx.status === 'completed') {
      balance += tx.amount;
    }
    return [tx, balance] as [TransactionRecord, number];
  });
}
