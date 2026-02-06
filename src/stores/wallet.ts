/**
 * Wallet Store
 *
 * Zustand store for managing Cashu proofs with deferred debit model.
 * 
 * Key patterns (ported from monorepo paywall-poc):
 * - Proofs stay in wallet until payment is confirmed (X-Payment-Settled)
 * - Pending proofs tracked per-track for recovery on early stop
 * - Recovery timers validate against mint at 60s checkpoint
 * - Startup validation removes spent proofs
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Proof } from '@cashu/cashu-ts';
import { debugLog } from './debug';

// ============================================================================
// Constants
// ============================================================================

const HYDRATION_TIMEOUT_MS = 5000;
const PENDING_RECOVERY_MIN_AGE_MS = 60000; // 60 seconds
const PENDING_EXPIRY_AGE_MS = 600000; // 10 minutes

// ============================================================================
// Types
// ============================================================================

/**
 * Pending proof entry for tracking proofs sent to server but not yet confirmed.
 * Used for recovery when user skips track before 60s checkpoint.
 */
export interface PendingProof {
  trackDtag: string;
  sentAt: number;
  proofs: Proof[];
  timerId?: ReturnType<typeof setTimeout>;
  isVerifying?: boolean;
}

interface WalletState {
  proofs: Proof[];
  pendingProofs: Record<string, PendingProof>;

  // Computed
  getBalance: () => number;
  getAvailableBalance: () => number;
  getPendingBalance: () => number;

  // Actions
  addProofs: (proofs: Proof[]) => void;
  removeProofs: (secrets: string[]) => void;
  selectProofsForAmount: (amount: number) => { selected: Proof[]; remaining: Proof[] } | null;
  reset: () => void;

  // Exact-denomination methods
  findExactProof: (amount: number) => Proof | null;
  countExactProofs: (amount: number) => number;

  // Pending proof tracking (deferred debit model)
  markProofsPending: (trackDtag: string, proofs: Proof[]) => void;
  resolvePendingProofs: (trackDtag: string, spent: boolean) => void;
  getPendingProofs: (trackDtag: string) => PendingProof | undefined;
  getAllPendingProofs: () => PendingProof[];

  // Recovery timers
  startRecoveryTimer: (trackDtag: string, delayMs: number, validateFn: (proofs: Proof[]) => Promise<{ unspent: Proof[]; spentSecrets: string[] }>) => void;
  cancelRecoveryTimer: (trackDtag: string) => void;
}

// ============================================================================
// Hydration State
// ============================================================================

interface HydrationState {
  isHydrated: boolean;
  resolve: (() => void) | null;
  reject: ((err: Error) => void) | null;
  promise: Promise<void> | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

const hydrationState: HydrationState = {
  isHydrated: false,
  resolve: null,
  reject: null,
  promise: null,
  timeoutId: null,
};

function getHydrationPromise(): Promise<void> {
  if (hydrationState.isHydrated) return Promise.resolve();
  if (!hydrationState.promise) {
    hydrationState.promise = new Promise<void>((resolve, reject) => {
      hydrationState.resolve = resolve;
      hydrationState.reject = reject;
      hydrationState.timeoutId = setTimeout(() => {
        if (!hydrationState.isHydrated) {
          reject(new Error(`Wallet hydration timed out after ${HYDRATION_TIMEOUT_MS}ms`));
        }
      }, HYDRATION_TIMEOUT_MS);
    });
  }
  return hydrationState.promise;
}

function markHydrated(): void {
  if (hydrationState.timeoutId) clearTimeout(hydrationState.timeoutId);
  hydrationState.isHydrated = true;
  hydrationState.resolve?.();
  hydrationState.promise = null;
  hydrationState.resolve = null;
  hydrationState.reject = null;
  hydrationState.timeoutId = null;
}

// ============================================================================
// Store
// ============================================================================

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      proofs: [],
      pendingProofs: {},

      getBalance: () => get().proofs.reduce((sum, p) => sum + p.amount, 0),

