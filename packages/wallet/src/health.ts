/**
 * Wallet Health Check
 * 
 * Comprehensive health check for wallet proofs and mint connectivity.
 */

import type { Proof } from '@cashu/cashu-ts';
import { checkProofState } from './checkstate.js';
import { summarizeProofs } from './inspect.js';

/**
 * Individual proof health status
 */
export interface ProofHealth {
  proof: Proof;
  status: 'valid' | 'spent' | 'pending' | 'unknown';
}

/**
 * Mint connectivity status
 */
export interface MintStatus {
  url: string;
  reachable: boolean;
  latencyMs?: number;
  error?: string;
  keysets?: string[];
}

/**
 * Complete wallet health report
 */
export interface WalletHealth {
  /** Timestamp of health check */
  checkedAt: Date;
  /** Mint connectivity status */
  mint: MintStatus;
  /** Overall health score (0-100) */
  score: number;
  /** Summary of issues found */
  issues: string[];
  /** Proof statistics */
  proofs: {
    total: number;
    valid: number;
    spent: number;
    pending: number;
    unknown: number;
    /** Amount in valid proofs */
    validBalance: number;
    /** Amount in potentially lost proofs */
    atRiskBalance: number;
  };
  /** Individual proof statuses (if requested) */
  details?: ProofHealth[];
}

/**
 * Health check options
 */
export interface HealthCheckOptions {
  /** Include individual proof details (default: false) */
  includeDetails?: boolean;
  /** Timeout for mint connection in ms (default: 5000) */
  timeoutMs?: number;
  /** Skip proof validation (just check mint connectivity) */
  skipProofCheck?: boolean;
}

/**
 * Perform a comprehensive health check on wallet proofs
 * 
 * @example
 * ```ts
 * const health = await checkWalletHealth(
 *   'https://mint.wavlake.com',
 *   wallet.proofs
 * );
 * 
 * console.log(`Health score: ${health.score}/100`);
 * console.log(`Valid balance: ${health.proofs.validBalance}`);
 * 
 * if (health.issues.length > 0) {
 *   console.log('Issues:', health.issues);
 * }
 * ```
 */
export async function checkWalletHealth(
  mintUrl: string,
  proofs: Proof[],
  options: HealthCheckOptions = {}
): Promise<WalletHealth> {
  const {
    includeDetails = false,
    timeoutMs = 5000,
    skipProofCheck = false,
  } = options;

  const checkedAt = new Date();
  const issues: string[] = [];
  let score = 100;

  // Check mint connectivity
  const mint = await checkMintConnectivity(mintUrl, timeoutMs);
  
  if (!mint.reachable) {
    issues.push(`Mint unreachable: ${mint.error || 'connection failed'}`);
    score -= 40; // Critical: can't verify proofs or mint tokens
  } else if (mint.latencyMs && mint.latencyMs > 2000) {
    issues.push(`Mint latency high: ${mint.latencyMs}ms`);
    score -= 10;
  }

  // Initialize proof stats
  const proofStats = {
    total: proofs.length,
    valid: 0,
    spent: 0,
    pending: 0,
    unknown: 0,
    validBalance: 0,
    atRiskBalance: 0,
  };

  const details: ProofHealth[] = [];

  // Check proof states
  if (!skipProofCheck && proofs.length > 0 && mint.reachable) {
    try {
      const { valid, spent } = await checkProofState(mintUrl, proofs);
      
      proofStats.valid = valid.length;
      proofStats.spent = spent.length;
      proofStats.validBalance = valid.reduce((sum, p) => sum + p.amount, 0);
      proofStats.atRiskBalance = spent.reduce((sum, p) => sum + p.amount, 0);

      if (includeDetails) {
        for (const p of valid) {
          details.push({ proof: p, status: 'valid' });
        }
        for (const p of spent) {
          details.push({ proof: p, status: 'spent' });
        }
      }

      // Score based on spent ratio
      if (proofs.length > 0) {
        const spentRatio = spent.length / proofs.length;
        if (spentRatio > 0.5) {
          issues.push(`${Math.round(spentRatio * 100)}% of proofs are spent`);
          score -= 30;
        } else if (spentRatio > 0.1) {
          issues.push(`${spent.length} proofs are spent`);
          score -= 15;
        } else if (spent.length > 0) {
          issues.push(`${spent.length} spent proof(s) found`);
          score -= 5;
        }
      }
    } catch (error) {
      proofStats.unknown = proofs.length;
      issues.push(`Proof check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      score -= 20;

      if (includeDetails) {
        for (const p of proofs) {
          details.push({ proof: p, status: 'unknown' });
        }
      }
    }
  } else if (skipProofCheck) {
    proofStats.unknown = proofs.length;
  } else if (proofs.length === 0) {
    // Empty wallet is healthy but note it
    issues.push('Wallet is empty');
  }

  // Check for keyset issues
  if (mint.keysets && proofs.length > 0) {
    const summary = summarizeProofs(proofs);
    const proofKeysets = Object.keys(summary.byKeyset);
    const unknownKeysets = proofKeysets.filter(k => !mint.keysets!.includes(k));
    
    if (unknownKeysets.length > 0) {
      issues.push(`${unknownKeysets.length} keyset(s) not recognized by mint`);
      score -= 15;
    }
  }

  return {
    checkedAt,
    mint,
    score: Math.max(0, score),
    issues,
    proofs: proofStats,
    ...(includeDetails ? { details } : {}),
  };
}

/**
 * Check mint connectivity and get basic info
 */
async function checkMintConnectivity(
  mintUrl: string,
  timeoutMs: number
): Promise<MintStatus> {
  const baseUrl = mintUrl.replace(/\/+$/, '');
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Try to fetch mint info
    const response = await fetch(`${baseUrl}/v1/info`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        url: mintUrl,
        reachable: false,
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    }

    const info = await response.json();
    const keysets = info.keysets?.map((k: any) => k.id) || [];

    return {
      url: mintUrl,
      reachable: true,
      latencyMs,
      keysets,
    };
  } catch (error) {
    return {
      url: mintUrl,
      reachable: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Quick health check - just returns score and critical issues
 */
export async function quickHealthCheck(
  mintUrl: string,
  proofs: Proof[]
): Promise<{ score: number; healthy: boolean; issue?: string }> {
  const health = await checkWalletHealth(mintUrl, proofs, {
    includeDetails: false,
    timeoutMs: 3000,
  });

  return {
    score: health.score,
    healthy: health.score >= 70,
    issue: health.issues[0],
  };
}
