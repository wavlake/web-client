'use client';

/**
 * PaywallProvider
 * 
 * React context provider for Wavlake paywall client.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { 
  PaywallClient,
  AudioResult,
  ContentResult,
  ChangeResult,
  RequestAudioOptions,
} from '@wavlake/paywall-client';
import type { Wallet } from '@wavlake/wallet';

// ============================================================================
// Types
// ============================================================================

export interface PaywallContextValue {
  /** Request audio binary directly (supports two-chunk streaming) */
  requestAudio: (dtag: string, token: string, options?: RequestAudioOptions) => Promise<AudioResult>;
  /** Request content with grant */
  requestContent: (dtag: string, token: string) => Promise<ContentResult>;
  /** Replay existing grant */
  replayGrant: (dtag: string, grantId: string) => Promise<ContentResult>;
  /** Get content price */
  getContentPrice: (dtag: string) => Promise<number>;
  /** Generate URL with embedded token */
  getAudioUrl: (dtag: string, token: string, paymentId?: string) => string;
  /** @deprecated Change endpoint was removed. Overpayment becomes artist tip. */
  fetchChange: (paymentId: string) => Promise<ChangeResult>;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Clear the error state */
  clearError: () => void;
}

// ============================================================================
// Context
// ============================================================================

const PaywallContext = createContext<PaywallContextValue | null>(null);

// ============================================================================
// Provider Props
// ============================================================================

export interface PaywallProviderProps {
  /** PaywallClient instance */
  client: PaywallClient;
  /** Optional wallet for auto-payment flows */
  wallet?: Wallet;
  /** Children to render */
  children: ReactNode;
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Provides paywall client methods to child components.
 * 
 * @example
 * ```tsx
 * import { PaywallClient } from '@wavlake/paywall-client';
 * import { PaywallProvider, usePaywall } from '@wavlake/paywall-react';
 * 
 * const client = new PaywallClient({
 *   apiUrl: 'https://api.wavlake.com',
 * });
 * 
 * function App() {
 *   return (
 *     <PaywallProvider client={client}>
 *       <TrackPlayer />
 *     </PaywallProvider>
 *   );
 * }
 * ```
 */
export function PaywallProvider({
  client,
  wallet,
  children,
}: PaywallProviderProps) {
  // Use refs to avoid re-renders
  const clientRef = useRef(client);
  clientRef.current = client;

  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Actions
  const requestAudio = useCallback(async (dtag: string, token: string, options?: RequestAudioOptions) => {
    setIsLoading(true);
    setError(null);
    try {
      return await clientRef.current.requestAudio(dtag, token, options);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestContent = useCallback(async (dtag: string, token: string) => {
    setIsLoading(true);
    setError(null);
    try {
      return await clientRef.current.requestContent(dtag, token);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAudioUrl = useCallback((dtag: string, token: string, paymentId?: string) => {
    return clientRef.current.getAudioUrl(dtag, token, paymentId);
  }, []);

  const fetchChange = useCallback(async (paymentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      return await clientRef.current.fetchChange(paymentId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const replayGrant = useCallback(async (dtag: string, grantId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      return await clientRef.current.replayGrant(dtag, grantId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getContentPrice = useCallback(async (dtag: string) => {
    try {
      return await clientRef.current.getContentPrice(dtag);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: PaywallContextValue = {
    requestAudio,
    requestContent,
    replayGrant,
    getContentPrice,
    getAudioUrl,
    fetchChange,
    isLoading,
    error,
    clearError,
  };

  return (
    <PaywallContext.Provider value={value}>
      {children}
    </PaywallContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access paywall client methods from context.
 * Must be used within a PaywallProvider.
 * 
 * @throws Error if used outside PaywallProvider
 */
export function usePaywallContext(): PaywallContextValue {
  const context = useContext(PaywallContext);
  if (!context) {
    throw new Error('usePaywallContext must be used within a PaywallProvider');
  }
  return context;
}