      getAvailableBalance: () => {
        const state = get();
        const pendingSecrets = new Set<string>();
        for (const pending of Object.values(state.pendingProofs)) {
          for (const proof of pending.proofs) {
            pendingSecrets.add(proof.secret);
          }
        }
        return state.proofs
          .filter((p) => !pendingSecrets.has(p.secret))
          .reduce((sum, p) => sum + p.amount, 0);
      },

      getPendingBalance: () => {
        let total = 0;
        for (const pending of Object.values(get().pendingProofs)) {
          for (const proof of pending.proofs) {
            total += proof.amount;
          }
        }
        return total;
      },

      addProofs: (newProofs) => {
        if (newProofs.length === 0) return;
        const amount = newProofs.reduce((sum, p) => sum + p.amount, 0);
        debugLog('wallet', 'Adding proofs', { count: newProofs.length, amount });
        set((state) => ({ proofs: [...state.proofs, ...newProofs] }));
      },

      removeProofs: (secrets) => {
        if (secrets.length === 0) return;
        const secretSet = new Set(secrets);
        debugLog('wallet', 'Removing proofs', { count: secrets.length });
        set((state) => ({
          proofs: state.proofs.filter((p) => !secretSet.has(p.secret)),
        }));
      },

      selectProofsForAmount: (amount) => {
        const state = get();
        
        // Exclude pending proofs from selection
        const pendingSecrets = new Set<string>();
        for (const pending of Object.values(state.pendingProofs)) {
          for (const proof of pending.proofs) {
            pendingSecrets.add(proof.secret);
          }
        }
        
        const availableProofs = state.proofs.filter((p) => !pendingSecrets.has(p.secret));
        const availableBalance = availableProofs.reduce((sum, p) => sum + p.amount, 0);

        if (availableBalance < amount) {
          const totalBalance = state.proofs.reduce((sum, p) => sum + p.amount, 0);
          debugLog('wallet', 'Insufficient available balance', {
            required: amount,
            available: availableBalance,
            totalBalance,
            pendingCount: pendingSecrets.size,
          });
          return null;
        }

        const sorted = [...availableProofs].sort((a, b) => a.amount - b.amount);
        const selected: Proof[] = [];
        let selectedAmount = 0;

        for (const proof of sorted) {
          if (selectedAmount >= amount) break;
          selected.push(proof);
          selectedAmount += proof.amount;
        }

        debugLog('wallet', 'Proofs selected', {
          required: amount,
          selected: selectedAmount,
          proofCount: selected.length,
        });

        return { selected, remaining: sorted.filter((p) => !selected.includes(p)) };
      },

      reset: () => {
        const state = get();
        Object.values(state.pendingProofs).forEach((p) => {
          if (p.timerId) clearTimeout(p.timerId);
        });
        debugLog('wallet', 'Wallet reset');
        set({ proofs: [], pendingProofs: {} });
      },

      findExactProof: (amount) => {
        const state = get();
        const pendingSecrets = new Set<string>();
        for (const pending of Object.values(state.pendingProofs)) {
          for (const proof of pending.proofs) {
            pendingSecrets.add(proof.secret);
          }
        }
        return state.proofs.find((p) => p.amount === amount && !pendingSecrets.has(p.secret)) || null;
      },

      countExactProofs: (amount) => {
        const state = get();
        const pendingSecrets = new Set<string>();
        for (const pending of Object.values(state.pendingProofs)) {
          for (const proof of pending.proofs) {
            pendingSecrets.add(proof.secret);
          }
        }
        return state.proofs.filter((p) => p.amount === amount && !pendingSecrets.has(p.secret)).length;
      },

      // ========================================================================
      // Pending Proof Tracking (Deferred Debit Model)
      // ========================================================================

