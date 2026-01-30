/**
 * Wavlake Credits Client
 * 
 * Minimal implementation for paying to play tracks with Cashu ecash.
 * ~200 lines, zero external dependencies beyond cashu-ts.
 * 
 * Usage:
 *   const client = new WavlakeCreditsClient({ mintUrl, apiUrl });
 *   await client.init();
 *   const { url } = await client.playTrack('track-dtag');
 */

import { 
  Wallet, 
  Mint, 
  getEncodedTokenV4, 
  type Proof 
} from '@cashu/cashu-ts';

// ============================================================
// TYPES
// ============================================================

export interface CreditsClientConfig {
  /** Cashu mint URL (e.g., https://mint.wavlake.com) */
  mintUrl: string;
  /** Wavlake API base URL (e.g., https://api.wavlake.com) */
  apiUrl: string;
  /** Storage key for proofs (default: 'wavlake-credits') */
  storageKey?: string;
}

export interface PlayResult {
  /** Signed audio URL */
  url: string;
  /** Credits spent */
  creditsSpent: number;
}

interface PrebuiltToken {
  token: string;
  amount: number;
}

// ============================================================
// CLIENT
// ============================================================

export class WavlakeCreditsClient {
  private config: Required<CreditsClientConfig>;
  private wallet: Wallet | null = null;
  private proofs: Proof[] = [];
  private prebuiltTokens: PrebuiltToken[] = [];

  constructor(config: CreditsClientConfig) {
    this.config = {
      ...config,
      storageKey: config.storageKey ?? 'wavlake-credits',
    };
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Initialize wallet and load saved proofs.
   * Call once on app load.
   */
  async init(): Promise<void> {
    // Load saved proofs
    this.loadProofs();

    // Initialize Cashu wallet
    const mint = new Mint(this.config.mintUrl);
    this.wallet = new Wallet(mint, { unit: 'usd' });
    await this.wallet.loadMint();
  }

  private loadProofs(): void {
    try {
      const saved = localStorage.getItem(this.config.storageKey);
      if (saved) {
        this.proofs = JSON.parse(saved);
      }
    } catch {
      this.proofs = [];
    }
  }

  private saveProofs(): void {
    localStorage.setItem(this.config.storageKey, JSON.stringify(this.proofs));
  }

  // ----------------------------------------------------------
  // BALANCE
  // ----------------------------------------------------------

  /**
   * Get current balance in credits.
   */
  getBalance(): number {
    return this.proofs.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Get proofs (for advanced use cases).
   */
  getProofs(): Proof[] {
    return [...this.proofs];
  }

  // ----------------------------------------------------------
  // MINTING (from Lightning payment)
  // ----------------------------------------------------------

  /**
   * Mint credits from a paid Lightning quote.
   * 
   * @param quoteId - Quote ID from mint quote endpoint
   * @param amount - Amount in credits
   */
  async mintCredits(quoteId: string, amount: number): Promise<void> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    const newProofs = await this.wallet.mintProofs(amount, quoteId);
    this.proofs.push(...newProofs);
    this.saveProofs();
  }

  // ----------------------------------------------------------
  // TOKEN PRE-BUILDING (optimization)
  // ----------------------------------------------------------

  /**
   * Pre-build tokens with exact denominations.
   * Call this after loading track list to enable fast-path playback.
   * 
   * @param amounts - Array of credit amounts to prebuild (e.g., [1, 2, 5])
   * @param countPerAmount - Tokens to build per amount (default: 2)
   */
  async prebuildTokens(amounts: number[], countPerAmount = 2): Promise<void> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    for (const amount of amounts) {
      for (let i = 0; i < countPerAmount; i++) {
        if (this.getBalance() < amount) break;

        try {
          const result = await this.wallet.send(amount, this.proofs);
          
          const token = getEncodedTokenV4({
            mint: this.config.mintUrl,
            proofs: result.send,
            unit: 'usd',
          });

          this.prebuiltTokens.push({ token, amount });
          this.proofs = result.keep;
        } catch {
          break;
        }
      }
    }

    this.saveProofs();
  }

  /**
   * Check if a pre-built token exists for an amount.
   */
  hasTokenForAmount(amount: number): boolean {
    return this.prebuiltTokens.some(t => t.amount === amount);
  }

  // ----------------------------------------------------------
  // PLAY TRACK
  // ----------------------------------------------------------

  /**
   * Pay for and get audio URL for a track.
   * 
   * Fast path: Uses pre-built token if available (~120ms)
   * Slow path: Discovers price, swaps, pays (~500ms)
   * 
   * @param dtag - Track d-tag identifier
   * @returns Signed audio URL
   */
  async playTrack(dtag: string): Promise<PlayResult> {
    // Try fast path with pre-built token
    const prebuilt = await this.tryFastPath(dtag);
    if (prebuilt) return prebuilt;

    // Fall back to slow path
    return this.slowPath(dtag);
  }

  private async tryFastPath(dtag: string): Promise<PlayResult | null> {
    // Need to know the price - check if we have any prebuilt tokens
    // In production, you'd get price from track metadata
    for (const prebuilt of this.prebuiltTokens) {
      const result = await this.requestWithToken(dtag, prebuilt.token);
      if (result) {
        // Remove used token
        const idx = this.prebuiltTokens.indexOf(prebuilt);
        this.prebuiltTokens.splice(idx, 1);
        return { url: result, creditsSpent: prebuilt.amount };
      }
    }
    return null;
  }

  private async slowPath(dtag: string): Promise<PlayResult> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    // Step 1: Discover price
    const url = `${this.config.apiUrl}/api/v1/content/${dtag}`;
    const discoveryResp = await fetch(url);

    if (discoveryResp.ok) {
      // Free track
      const data = await discoveryResp.json();
      return { url: data.data?.url || data.url, creditsSpent: 0 };
    }

    if (discoveryResp.status !== 402) {
      throw new Error(`Unexpected status: ${discoveryResp.status}`);
    }

    const { price_credits: price } = await discoveryResp.json();

    // Step 2: Check balance
    if (this.getBalance() < price) {
      throw new Error(`Insufficient balance: need ${price}, have ${this.getBalance()}`);
    }

    // Step 3: Swap to exact amount
    const result = await this.wallet.send(price, this.proofs);
    this.proofs = result.keep;
    this.saveProofs();

    // Step 4: Create token and pay
    const token = getEncodedTokenV4({
      mint: this.config.mintUrl,
      proofs: result.send,
      unit: 'usd',
    });

    const audioUrl = await this.requestWithToken(dtag, token);
    if (!audioUrl) {
      throw new Error('Payment failed');
    }

    return { url: audioUrl, creditsSpent: price };
  }

  private async requestWithToken(dtag: string, token: string): Promise<string | null> {
    const url = `${this.config.apiUrl}/api/v1/content/${dtag}`;
    
    const resp = await fetch(url, {
      headers: { 'X-Ecash-Token': token },
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    return data.data?.url || data.url;
  }
}
