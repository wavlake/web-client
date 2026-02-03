/**
 * Wallet Class
 * 
 * Stateful Cashu wallet with pluggable storage and proof selection.
 */

import { Mint, Wallet as CashuWallet, getEncodedTokenV4, getDecodedToken } from '@cashu/cashu-ts';
import type { Proof } from '@cashu/cashu-ts';
import type {
  WalletConfig,
  CheckProofsResult,
  MintQuote,
  WalletEventType,
  WalletEventHandlers,
  TokenPreview,
} from './types.js';
import type { StorageAdapter } from './storage/interface.js';
import { smallestFirst } from './selectors/smallest.js';
import { checkProofState } from './checkstate.js';
import { createLogger, type Logger } from './logger.js';
import { TokenCreationError, generateSuggestion } from './errors.js';
import { getDenominations, getDefragStats, type DefragStats } from './inspect.js';

/**
 * Cashu wallet with state management.
 * 
 * Features:
 * - Pluggable storage backends (localStorage, AsyncStorage, memory)
 * - Configurable proof selection strategies
 * - Event system for balance/proof changes
 * - Proof validation via mint checkstate
 * 
 * @example
 * ```ts
 * import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
 * 
 * const wallet = new Wallet({
 *   mintUrl: 'https://mint.wavlake.com',
 *   storage: new LocalStorageAdapter('my-wallet'),
 * });
 * 
 * await wallet.load();
 * console.log(`Balance: ${wallet.balance} credits`);
 * 
 * // Create a token for payment
 * const token = await wallet.createToken(5);
 * ```
 */
export class Wallet {
  private readonly config: WalletConfig & { proofSelector: typeof smallestFirst; autoReceiveChange: boolean; unit: string };
  private readonly mint: Mint;
  private readonly cashuWallet: CashuWallet;
  private readonly log: Logger;
  private _proofs: Proof[] = [];
  private _loaded = false;
  private eventHandlers: Map<WalletEventType, Set<Function>> = new Map();

  constructor(config: WalletConfig) {
    this.config = {
      ...config,
      proofSelector: config.proofSelector ?? smallestFirst,
      autoReceiveChange: config.autoReceiveChange ?? true,
      unit: config.unit ?? 'usd',
    };

    this.log = createLogger(config.debug);
    this.mint = new Mint(this.config.mintUrl);
    this.cashuWallet = new CashuWallet(this.mint, { unit: this.config.unit });

    this.log.info('Wallet initialized', { 
      mintUrl: this.config.mintUrl, 
      unit: this.config.unit,
    });
  }

  // ===========================================================================
  // State Getters
  // ===========================================================================

