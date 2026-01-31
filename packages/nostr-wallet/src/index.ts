/**
 * @wavlake/nostr-wallet
 * 
 * NIP-60/61 support for the Wavlake SDK.
 * 
 * @example Nip60Adapter (drop-in storage)
 * ```ts
 * import { Wallet } from '@wavlake/wallet';
 * import { Nip60Adapter } from '@wavlake/nostr-wallet';
 * 
 * const adapter = new Nip60Adapter({ ndk, signer, mintUrl });
 * const wallet = new Wallet({ mintUrl, storage: adapter });
 * 
 * await wallet.load();  // Syncs from Nostr relays
 * ```
 * 
 * @example Nutzaps
 * ```ts
 * import { NutzapReceiver } from '@wavlake/nostr-wallet/nutzap';
 * 
 * const receiver = new NutzapReceiver({ ndk, wallet });
 * receiver.on('nutzap', (zap) => receiver.redeem(zap));
 * await receiver.subscribe();
 * ```
 * 
 * @packageDocumentation
 */

// Types
export type {
  Nip60AdapterConfig,
  WalletEventContent,
  TokenEventContent,
  SpendingRecord,
  NutzapInfoContent,
  NutzapMint,
  Nutzap,
  SendNutzapOptions,
  P2PKLock,
  DLEQProof,
  SyncHandler,
  ConflictHandler,
  NutzapHandler,
} from './types.js';

// Constants
export {
  WALLET_KIND,
  TOKEN_KIND,
  HISTORY_KIND,
  QUOTE_KIND,
  NUTZAP_INFO_KIND,
  NUTZAP_KIND,
} from './types.js';

// TODO: Implement and export
// export { Nip60Adapter } from './adapter.js';
// export { Nip60Wallet } from './wallet.js';
