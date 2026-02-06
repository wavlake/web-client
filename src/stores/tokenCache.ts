/**
 * Token Cache Store
 * 
 * Pre-builds Cashu tokens with exact denomination for single-request playback.
 * This is the "fast path" - tokens are ready to use immediately, no mint swap needed.
 * 
 * Flow:
 * 1. On app load / after minting, call prebuildTokens()
 * 2. Tokens are swapped to exact 1-credit denomination
 * 3. On play, pop a token and make single request with X-Ecash-Token header
 * 4. Replenish cache when low
 * 
 * @see scripts/benchmarks/benchmark-single-request.mjs for the approach
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Wallet, Mint, getEncodedTokenV4 } from '@cashu/cashu-ts';
import { CONFIG } from '../lib/config';
import { debugLog } from './debug';
import { useWalletStore } from './wallet';

// Default token denomination (1 credit = $0.01)
const TOKEN_DENOMINATION = 1;

// How many tokens to keep in cache
const TARGET_CACHE_SIZE = 5;

// Minimum cache size before auto-replenish
const MIN_CACHE_SIZE = 2;

interface PrebuiltToken {
  /** Encoded Cashu v4 token string */
  token: string;
  /** Amount in credits */
  amount: number;
  /** When this token was created */
  createdAt: number;
}

interface TokenCacheState {
  /** Pre-built tokens ready to use */
  tokens: PrebuiltToken[];
  
  /** Cached wallet instance */
  wallet: Wallet | null;
  
  /** Whether wallet is initialized */
  isWalletReady: boolean;
  
  /** Whether we're currently building tokens */
  isBuilding: boolean;
  
  /** Last error */
  error: string | null;
  
  // Actions
  initWallet: () => Promise<void>;
  prebuildTokens: (count?: number) => Promise<number>;
  popToken: () => PrebuiltToken | null;
  getTokenCount: () => number;
  clear: () => void;
}

