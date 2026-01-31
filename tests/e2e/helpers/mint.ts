/**
 * Mint helpers for E2E tests
 * 
 * Interact with Nutshell staging mint
 */

import { Mint, Wallet, getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { config } from '../config';

let mintInstance: Mint | null = null;
let walletInstance: Wallet | null = null;

/**
 * Get or create mint instance
 */
export function getMint(): Mint {
  if (!mintInstance) {
    mintInstance = new Mint(config.mintUrl);
  }
  return mintInstance;
}

/**
 * Get or create wallet instance
 */
export async function getWallet(): Promise<Wallet> {
  if (!walletInstance) {
    const mint = getMint();
    walletInstance = new Wallet(mint);
  }
  return walletInstance;
}

/**
 * Get mint info
 */
export async function getMintInfo() {
  const mint = getMint();
  return mint.getInfo();
}

/**
 * Create a mint quote (Lightning invoice)
 * 
 * @param amount - Amount in the mint's unit (sats for staging)
 * @returns Quote with invoice to pay
 */
export async function createMintQuote(amount: number) {
  const wallet = await getWallet();
  await wallet.loadMint();
  const quote = await wallet.createMintQuoteBolt11(amount);
  return {
    id: quote.quote,
    invoice: quote.request,
    amount,
    paid: false,
  };
}

/**
 * Check if a mint quote has been paid
 */
export async function checkMintQuote(quoteId: string) {
  const wallet = await getWallet();
  const quote = await wallet.checkMintQuoteBolt11(quoteId);
  return {
    id: quote.quote,
    paid: quote.state === 'PAID',
    state: quote.state,
  };
}

/**
 * Mint tokens after quote is paid
 * 
 * @param quoteId - The quote ID from createMintQuote
 * @param amount - Amount to mint
 * @returns Encoded cashuB token
 */
export async function mintTokens(quoteId: string, amount: number): Promise<string> {
  const wallet = await getWallet();
  const proofs = await wallet.mintProofsBolt11(amount, quoteId);
  return encodeToken(proofs);
}

/**
 * Encode proofs as a cashuB token
 */
export function encodeToken(proofs: Proof[]): string {
  const mint = getMint();
  return getEncodedTokenV4({
    mint: mint.mintUrl,
    proofs,
  });
}

/**
 * Get the total amount from proofs
 */
export function getProofsAmount(proofs: Proof[]): number {
  return proofs.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Full mint flow: create quote, wait for payment, mint tokens
 * 
 * NOTE: In real tests, you'll need to actually pay the invoice.
 * This is a helper that assumes the invoice gets paid externally.
 * 
 * @param amount - Amount to mint
 * @param pollInterval - How often to check if paid (ms)
 * @param timeout - Max time to wait for payment (ms)
 */
export async function mintTokensWithPolling(
  amount: number,
  pollInterval = 2000,
  timeout = 60000
): Promise<{ token: string; quote: any }> {
  const quote = await createMintQuote(amount);
  
  console.log(`⚡ Pay this invoice to mint ${amount} tokens:`);
  console.log(quote.invoice);
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const status = await checkMintQuote(quote.id);
    if (status.paid) {
      const token = await mintTokens(quote.id, amount);
      return { token, quote };
    }
    await new Promise(r => setTimeout(r, pollInterval));
  }
  
  throw new Error(`Mint quote not paid within ${timeout}ms`);
}

/**
 * Receive a cashu token (for testing change handling)
 */
export async function receiveToken(token: string): Promise<Proof[]> {
  const wallet = await getWallet();
  const proofs = await wallet.receive(token);
  return proofs;
}