      markProofsPending: (trackDtag, proofs) => {
        if (proofs.length === 0) return;
        const amount = proofs.reduce((sum, p) => sum + p.amount, 0);
        debugLog('wallet', 'Marking proofs as pending', { trackDtag, count: proofs.length, amount });

        set((state) => {
          // Clear existing timer
          const existing = state.pendingProofs[trackDtag];
          if (existing?.timerId) clearTimeout(existing.timerId);

          // Deduplicate: remove these proofs from other pending entries
          const newSecrets = new Set(proofs.map((p) => p.secret));
          const updatedPending: Record<string, PendingProof> = {};

          for (const [key, pending] of Object.entries(state.pendingProofs)) {
            if (key === trackDtag) continue;
            const filtered = pending.proofs.filter((p) => !newSecrets.has(p.secret));
            if (filtered.length > 0) {
              updatedPending[key] = { ...pending, proofs: filtered };
            } else if (pending.timerId) {
              clearTimeout(pending.timerId);
            }
          }

          return {
            pendingProofs: {
              ...updatedPending,
              [trackDtag]: { trackDtag, sentAt: Date.now(), proofs },
            },
          };
        });
      },

      resolvePendingProofs: (trackDtag, spent) => {
        const state = get();
        const pending = state.pendingProofs[trackDtag];
        if (!pending) return;

        const amount = pending.proofs.reduce((sum, p) => sum + p.amount, 0);
        debugLog('wallet', 'Resolving pending proofs', { trackDtag, spent, count: pending.proofs.length, amount });

        if (pending.timerId) clearTimeout(pending.timerId);

        if (spent) {
          // Payment confirmed - NOW remove proofs from wallet
          const secretsToRemove = new Set(pending.proofs.map((p) => p.secret));
          set((s) => {
            const { [trackDtag]: _, ...remainingPending } = s.pendingProofs;
            return {
              proofs: s.proofs.filter((p) => !secretsToRemove.has(p.secret)),
              pendingProofs: remainingPending,
            };
          });
        } else {
          // Payment NOT confirmed - just clear pending (proofs stay in wallet)
          set((s) => {
            const { [trackDtag]: _, ...remainingPending } = s.pendingProofs;
            return { pendingProofs: remainingPending };
          });
        }
      },

      getPendingProofs: (trackDtag) => get().pendingProofs[trackDtag],

      getAllPendingProofs: () => Object.values(get().pendingProofs),

      // ========================================================================
      // Recovery Timers
      // ========================================================================

      startRecoveryTimer: (trackDtag, delayMs, validateFn) => {
        const state = get();
        const pending = state.pendingProofs[trackDtag];
        if (!pending) return;

        if (pending.timerId) clearTimeout(pending.timerId);

        debugLog('wallet', 'Starting recovery timer', { trackDtag, delayMs });

        const timerId = setTimeout(async () => {
          const currentState = get();
          const currentPending = currentState.pendingProofs[trackDtag];
          if (!currentPending || currentPending.isVerifying) return;

          set((s) => ({
            pendingProofs: {
              ...s.pendingProofs,
              [trackDtag]: { ...s.pendingProofs[trackDtag], isVerifying: true },
            },
          }));

          try {
            const { unspent, spentSecrets } = await validateFn(currentPending.proofs);

            const postState = get();
            if (!postState.pendingProofs[trackDtag]) return;

            if (unspent.length === currentPending.proofs.length) {
              // All unspent - just clear pending
              debugLog('wallet', 'Proofs confirmed unspent', { trackDtag, count: unspent.length });
              set((s) => {
                const { [trackDtag]: _, ...rest } = s.pendingProofs;
                return { pendingProofs: rest };
              });
            } else if (spentSecrets.length > 0) {
              // Some spent - remove from wallet
              debugLog('wallet', 'Proofs confirmed spent', { trackDtag, count: spentSecrets.length });
              const spentSet = new Set(spentSecrets);
              set((s) => {
                const { [trackDtag]: _, ...rest } = s.pendingProofs;
                return {
                  proofs: s.proofs.filter((p) => !spentSet.has(p.secret)),
                  pendingProofs: rest,
                };
              });
            }
          } catch (err) {
            debugLog('wallet', 'Recovery validation failed', { trackDtag, error: String(err) });
            set((s) => ({
              pendingProofs: {
                ...s.pendingProofs,
                [trackDtag]: { ...s.pendingProofs[trackDtag], isVerifying: false, timerId: undefined },
              },
            }));
          }
        }, delayMs);

        set((s) => ({
          pendingProofs: {
            ...s.pendingProofs,
            [trackDtag]: { ...s.pendingProofs[trackDtag], timerId },
          },
        }));
      },

