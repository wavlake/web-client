/**
 * Cashu blinding utilities
 * 
 * Uses cashu-ts to:
 * 1. Create blinded outputs for minting
 * 2. Unblind signatures to get proofs
 * 3. Encode proofs as cashuB tokens
 */

import {
  Mint,
  Wallet,
  OutputData,
  getEncodedTokenV4,
  type Proof,
  type SerializedBlindedMessage,
  type SerializedBlindedSignature,
  type MintKeys,
} from '@cashu/cashu-ts';
import { CONFIG } from './config';
import { debugLog } from '../stores/debug';

// Cached mint and wallet instances
let mintInstance: Mint | null = null;
let walletInstance: Wallet | null = null;

/**
 * Get or create the Mint instance
 */
export async function getMint(): Promise<Mint> {
  if (!mintInstance) {
    debugLog('wallet', 'Initializing Mint', { url: CONFIG.MINT_URL });
    mintInstance = new Mint(CONFIG.MINT_URL);
  }
  return mintInstance;
}

/**
 * Get or create the Wallet instance
 */
export async function getWallet(): Promise<Wallet> {
  if (!walletInstance) {
    const mint = await getMint();
    debugLog('wallet', 'Initializing Wallet');
    walletInstance = new Wallet(mint, { unit: 'usd' });
    
    // Load mint info and keys
    await walletInstance.loadMint();
    debugLog('wallet', 'Mint loaded', { 
      keysetId: walletInstance.keysetId 
    });
  }
  return walletInstance;
}

/**
 * Get the active keyset
 */
export async function getKeyset(): Promise<{ id: string; keys: MintKeys['keys'] }> {
  const wallet = await getWallet();
  const keyset = wallet.getKeyset();
  return {
    id: keyset.id,
    keys: keyset.keys,
  };
}

/**
 * Create blinded outputs for a given amount
 * Returns the blinded messages to send to mint + data needed to unblind
 */
export async function createBlindedOutputs(
  amount: number
): Promise<{
  outputs: SerializedBlindedMessage[];
  outputData: OutputData[];
}> {
  const wallet = await getWallet();
  const keyset = wallet.getKeyset();
  
  debugLog('wallet', 'Creating blinded outputs', { amount, keysetId: keyset.id });
  
  // Create random blinded outputs using OutputData helper
  const outputData = OutputData.createRandomData(amount, keyset);
  
  // Extract the serialized blinded messages
  const outputs = outputData.map(d => d.blindedMessage);
  
  debugLog('wallet', 'Created blinded outputs', { 
    count: outputs.length,
    amounts: outputs.map(m => m.amount)
  });
  
  return {
    outputs,
    outputData,
  };
}

/**
 * Unblind signatures to get proofs
 */
export async function unblindSignatures(
  signatures: SerializedBlindedSignature[],
  outputData: OutputData[]
): Promise<Proof[]> {
  const wallet = await getWallet();
  const keyset = wallet.getKeyset();
  
  debugLog('wallet', 'Unblinding signatures', { count: signatures.length });
  
  // Convert each signature to a proof using the outputData
  const proofs: Proof[] = signatures.map((sig, i) => {
    return outputData[i].toProof(sig, keyset);
  });
  
  debugLog('wallet', 'Unblinded to proofs', { 
    count: proofs.length,
    amounts: proofs.map(p => p.amount),
    total: proofs.reduce((s, p) => s + p.amount, 0)
  });
  
  return proofs;
}

/**
 * Encode proofs as a cashuB (v4) token
 */
export function encodeToken(proofs: Proof[]): string {
  debugLog('wallet', 'Encoding token', { proofCount: proofs.length });
  
  const token = getEncodedTokenV4({
    mint: CONFIG.MINT_URL,
    proofs,
    unit: 'usd',
  });
  
  debugLog('wallet', 'Token encoded', { 
    tokenLength: token.length,
    prefix: token.slice(0, 20) + '...'
  });
  
  return token;
}

/**
 * Get the current keyset ID
 */
export async function getKeysetId(): Promise<string> {
  const wallet = await getWallet();
  return wallet.keysetId;
}
