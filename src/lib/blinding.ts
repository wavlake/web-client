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
    debugLog('wallet', 'Initializing Wallet', { mintUrl: CONFIG.MINT_URL, unit: 'usd' });
    walletInstance = new Wallet(mint, { unit: 'usd' });
    
    // Load mint info and keys
    debugLog('wallet', 'Loading mint info...');
    await walletInstance.loadMint();
    
    // Log mint metadata
    const keyset = walletInstance.getKeyset();
    debugLog('wallet', 'Mint loaded successfully', { 
      keysetId: walletInstance.keysetId,
      keysetUnit: keyset.unit,
      keysetActive: keyset.active,
      keyAmounts: Object.keys(keyset.keys).map(k => parseInt(k)).sort((a, b) => a - b),
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
  
  debugLog('wallet', 'Creating blinded outputs', { 
    amount, 
    keysetId: keyset.id,
    keysetUnit: keyset.unit,
  });
  
  // Create random blinded outputs using OutputData helper
  const outputData = OutputData.createRandomData(amount, keyset);
  
  // Extract the serialized blinded messages
  const outputs = outputData.map(d => d.blindedMessage);
  
  debugLog('wallet', 'Created blinded outputs', { 
    count: outputs.length,
    amounts: outputs.map(m => m.amount),
    outputs: outputs.map(o => ({
      amount: o.amount,
      id: o.id,  // keyset ID
      B_: o.B_?.slice(0, 20) + '...',  // blinded secret
    })),
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
  
  debugLog('wallet', 'Unblinding signatures', { 
    count: signatures.length,
    keysetId: keyset.id,
    signatures: signatures.map(s => ({
      amount: s.amount,
      id: s.id,  // keyset ID
      C_: s.C_?.slice(0, 20) + '...',  // blind signature
    })),
  });
  
  // Convert each signature to a proof using the outputData
  const proofs: Proof[] = signatures.map((sig, i) => {
    return outputData[i].toProof(sig, keyset);
  });
  
  debugLog('wallet', 'Unblinded to proofs', { 
    count: proofs.length,
    keysetId: keyset.id,
    proofs: proofs.map(p => ({
      amount: p.amount,
      id: p.id,  // keyset ID
      C: p.C?.slice(0, 20) + '...',
      secret: p.secret?.slice(0, 20) + '...',
    })),
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
