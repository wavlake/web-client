'use client';

/**
 * useWallet Hook
 * 
 * Convenient hook for accessing wallet state and actions.
 */

import { useWalletContext } from '../providers/WalletProvider.js';
import type { WalletContextValue } from '../providers/WalletProvider.js';

/**
 * Access wallet state and actions.
 * Must be used within a WalletProvider.
 * 
 * @example
 * ```tsx
 * function PayButton({ amount }: { amount: number }) {
 *   const { balance, isReady, createToken, isLoading, error } = useWallet();
 *   
 *   if (!isReady) return <div>Loading wallet...</div>;
 *   if (balance < amount) return <div>Insufficient balance</div>;
 *   
 *   const handlePay = async () => {
 *     const token = await createToken(amount);
 *     // Use token...
 *   };
 *   
 *   return (
 *     <button onClick={handlePay} disabled={isLoading}>
 *       Pay {amount} credits
 *     </button>
 *   );
 * }
 * ```
 */
export function useWallet(): WalletContextValue {
  return useWalletContext();
}

export type { WalletContextValue };
