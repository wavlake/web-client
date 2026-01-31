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
} from './types.js';
import type { StorageAdapter } from './storage/interface.js';
import { smallestFirst } from './selectors/smallest.js';
import { checkProofState } from './checkstate.js';

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
  private readonly config: Required<WalletConfig>;
  private readonly mint: Mint;
  private readonly cashuWallet: CashuWallet;
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

    this.mint = new Mint(this.config.mintUrl);
    this.cashuWallet = new CashuWallet(this.mint, { unit: this.config.unit });
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
    try {
      await this.cashuWallet.loadMint();
      this._proofs = await this.config.storage.load();
      this._loaded = true;
      this.emit('proofs-change', this._proofs);
      this.emit('balance-change', this.balance);
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Save current proofs to storage.
   * Called automatically after proof changes if autoReceiveChange is true.
   */
  async save(): Promise<void> {
    try {
      await this.config.storage.save(this._proofs);
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Clear all proofs from wallet and storage.
   */
  async clear(): Promise<void> {
    this._proofs = [];
    await this.config.storage.clear();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', 0);
  }

  // ===========================================================================
  // Token Operations
  // ===========================================================================

  /**
   * Create an encoded token for the specified amount.
   * 
   * @param amount - Amount in credits
   * @returns Encoded token (cashuB format)
   * @throws Error if insufficient balance
   */
  async createToken(amount: number): Promise<string> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (this.balance < amount) {
      throw new Error(`Insufficient balance: need ${amount}, have ${this.balance}`);
    }

    // Select proofs
    const selected = this.config.proofSelector(this._proofs, amount);
    if (!selected) {
      throw new Error(`Could not select proofs for amount ${amount}`);
    }

    const selectedTotal = selected.reduce((sum, p) => sum + p.amount, 0);

    // If exact match, just encode the selected proofs
    if (selectedTotal === amount) {
      // Remove selected proofs
      this._proofs = this._proofs.filter(p => !selected.includes(p));
      await this.save();
      this.emit('proofs-change', this._proofs);
      this.emit('balance-change', this.balance);

      return getEncodedTokenV4({
        mint: this.config.mintUrl,
        proofs: selected,
        unit: this.config.unit,
      });
    }

    // Need to swap for exact amount
    const result = await this.cashuWallet.send(amount, selected);
    
    // Update proofs: remove selected, add change (keep)
    this._proofs = this._proofs.filter(p => !selected.includes(p));
    this._proofs.push(...result.keep);
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);

    // Encode the send proofs as token
    return getEncodedTokenV4({
      mint: this.config.mintUrl,
      proofs: result.send,
      unit: this.config.unit,
    });
  }

  /**
   * Receive a token and add proofs to wallet.
   * 
   * @param token - Encoded token (cashuA/B format)
   * @returns Amount received
   */
  async receiveToken(token: string): Promise<number> {
    const decoded = getDecodedToken(token);
    
    // Verify mint matches
    if (decoded.mint && decoded.mint !== this.config.mintUrl) {
      throw new Error(`Token is for different mint: ${decoded.mint}`);
    }

    // Get proofs from token
    const tokenProofs = decoded.proofs || [];
    if (tokenProofs.length === 0) {
      throw new Error('Token contains no proofs');
    }

    // Swap proofs to get fresh ones (prevents double-spend by sender)
    const received = await this.cashuWallet.receive(token);
    
    // Add to wallet
    this._proofs.push(...received);
    await this.save();
    this.emit('proofs-change', this._proofs);
    this.emit('balance-change', this.balance);

    return received.reduce((sum, p) => sum + p.amount, 0);
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
