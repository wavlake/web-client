'use client';

/**
 * usePaywall Hook
 * 
 * Convenient hook for accessing paywall client methods.
 */

import { usePaywallContext } from '../providers/PaywallProvider.js';
import type { PaywallContextValue } from '../providers/PaywallProvider.js';

/**
 * Access paywall client methods.
 * Must be used within a PaywallProvider.
 * 
 * @example
 * ```tsx
 * function TrackPlayer({ dtag }: { dtag: string }) {
 *   const { requestContent, isLoading, error } = usePaywall();
 *   const { createToken, balance } = useWallet();
 *   
 *   const handlePlay = async () => {
 *     const token = await createToken(1);
 *     const { url, grant } = await requestContent(dtag, token);
 *     // Play url...
 *   };
 *   
 *   return (
 *     <button onClick={handlePlay} disabled={isLoading}>
 *       Play Track
 *     </button>
 *   );
 * }
 * ```
 */
export function usePaywall(): PaywallContextValue {
  return usePaywallContext();
}

export type { PaywallContextValue };
