/**
 * @wavlake/paywall-react-native
 * 
 * React Native hooks and providers for Wavlake paywall integration.
 * 
 * This package provides React Native-specific utilities and re-exports
 * the core hooks from @wavlake/paywall-react.
 * 
 * @example
 * ```tsx
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { 
 *   createWallet,
 *   WalletProvider, 
 *   PaywallProvider, 
 *   useWallet, 
 *   useTrackPlayer,
 * } from '@wavlake/paywall-react-native';
 * import { PaywallClient } from '@wavlake/paywall-client';
 * 
 * // Create wallet with AsyncStorage
 * const wallet = createWallet({
 *   mintUrl: 'https://mint.wavlake.com',
 *   storageKey: 'my-wallet',
 *   asyncStorage: AsyncStorage,
 * });
 * 
 * const client = new PaywallClient({
 *   apiUrl: 'https://api.wavlake.com',
 * });
 * 
 * function App() {
 *   return (
 *     <WalletProvider wallet={wallet}>
 *       <PaywallProvider client={client}>
 *         <Player />
 *       </PaywallProvider>
 *     </WalletProvider>
 *   );
 * }
 * ```
 * 
 * @packageDocumentation
 */

// Re-export everything from paywall-react
export {
  // Providers
  WalletProvider,
  PaywallProvider,
  useWalletContext,
  usePaywallContext,
  type WalletProviderProps,
  type WalletContextValue,
  type PaywallProviderProps,
  type PaywallContextValue,
  // Hooks
  useWallet,
  usePaywall,
  useTrackPlayer,
  type UseTrackPlayerResult,
  type UseTrackPlayerOptions,
  // Types
  type Proof,
  type MintQuote,
  type CheckProofsResult,
  type AudioResult,
  type ContentResult,
  type ChangeResult,
} from '@wavlake/paywall-react';

// Re-export wallet utilities for convenience
export {
  Wallet,
  AsyncStorageAdapter,
  MemoryAdapter,
  selectors,
  smallestFirst,
  largestFirst,
  exactMatch,
  random,
  checkProofState,
  isProofValid,
  type WalletConfig,
  type StorageAdapter,
  type ProofSelector,
} from '@wavlake/wallet';

// Re-export client for convenience
export { PaywallClient, PaywallError } from '@wavlake/paywall-client';

// RN-specific utilities
import { Wallet, AsyncStorageAdapter, type WalletConfig } from '@wavlake/wallet';

/**
 * AsyncStorage interface (React Native)
 */
export interface AsyncStorageStatic {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Options for createWallet helper
 */
export interface CreateWalletOptions {
  /** Mint URL */
  mintUrl: string;
  /** Storage key for AsyncStorage */
  storageKey: string;
  /** AsyncStorage instance */
  asyncStorage: AsyncStorageStatic;
  /** Additional wallet config options */
  walletConfig?: Partial<Omit<WalletConfig, 'mintUrl' | 'storage'>>;
}

/**
 * Create a wallet pre-configured with AsyncStorage.
 * 
 * @example
 * ```tsx
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { createWallet } from '@wavlake/paywall-react-native';
 * 
 * const wallet = createWallet({
 *   mintUrl: 'https://mint.wavlake.com',
 *   storageKey: 'my-app-wallet',
 *   asyncStorage: AsyncStorage,
 * });
 * ```
 */
export function createWallet(options: CreateWalletOptions): Wallet {
  const { mintUrl, storageKey, asyncStorage, walletConfig } = options;
  
  const storage = new AsyncStorageAdapter(storageKey, asyncStorage);
  
  return new Wallet({
    mintUrl,
    storage,
    ...walletConfig,
  });
}