      cancelRecoveryTimer: (trackDtag) => {
        const pending = get().pendingProofs[trackDtag];
        if (pending?.timerId) {
          clearTimeout(pending.timerId);
          set((s) => ({
            pendingProofs: {
              ...s.pendingProofs,
              [trackDtag]: { ...s.pendingProofs[trackDtag], timerId: undefined },
            },
          }));
        }
      },
    }),
    {
      name: 'wavlake-wallet',
      partialize: (state) => ({
        proofs: state.proofs,
        pendingProofs: Object.fromEntries(
          Object.entries(state.pendingProofs).map(([key, p]) => [
            key,
            { trackDtag: p.trackDtag, sentAt: p.sentAt, proofs: p.proofs },
          ])
        ),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const balance = state.proofs.reduce((sum, p) => sum + p.amount, 0);
          const pendingCount = Object.keys(state.pendingProofs).length;
          debugLog('wallet', 'Wallet hydrated', { proofCount: state.proofs.length, balance, pendingCount });
        }
        markHydrated();
      },
    }
  )
);

// ============================================================================
// Exports
// ============================================================================

export function waitForWalletHydration(): Promise<void> {
  return getHydrationPromise();
}

/**
 * Validate wallet proofs on startup and process pending proofs.
 * Call this after hydration completes.
 */
export async function validateWalletProofs(
  validateFn: (proofs: Proof[]) => Promise<{ unspent: Proof[]; spentSecrets: string[] }>
): Promise<{ spentRemoved: number; pendingRecovered: number; pendingExpired: number }> {
  const state = useWalletStore.getState();
  let spentRemoved = 0;
  let pendingRecovered = 0;
  let pendingExpired = 0;

  // Validate main wallet proofs
  if (state.proofs.length > 0) {
    debugLog('wallet', 'Validating wallet proofs on startup', { count: state.proofs.length });
    const { spentSecrets } = await validateFn(state.proofs);
    if (spentSecrets.length > 0) {
      useWalletStore.getState().removeProofs(spentSecrets);
      spentRemoved = spentSecrets.length;
    }
  }

  // Process pending proofs
  const pendingEntries = Object.values(state.pendingProofs);
  const now = Date.now();

  for (const pending of pendingEntries) {
    const age = now - pending.sentAt;

    if (age > PENDING_EXPIRY_AGE_MS) {
      // Expired - clean up
      useWalletStore.getState().resolvePendingProofs(pending.trackDtag, true);
      pendingExpired++;
    } else if (age > PENDING_RECOVERY_MIN_AGE_MS) {
      // Old enough to validate
      try {
        const { unspent, spentSecrets } = await validateFn(pending.proofs);
        if (unspent.length === pending.proofs.length) {
          useWalletStore.getState().resolvePendingProofs(pending.trackDtag, false);
          pendingRecovered += unspent.length;
        } else if (spentSecrets.length > 0) {
          useWalletStore.getState().resolvePendingProofs(pending.trackDtag, true);
        }
      } catch {
        // Leave for next startup
      }
    } else {
      // Too fresh - start timer for remaining time
      const remaining = PENDING_RECOVERY_MIN_AGE_MS - age;
      useWalletStore.getState().startRecoveryTimer(pending.trackDtag, remaining, validateFn);
    }
  }

  debugLog('wallet', 'Startup validation complete', { spentRemoved, pendingRecovered, pendingExpired });
  return { spentRemoved, pendingRecovered, pendingExpired };
}

// Selectors
export const selectBalance = (state: WalletState) => state.proofs.reduce((sum, p) => sum + p.amount, 0);
export const selectAvailableBalance = (state: WalletState) => state.getAvailableBalance();
export const selectPendingBalance = (state: WalletState) => state.getPendingBalance();
