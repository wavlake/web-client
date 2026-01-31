/**
 * @wavlake/paywall-react
 * 
 * React hooks and providers for Wavlake paywall integration.
 * 
 * @example
 * ```tsx
 * import { Wallet, LocalStorageAdapter } from '@wavlake/wallet';
 * import { PaywallClient } from '@wavlake/paywall-client';
 * import { 
 *   WalletProvider, 
 *   PaywallProvider, 
 *   useWallet, 
 *   usePaywall,
 *   useTrackPlayer,
 * } from '@wavlake/paywall-react';
 * 
 * const wallet = new Wallet({
 *   mintUrl: 'https://mint.wavlake.com',
 *   storage: new LocalStorageAdapter('my-wallet'),
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
 * 
 * function Player() {
 *   const { balance, isReady } = useWallet();
 *   const { play, isPlaying, audioUrl } = useTrackPlayer();
 *   
 *   if (!isReady) return <div>Loading...</div>;
 *   
 *   return (
 *     <div>
 *       <p>Balance: {balance}</p>
 *       <button onClick={() => play('track-dtag', 1)}>
 *         {isPlaying ? 'Playing' : 'Play'}
 *       </button>
 *       {audioUrl && <audio src={audioUrl} autoPlay />}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @packageDocumentation
 */

// Providers
export { 
  WalletProvider,
  useWalletContext,
  type WalletProviderProps,
  type WalletContextValue,
} from './providers/WalletProvider.js';

export {
  PaywallProvider,
  usePaywallContext,
  type PaywallProviderProps,
  type PaywallContextValue,
} from './providers/PaywallProvider.js';

// Hooks
export { 
  useWallet,
  type WalletContextValue as UseWalletResult,
} from './hooks/useWallet.js';

export {
  usePaywall,
  type PaywallContextValue as UsePaywallResult,
} from './hooks/usePaywall.js';

export {
  useTrackPlayer,
  type UseTrackPlayerResult,
  type UseTrackPlayerOptions,
} from './hooks/useTrackPlayer.js';

export {
  useContentPrice,
  useContentPrices,
  type ContentPriceState,
} from './hooks/useContentPrice.js';

export {
  useTrackPayment,
  type TrackPaymentState,
  type PaymentStatus,
} from './hooks/useTrackPayment.js';

// Re-export types from dependencies for convenience
export type {
  Proof,
  MintQuote,
  CheckProofsResult,
} from '@wavlake/wallet';

export type {
  AudioResult,
  ContentResult,
  ChangeResult,
  PaywallError,
} from '@wavlake/paywall-client';
