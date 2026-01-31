/**
 * Proof State Checking
 * 
 * Validate proof freshness against the mint's /checkstate endpoint.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { CheckProofsResult } from './types.js';

/**
 * Check the state of proofs against the mint.
 * 
 * This calls the mint's /v1/checkstate endpoint to verify which
 * proofs are still unspent. Use this to prune stale proofs from
 * multi-device scenarios or sync issues.
 * 
 * @param mintUrl - Mint URL
 * @param proofs - Proofs to check
 * @returns Object with valid and spent proof arrays
 * 
 * @example
 * ```ts
 * const { valid, spent } = await checkProofState(mintUrl, proofs);
 * console.log(`${spent.length} proofs were already spent`);
 * ```
 */
export async function checkProofState(
  mintUrl: string,
  proofs: Proof[]
): Promise<CheckProofsResult> {
  if (proofs.length === 0) {
    return { valid: [], spent: [] };
  }

  // Normalize mint URL
  const baseUrl = mintUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/v1/checkstate`;

  // Extract Y values (public keys) from proofs
  const Ys = proofs.map(p => p.C);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Ys }),
    });

    if (!response.ok) {
      throw new Error(`Checkstate failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Response format: { states: [{ Y: string, state: 'UNSPENT' | 'SPENT' | 'PENDING' }] }
    const states: Array<{ Y: string; state: string }> = data.states || [];
    
    // Create a map of Y -> state
    const stateMap = new Map<string, string>();
    for (const s of states) {
      stateMap.set(s.Y, s.state);
    }

    // Partition proofs
    const valid: Proof[] = [];
    const spent: Proof[] = [];

    for (const proof of proofs) {
      const state = stateMap.get(proof.C);
      if (state === 'UNSPENT') {
        valid.push(proof);
      } else {
        // SPENT, PENDING, or unknown
        spent.push(proof);
      }
    }

    return { valid, spent };
  } catch (error) {
    // On error, assume all proofs are valid (fail open)
    // This prevents losing proofs due to network issues
    console.warn('checkProofState failed, assuming all proofs valid:', error);
    return { valid: proofs, spent: [] };
  }
}

/**
 * Check if a single proof is still valid.
 * 
 * @param mintUrl - Mint URL
 * @param proof - Proof to check
 * @returns true if proof is unspent
 */
export async function isProofValid(
  mintUrl: string,
  proof: Proof
): Promise<boolean> {
  const { valid } = await checkProofState(mintUrl, [proof]);
  return valid.length === 1;
}