export const useTokenCacheStore = create<TokenCacheState>()(
  persist(
    (set, get) => ({
      tokens: [],
      wallet: null,
      isWalletReady: false,
      isBuilding: false,
      error: null,

      initWallet: async () => {
        const { wallet, isWalletReady } = get();
        
        // Already initialized
        if (isWalletReady && wallet) {
          debugLog('tokenCache', 'Wallet already initialized');
          return;
        }

        debugLog('tokenCache', 'Initializing wallet...');
        const startTime = performance.now();

        try {
          const mint = new Mint(CONFIG.MINT_URL);
          const newWallet = new Wallet(mint, { unit: 'usd' });
          await newWallet.loadMint();

          const elapsed = performance.now() - startTime;
          debugLog('tokenCache', `Wallet initialized in ${elapsed.toFixed(0)}ms`);

          set({ wallet: newWallet, isWalletReady: true, error: null });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          debugLog('error', 'Wallet init failed', { error: message });
          set({ error: message, isWalletReady: false });
        }
      },

      prebuildTokens: async (count = TARGET_CACHE_SIZE) => {
        const { wallet, isWalletReady, isBuilding, tokens } = get();

        if (isBuilding) {
          debugLog('tokenCache', 'Already building tokens, skipping');
          return 0;
        }

        if (!isWalletReady || !wallet) {
          debugLog('tokenCache', 'Wallet not ready, initializing first...');
          await get().initWallet();
          // Re-check after init
          const updated = get();
          if (!updated.isWalletReady || !updated.wallet) {
            debugLog('error', 'Could not initialize wallet');
            return 0;
          }
        }

        // Get available proofs from wallet store (excludes pending)
        const walletStore = useWalletStore.getState();
        const pendingSecrets = new Set<string>();
        for (const pending of Object.values(walletStore.pendingProofs)) {
          for (const proof of pending.proofs) {
            pendingSecrets.add(proof.secret);
          }
        }
        let proofs = walletStore.proofs.filter(p => !pendingSecrets.has(p.secret));
        const balance = proofs.reduce((s, p) => s + p.amount, 0);

        // How many tokens do we need?
        const currentCount = tokens.length;
        const needed = Math.min(count - currentCount, balance);

        if (needed <= 0) {
          debugLog('tokenCache', 'No tokens needed or insufficient balance', {
            currentCount,
            targetCount: count,
            balance,
          });
          return 0;
        }

        set({ isBuilding: true, error: null });
        debugLog('tokenCache', `Building ${needed} tokens...`, { balance });

        const startTime = performance.now();
        const newTokens: PrebuiltToken[] = [];
        const currentWallet = get().wallet!;

        try {
          for (let i = 0; i < needed; i++) {
            // Check we still have enough proofs
            const proofBalance = proofs.reduce((s, p) => s + p.amount, 0);
            if (proofBalance < TOKEN_DENOMINATION) {
              debugLog('tokenCache', 'Insufficient proofs, stopping', { 
                built: i, 
                remaining: proofBalance 
              });
              break;
            }

            // Swap to get exact denomination
            const result = await currentWallet.send(TOKEN_DENOMINATION, proofs);

            // Create pre-encoded token
            const token = getEncodedTokenV4({
              mint: CONFIG.MINT_URL,
              proofs: result.send,
              unit: 'usd',
            });

            newTokens.push({
              token,
              amount: TOKEN_DENOMINATION,
              createdAt: Date.now(),
            });

            // Update remaining proofs for next iteration
            proofs = result.keep;
          }

          const elapsed = performance.now() - startTime;
          debugLog('tokenCache', `Built ${newTokens.length} tokens in ${elapsed.toFixed(0)}ms`);

          // Update wallet store with remaining proofs
          // First remove all old proofs, then add the remaining ones
          const allSecrets = walletStore.proofs.map(p => p.secret);
          walletStore.removeProofs(allSecrets);
          if (proofs.length > 0) {
            walletStore.addProofs(proofs);
          }

          // Add new tokens to cache
          set((state) => ({
            tokens: [...state.tokens, ...newTokens],
            isBuilding: false,
          }));

          return newTokens.length;

        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          debugLog('error', 'Token building failed', { error: message });
          set({ isBuilding: false, error: message });
          return newTokens.length; // Return however many we built
        }
      },

      popToken: () => {
        const { tokens } = get();
        
        if (tokens.length === 0) {
          debugLog('tokenCache', 'No tokens available');
          return null;
        }

        const [token, ...remaining] = tokens;
        debugLog('tokenCache', `Popped token, ${remaining.length} remaining`);

        set({ tokens: remaining });

        // Auto-replenish if low
        if (remaining.length < MIN_CACHE_SIZE) {
          debugLog('tokenCache', 'Cache low, triggering replenish...');
          // Fire and forget - don't block
          get().prebuildTokens().catch(() => {});
        }

        return token;
      },

      getTokenCount: () => {
        return get().tokens.length;
      },

      clear: () => {
        debugLog('tokenCache', 'Clearing token cache');
        set({ tokens: [], error: null });
      },
    }),
    {
      name: 'wavlake-token-cache',
      partialize: (state) => ({ tokens: state.tokens }),
    }
  )
);

/**
 * Initialize the token cache on app load.
 * Call this early (e.g., in App.tsx or main.tsx).
 */
export async function initTokenCache(): Promise<void> {
  const store = useTokenCacheStore.getState();
  
  debugLog('tokenCache', 'Initializing token cache...');
  
  // Initialize wallet
  await store.initWallet();
  
  // Build initial tokens if we have balance
  const balance = useWalletStore.getState().getBalance();
  if (balance > 0) {
    await store.prebuildTokens();
  }
  
  debugLog('tokenCache', 'Token cache ready', {
    tokenCount: store.getTokenCount(),
    walletBalance: useWalletStore.getState().getBalance(),
  });
}
