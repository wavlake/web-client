/**
 * Nutzap submodule
 * 
 * NIP-61 nutzap sending and receiving.
 * 
 * @example
 * ```ts
 * import { NutzapReceiver, NutzapInfo } from '@wavlake/nostr-wallet/nutzap';
 * ```
 * 
 * @packageDocumentation
 */

export type {
  Nutzap,
  NutzapMint,
  NutzapInfoContent,
  SendNutzapOptions,
  NutzapHandler,
} from '../types.js';

// Nutzap components
export { NutzapInfo } from './info.js';
export type { NutzapInfoConfig, PublishInfoOptions } from './info.js';

export { NutzapReceiver } from './receiver.js';
export type { NutzapReceiverConfig } from './receiver.js';

export { NutzapSender } from './sender.js';
export type { NutzapSenderConfig, NutzapSendResult } from './sender.js';
