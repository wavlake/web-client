/**
 * JIT (Just-In-Time) Swap Utility
 * 
 * Swaps wallet proofs to exact denomination before payment.
 * This ensures we only send the exact amount needed, keeping change in the wallet.
 */

import { Wallet, Mint, getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { CONFIG } from './config';
import { debugLog } from '../stores/debug';

let cachedWallet: Wallet | null = null;

/**
 * Get or create a Cashu wallet instance
 */
async function getWallet(): Promise<Wallet> {
  if (cachedWallet) {
    return cachedWallet;
  }

  debugLog('wallet', 'JIT: Initializing wallet for swap', { mintUrl: CONFIG.MINT_URL });
  
  const mint = new Mint(CONFIG.MINT_URL);
  const wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
  
  cachedWallet = wallet;
  
  return cachedWallet;
}

export interface JitSwapResult {
  /** Proofs to send (exact amount) */
  sendProofs: Proof[];
  /** Encoded token ready to send */
  token: string;
  /** Change proofs to keep in wallet */
  keepProofs: Proof[];
  /** Amount being sent */
  sendAmount: number;
  /** Amount being kept */
  keepAmount: number;
}

/**
 * Swap proofs to get exact denomination for payment.
 * 
 * @param amount - Exact amount needed for payment
 * @param proofs - Available proofs (can sum to more than amount)
 * @returns Swapped result with send proofs and change
 */
export async function jitSwap(amount: number, proofs: Proof[]): Promise<JitSwapResult> {
  const inputTotal = proofs.reduce((s, p) => s + p.amount, 0);
  
  debugLog('wallet', 'JIT: Starting swap', {
    requestedAmount: amount,
    inputProofCount: proofs.length,
    inputTotal,
    inputAmounts: proofs.map(p => p.amount),
  });

  // If proofs sum exactly to amount, no swap needed
  if (inputTotal === amount) {
    debugLog('wallet', 'JIT: Exact amount, no swap needed');
    
    const token = getEncodedTokenV4({
      mint: CONFIG.MINT_URL,
      proofs,
      unit: 'usd',
    });

    return {
      sendProofs: proofs,
      token,
      keepProofs: [],
      sendAmount: amount,
      keepAmount: 0,
    };
  }

  const wallet = await getWallet();
  
  const startTime = performance.now();
  const result = await wallet.send(amount, proofs);
  const elapsed = performance.now() - startTime;

  const sendAmount = result.send.reduce((s, p) => s + p.amount, 0);
  const keepAmount = result.keep.reduce((s, p) => s + p.amount, 0);

  debugLog('wallet', `JIT: Swap complete in ${elapsed.toFixed(0)}ms`, {
    sendProofCount: result.send.length,
    sendAmounts: result.send.map(p => p.amount),
    sendTotal: sendAmount,
    keepProofCount: result.keep.length,
    keepAmounts: result.keep.map(p => p.amount),
    keepTotal: keepAmount,
  });

  // Encode the send proofs as a token
  const token = getEncodedTokenV4({
    mint: CONFIG.MINT_URL,
    proofs: result.send,
    unit: 'usd',
  });

  return {
    sendProofs: result.send,
    token,
    keepProofs: result.keep,
    sendAmount,
    keepAmount,
  };
}
