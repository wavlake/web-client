/**
 * Smart Token Prebuild
 * 
 * Analyzes track prices and pre-builds tokens with matching denominations.
 * This avoids mint swaps at play time by having exact-amount tokens ready.
 * 
 * Strategy:
 * 1. Scan track list for unique prices
 * 2. Build 1-2 tokens per price point
 * 3. Prioritize lower prices (more likely to be played)
 * 
 * Toggle: Set ENABLED = false to disable
 */

import { Wallet, Mint, getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { CONFIG } from './config';
import { debugLog } from '../stores/debug';
import { useWalletStore } from '../stores/wallet';

// Feature toggle
export const SMART_PREBUILD_ENABLED = true;

// Max tokens to build per denomination
const TOKENS_PER_PRICE = 2;

// Max total tokens to prebuild
const MAX_TOTAL_TOKENS = 10;

// Cached wallet instance
let wallet: Wallet | null = null;

interface PrebuiltToken {
  token: string;
  amount: number;
  createdAt: number;
}

// Token storage (separate from tokenCache to keep features independent)
let smartTokens: PrebuiltToken[] = [];

/**
 * Get unique prices from track list, sorted ascending
 */
export function extractPrices(tracks: Array<{ metadata: { price_credits?: number; access_mode?: string } }>): number[] {
  const prices = new Set<number>();
  
  for (const track of tracks) {
    if (track.metadata.access_mode === 'paywall' && track.metadata.price_credits) {
      prices.add(track.metadata.price_credits);
    }
  }
  
  // Sort ascending (prioritize cheaper tracks)
  return Array.from(prices).sort((a, b) => a - b);
}

/**
 * Initialize wallet for swapping
 */
async function getWallet(): Promise<Wallet> {
  if (wallet) return wallet;
  
  const mint = new Mint(CONFIG.MINT_URL);
  wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  
  return wallet;
}

/**
 * Build tokens for specific denominations
 */
export async function prebuildForPrices(prices: number[]): Promise<number> {
  if (!SMART_PREBUILD_ENABLED) {
    debugLog('smartPrebuild', 'Feature disabled');
    return 0;
  }

  if (prices.length === 0) {
    debugLog('smartPrebuild', 'No prices to prebuild');
    return 0;
  }

  const walletStore = useWalletStore.getState();
  let proofs = walletStore.proofs;
  const balance = proofs.reduce((s, p) => s + p.amount, 0);

  if (balance === 0) {
    debugLog('smartPrebuild', 'No balance available');
    return 0;
  }

  debugLog('smartPrebuild', 'Starting smart prebuild', {
    prices,
    balance,
    tokensPerPrice: TOKENS_PER_PRICE,
  });

  const startTime = performance.now();
  const w = await getWallet();
  let totalBuilt = 0;

  for (const price of prices) {
    // Check limits
    if (totalBuilt >= MAX_TOTAL_TOKENS) {
      debugLog('smartPrebuild', 'Max tokens reached');
      break;
    }

    // How many do we already have for this price?
    const existing = smartTokens.filter(t => t.amount === price).length;
    const needed = Math.min(TOKENS_PER_PRICE - existing, MAX_TOTAL_TOKENS - totalBuilt);

    if (needed <= 0) continue;

    debugLog('smartPrebuild', `Building ${needed} tokens for ${price} credits`);

    for (let i = 0; i < needed; i++) {
      const proofBalance = proofs.reduce((s, p) => s + p.amount, 0);
      if (proofBalance < price) {
        debugLog('smartPrebuild', 'Insufficient balance', { needed: price, have: proofBalance });
        break;
      }

      try {
        const result = await w.send(price, proofs);
        
        const token = getEncodedTokenV4({
          mint: CONFIG.MINT_URL,
          proofs: result.send,
          unit: 'usd',
        });

        smartTokens.push({
          token,
          amount: price,
          createdAt: Date.now(),
        });

        proofs = result.keep;
        totalBuilt++;
      } catch (err) {
        debugLog('error', 'Prebuild swap failed', { 
          price, 
          error: err instanceof Error ? err.message : 'unknown' 
        });
        break;
      }
    }
  }

  // Update wallet store with remaining proofs
  if (totalBuilt > 0) {
    const allSecrets = walletStore.proofs.map(p => p.secret);
    walletStore.removeProofs(allSecrets);
    if (proofs.length > 0) {
      walletStore.addProofs(proofs);
    }
  }

  const elapsed = performance.now() - startTime;
  debugLog('smartPrebuild', `Built ${totalBuilt} tokens in ${elapsed.toFixed(0)}ms`, {
    tokensByAmount: getTokenCounts(),
  });

  return totalBuilt;
}

/**
 * Get a token for a specific amount
 */
export function getTokenForAmount(amount: number): PrebuiltToken | null {
  const index = smartTokens.findIndex(t => t.amount === amount);
  if (index === -1) return null;
  
  const [token] = smartTokens.splice(index, 1);
  debugLog('smartPrebuild', `Used token for ${amount} credits`, {
    remaining: getTokenCounts(),
  });
  
  return token;
}

/**
 * Check if we have a token for a specific amount
 */
export function hasTokenForAmount(amount: number): boolean {
  return smartTokens.some(t => t.amount === amount);
}

/**
 * Get token counts by amount
 */
export function getTokenCounts(): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const t of smartTokens) {
    counts[t.amount] = (counts[t.amount] || 0) + 1;
  }
  return counts;
}

/**
 * Get all tokens (for debugging)
 */
export function getAllTokens(): PrebuiltToken[] {
  return [...smartTokens];
}

/**
 * Clear all prebuilt tokens
 */
export function clearSmartTokens(): void {
  smartTokens = [];
  debugLog('smartPrebuild', 'Cleared all tokens');
}

/**
 * Convenience: Prebuild from track list
 */
export async function prebuildFromTracks(
  tracks: Array<{ metadata: { price_credits?: number; access_mode?: string } }>
): Promise<number> {
  const prices = extractPrices(tracks);
  return prebuildForPrices(prices);
}