  /**
   * Current balance in credits.
   */
  get balance(): number {
    return this._proofs.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Current proofs (readonly copy).
   */
  get proofs(): Proof[] {
    return [...this._proofs];
  }

  /**
   * Mint URL.
   */
  get mintUrl(): string {
    return this.config.mintUrl;
  }

  /**
   * Whether wallet has been loaded from storage.
   */
  get isLoaded(): boolean {
    return this._loaded;
  }

  /**
   * Storage adapter being used.
   */
  get storage(): StorageAdapter {
    return this.config.storage;
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  /**
   * Load proofs from storage.
   * Call this once on app startup.
   */
  async load(): Promise<void> {
    this.log.debug('Loading wallet...');
    try {
      await this.cashuWallet.loadMint();
      this._proofs = await this.config.storage.load();
      this._loaded = true;
      this.log.info('Wallet loaded', { 
        proofCount: this._proofs.length, 
        balance: this.balance,
        proofAmounts: this._proofs.map(p => p.amount),
      });
      this.emit('proofs-change', this._proofs);
      this.emit('balance-change', this.balance);
    } catch (error) {
      this.log.error('Failed to load wallet', { error: String(error) });
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Save current proofs to storage.
   * Called automatically after proof changes if autoReceiveChange is true.
   */
  async save(): Promise<void> {
    this.log.debug('Saving wallet', { proofCount: this._proofs.length, balance: this.balance });
    try {
      await this.config.storage.save(this._proofs);
      this.log.debug('Wallet saved');
    } catch (error) {
      this.log.error('Failed to save wallet', { error: String(error) });
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Clear all proofs from wallet and storage.
   */
  async clear(): Promise<void> {
    this.log.info('Clearing wallet', { previousBalance: this.balance });
    this._proofs = [];
    await this.config.storage.clear();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', 0);
    this.log.info('Wallet cleared');
  }

  // ===========================================================================
  // Token Operations
  // ===========================================================================

  /**
   * Preview what would happen when creating a token.
   * 
   * This method performs a dry-run of token creation without modifying state.
   * Use it to check if a token can be created and what proofs would be used.
   * 
   * @param amount - Amount in credits to preview
   * @returns Preview with selection details and any issues
   * 
   * @example
   * ```ts
   * const preview = wallet.previewToken(5);
   * 
   * if (preview.canCreate) {
   *   console.log(`Will use ${preview.selectedProofs.length} proofs`);
   *   console.log(`Change: ${preview.change} credits`);
   *   if (preview.needsSwap) {
   *     console.log('Will require a mint swap');
   *   }
   * } else {
   *   console.log(`Cannot create token: ${preview.issue}`);
   *   console.log(`Suggestion: ${preview.suggestion}`);
   * }
   * ```
   */
  previewToken(amount: number): TokenPreview {
    // Build denomination info for diagnostics
    const denominations = getDenominations(this._proofs);
    const denominationCounts: Record<number, number> = {};
    for (const proof of this._proofs) {
      denominationCounts[proof.amount] = (denominationCounts[proof.amount] || 0) + 1;
    }

    // Check for invalid amount
    if (amount <= 0) {
      return {
        canCreate: false,
        amount,
        availableBalance: this.balance,
        availableDenominations: denominations,
        denominationCounts,
        selectedProofs: [],
        selectedTotal: 0,
        change: 0,
        needsSwap: false,
        issue: 'Amount must be positive',
        suggestion: generateSuggestion('INVALID_AMOUNT', {
          requestedAmount: amount,
          availableBalance: this.balance,
          availableDenominations: denominations,
        }),
      };
    }

    // Check for insufficient balance
    if (this.balance < amount) {
      return {
        canCreate: false,
        amount,
        availableBalance: this.balance,
        availableDenominations: denominations,
        denominationCounts,
        selectedProofs: [],
        selectedTotal: 0,
        change: 0,
        needsSwap: false,
        issue: `Insufficient balance: need ${amount}, have ${this.balance}`,
        suggestion: generateSuggestion('INSUFFICIENT_BALANCE', {
          requestedAmount: amount,
          availableBalance: this.balance,
          availableDenominations: denominations,
        }),
      };
    }

    // Try to select proofs
    const selected = this.config.proofSelector(this._proofs, amount);
    if (!selected) {
      return {
        canCreate: false,
        amount,
        availableBalance: this.balance,
        availableDenominations: denominations,
        denominationCounts,
        selectedProofs: [],
        selectedTotal: 0,
        change: 0,
        needsSwap: false,
        issue: `Could not select proofs for amount ${amount}`,
        suggestion: generateSuggestion('SELECTION_FAILED', {
          requestedAmount: amount,
          availableBalance: this.balance,
          availableDenominations: denominations,
        }),
      };
    }

    const selectedTotal = selected.reduce((sum, p) => sum + p.amount, 0);
    const change = selectedTotal - amount;
    const needsSwap = selectedTotal !== amount;

    return {
      canCreate: true,
      amount,
      availableBalance: this.balance,
      availableDenominations: denominations,
      denominationCounts,
      selectedProofs: [...selected], // Return copy
      selectedTotal,
      change,
      needsSwap,
    };
  }

  /**
   * Create an encoded token for the specified amount.
   * 
   * @param amount - Amount in credits
   * @returns Encoded token (cashuB format)
   * @throws TokenCreationError with detailed context if creation fails
   * 
   * @example
   * ```ts
   * try {
   *   const token = await wallet.createToken(5);
   *   // Use token for payment
   * } catch (err) {
   *   if (TokenCreationError.isTokenCreationError(err)) {
   *     console.log(err.userMessage);
   *     console.log('Suggestion:', err.suggestion);
   *   }
   * }
   * ```
   */
  async createToken(amount: number): Promise<string> {
    this.log.info('Creating token', { amount, currentBalance: this.balance });

    // Get denomination info for error context
    const denominations = getDenominations(this._proofs);
    const denominationCounts: Record<number, number> = {};
    for (const proof of this._proofs) {
      denominationCounts[proof.amount] = (denominationCounts[proof.amount] || 0) + 1;
    }

    const errorContext = {
      requestedAmount: amount,
      availableBalance: this.balance,
      availableDenominations: denominations,
      denominationCounts,
    };

    if (amount <= 0) {
      this.log.error('Invalid amount', { amount });
      throw new TokenCreationError('Amount must be positive', {
        ...errorContext,
        code: 'INVALID_AMOUNT',
        suggestion: generateSuggestion('INVALID_AMOUNT', errorContext),
      });
    }

    if (this.balance < amount) {
      this.log.error('Insufficient balance', { needed: amount, have: this.balance });
      throw new TokenCreationError(
        `Insufficient balance: need ${amount}, have ${this.balance}`,
        {
          ...errorContext,
          code: 'INSUFFICIENT_BALANCE',
          suggestion: generateSuggestion('INSUFFICIENT_BALANCE', errorContext),
        }
      );
    }

    // Select proofs
    const selected = this.config.proofSelector(this._proofs, amount);
    if (!selected) {
      this.log.error('Could not select proofs', { amount, availableProofs: this._proofs.map(p => p.amount) });
      throw new TokenCreationError(
        `Could not select proofs for amount ${amount}`,
        {
          ...errorContext,
          code: 'SELECTION_FAILED',
          suggestion: generateSuggestion('SELECTION_FAILED', errorContext),
        }
      );
    }

    const selectedTotal = selected.reduce((sum, p) => sum + p.amount, 0);
    this.log.debug('Proofs selected', { 
      selectedCount: selected.length, 
      selectedAmounts: selected.map(p => p.amount),
      selectedTotal,
      needsSwap: selectedTotal !== amount,
    });

    // If exact match, just encode the selected proofs
    if (selectedTotal === amount) {
      this.log.debug('Exact match - no swap needed');
      // Remove selected proofs
      this._proofs = this._proofs.filter(p => !selected.includes(p));
      await this.save();
      this.emit('proofs-change', this._proofs);
      this.emit('balance-change', this.balance);

      const token = getEncodedTokenV4({
        mint: this.config.mintUrl,
        proofs: selected,
        unit: this.config.unit,
      });
      this.log.info('Token created (exact)', { amount, newBalance: this.balance });
      return token;
    }

    // Need to swap for exact amount
    this.log.debug('Swapping for exact amount', { sending: selectedTotal, target: amount });
    const result = await this.cashuWallet.send(amount, selected);
    
    this.log.debug('Swap result', { 
      sendCount: result.send.length,
      sendAmounts: result.send.map(p => p.amount),
      keepCount: result.keep.length,
      keepAmounts: result.keep.map(p => p.amount),
    });
    
    // Update proofs: remove selected, add change (keep)
    this._proofs = this._proofs.filter(p => !selected.includes(p));
    this._proofs.push(...result.keep);
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);

    // Encode the send proofs as token
    const token = getEncodedTokenV4({
      mint: this.config.mintUrl,
      proofs: result.send,
      unit: this.config.unit,
    });
    this.log.info('Token created (with swap)', { amount, newBalance: this.balance });
    return token;
  }

  /**
   * Receive a token and add proofs to wallet.
   * 
   * @param token - Encoded token (cashuA/B format)
   * @returns Amount received
   */
  async receiveToken(token: string): Promise<number> {
    this.log.info('Receiving token', { tokenPrefix: token.substring(0, 20) + '...' });
    
    const decoded = getDecodedToken(token);
    this.log.debug('Token decoded', { 
      mint: decoded.mint, 
      proofCount: decoded.proofs?.length || 0,
      proofAmounts: decoded.proofs?.map(p => p.amount),
    });
    
    // Verify mint matches
    if (decoded.mint && decoded.mint !== this.config.mintUrl) {
      this.log.error('Mint mismatch', { tokenMint: decoded.mint, walletMint: this.config.mintUrl });
      throw new Error(`Token is for different mint: ${decoded.mint}`);
    }

    // Get proofs from token
    const tokenProofs = decoded.proofs || [];
    if (tokenProofs.length === 0) {
      this.log.error('Empty token');
      throw new Error('Token contains no proofs');
    }

    // Swap proofs to get fresh ones (prevents double-spend by sender)
    this.log.debug('Swapping proofs with mint...');
    const received = await this.cashuWallet.receive(token);
    
    const amount = received.reduce((sum, p) => sum + p.amount, 0);
    this.log.debug('Received proofs from swap', { 
      receivedCount: received.length,
      receivedAmounts: received.map(p => p.amount),
      totalAmount: amount,
    });
    
    // Add to wallet
    this._proofs.push(...received);
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);

    this.log.info('Token received', { amount, newBalance: this.balance });
    return amount;
  }

  /**
   * Receive change token (convenience method).
   * Same as receiveToken but with clearer intent.
   */
  async receiveChange(changeToken: string): Promise<number> {
    return this.receiveToken(changeToken);
  }

  // ===========================================================================
  // Proof Management
  // ===========================================================================

  /**
   * Add proofs directly to wallet.
   * Use receiveToken for tokens from external sources.
   */
  async addProofs(proofs: Proof[]): Promise<void> {
    this._proofs.push(...proofs);
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);
  }

  /**
   * Remove specific proofs from wallet.
   */
  async removeProofs(proofsToRemove: Proof[]): Promise<void> {
    const removeSet = new Set(proofsToRemove.map(p => p.C));
    this._proofs = this._proofs.filter(p => !removeSet.has(p.C));
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);
  }

  /**
   * Check proofs against mint to find spent ones.
   */
  async checkProofs(): Promise<CheckProofsResult> {
    return checkProofState(this.config.mintUrl, this._proofs);
  }

  /**
   * Remove spent proofs from wallet.
   * @returns Number of proofs removed
   */
  async pruneSpent(): Promise<number> {
    const { valid, spent } = await this.checkProofs();
    
    if (spent.length === 0) {
      return 0;
    }

    this._proofs = valid;
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);

    return spent.length;
  }

  // ===========================================================================
  // Defragmentation
  // ===========================================================================

  /**
   * Get defragmentation statistics for the wallet.
   * 
   * @returns Defragmentation stats and recommendation
   * 
   * @example
   * ```ts
   * const stats = wallet.getDefragStats();
   * console.log(`Fragmentation: ${(stats.fragmentation * 100).toFixed(0)}%`);
   * console.log(`Recommendation: ${stats.recommendation}`);
   * ```
   */
  getDefragStats(): DefragStats {
    return getDefragStats(this._proofs);
  }

  /**
   * Check if defragmentation is recommended.
   * 
   * @returns true if defragmentation would be beneficial
   */
  needsDefragmentation(): boolean {
    const stats = this.getDefragStats();
    return stats.recommendation === 'recommended' || stats.recommendation === 'urgent';
  }

  /**
   * Defragment wallet proofs by consolidating them with the mint.
   * 
   * Fragmentation occurs when a wallet accumulates many small proofs
   * from repeated change operations. This method swaps all proofs
   * with the mint to get back an optimal set of denominations.
   * 
   * **Note:** This operation involves a network request to the mint.
   * The total balance should remain unchanged (minus any mint fees).
   * 
   * @returns Defragmentation result with before/after proof counts
   * @throws Error if wallet has no proofs or defragmentation fails
   * 
   * @example
   * ```ts
   * // Check if defragmentation is needed
   * if (wallet.needsDefragmentation()) {
   *   console.log('Defragmenting wallet...');
   *   const result = await wallet.defragment();
   *   console.log(`Reduced ${result.previousProofCount} proofs to ${result.newProofCount}`);
   * }
   * 
   * // Or just defragment unconditionally
   * const result = await wallet.defragment();
   * ```
   */
  async defragment(): Promise<{
    previousProofCount: number;
    newProofCount: number;
    previousBalance: number;
    newBalance: number;
    saved: number;
  }> {
    if (this._proofs.length === 0) {
      this.log.info('Defragment: No proofs to defragment');
      return {
        previousProofCount: 0,
        newProofCount: 0,
        previousBalance: 0,
        newBalance: 0,
        saved: 0,
      };
    }

    const previousProofCount = this._proofs.length;
    const previousBalance = this.balance;

    this.log.info('Starting defragmentation', {
      proofCount: previousProofCount,
      balance: previousBalance,
      proofAmounts: this._proofs.map(p => p.amount),
    });

    try {
      // Swap all proofs with mint to get optimal denominations
      // The mint will return the same total value in optimal proof sizes
      const result = await this.cashuWallet.send(previousBalance, this._proofs);

      // Combine send and keep proofs - the mint's "send" is what we're getting back
      // In a self-swap scenario, we're sending to ourselves
      const newProofs = [...result.send, ...result.keep];
      const newBalance = newProofs.reduce((sum, p) => sum + p.amount, 0);

      this.log.debug('Defragmentation swap result', {
        sendCount: result.send.length,
        sendAmounts: result.send.map(p => p.amount),
        keepCount: result.keep.length,
        keepAmounts: result.keep.map(p => p.amount),
        newBalance,
      });

      // Update wallet with new proofs
      this._proofs = newProofs;
      await this.save();
      this.emit('proofs-change', this._proofs);
      this.emit('balance-change', this.balance);

      const saved = previousProofCount - newProofs.length;
      this.log.info('Defragmentation complete', {
        previousProofCount,
        newProofCount: newProofs.length,
        previousBalance,
        newBalance,
        saved,
      });

      return {
        previousProofCount,
        newProofCount: newProofs.length,
        previousBalance,
        newBalance,
        saved,
      };
    } catch (error) {
      this.log.error('Defragmentation failed', { error: String(error) });
      throw error;
    }
  }

  // ===========================================================================
  // Minting (NUT-04)
  // ===========================================================================

  /**
   * Create a mint quote (get Lightning invoice).
   * 
   * @param amount - Amount in credits to mint
   * @returns Mint quote with Lightning invoice
   */
  async createMintQuote(amount: number): Promise<MintQuote> {
    const quote = await this.cashuWallet.createMintQuote(amount);
    
    return {
      id: quote.quote,
      request: quote.request,
      amount,
      expiry: quote.expiry,
      paid: quote.state === 'PAID',
    };
  }

  /**
   * Check if a mint quote has been paid.
   */
  async checkMintQuote(quoteId: string): Promise<MintQuote> {
    const quote = await this.cashuWallet.checkMintQuote(quoteId);
    
    return {
      id: quote.quote,
      request: quote.request,
      amount: quote.amount || 0,
      expiry: quote.expiry,
      paid: quote.state === 'PAID',
    };
  }

  /**
   * Mint tokens from a paid quote.
   * 
   * @param quote - Quote or quote ID
   * @returns Amount minted
   */
  async mintTokens(quote: MintQuote | string): Promise<number> {
    const quoteId = typeof quote === 'string' ? quote : quote.id;
    const amount = typeof quote === 'string' ? undefined : quote.amount;
    
    const proofs = await this.cashuWallet.mintProofs(amount || 0, quoteId);
    
    this._proofs.push(...proofs);
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);

    return proofs.reduce((sum, p) => sum + p.amount, 0);
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Subscribe to wallet events.
   */
  on<E extends WalletEventType>(event: E, handler: WalletEventHandlers[E]): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from wallet events.
   */
  off<E extends WalletEventType>(event: E, handler: WalletEventHandlers[E]): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit<E extends WalletEventType>(event: E, data: Parameters<WalletEventHandlers[E]>[0]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as Function)(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      }
    }
  }
}
