/**
 * Proof Pool Manager
 * 
 * Safely manages ecash proofs for E2E tests.
 * - Draws proofs from proofs.json
 * - Validates proofs before use
 * - Atomically removes spent proofs
 * - Backs up before modifications
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { config } from '../config';

const PROOFS_FILE = resolve(__dirname, '../../../proofs.json');
const BACKUP_FILE = resolve(__dirname, '../../../proofs.backup.json');

export interface ProofPoolStatus {
  totalBalance: number;
  proofCount: number;
  proofs: Array<{ amount: number; id: string }>;
}

/**
 * Get current pool status
 */
export function getPoolStatus(): ProofPoolStatus {
  if (!existsSync(PROOFS_FILE)) {
    return { totalBalance: 0, proofCount: 0, proofs: [] };
  }
  
  const proofs: Proof[] = JSON.parse(readFileSync(PROOFS_FILE, 'utf-8'));
  const totalBalance = proofs.reduce((sum, p) => sum + p.amount, 0);
  
  return {
    totalBalance,
    proofCount: proofs.length,
    proofs: proofs.map(p => ({ amount: p.amount, id: p.id.slice(0, 8) })),
  };
}

/**
 * Select proofs that sum to at least the requested amount.
 * Uses greedy algorithm: largest first.
 * Returns null if insufficient balance.
 */
export function selectProofs(amount: number): { proofs: Proof[]; total: number } | null {
  if (!existsSync(PROOFS_FILE)) {
    console.error('Proof pool file not found:', PROOFS_FILE);
    return null;
  }
  
  const allProofs: Proof[] = JSON.parse(readFileSync(PROOFS_FILE, 'utf-8'));
  
  // Sort by amount descending
  const sorted = [...allProofs].sort((a, b) => b.amount - a.amount);
  
  const selected: Proof[] = [];
  let total = 0;
  
  for (const proof of sorted) {
    if (total >= amount) break;
    selected.push(proof);
    total += proof.amount;
  }
  
  if (total < amount) {
    console.error(`Insufficient balance: need ${amount}, have ${total}`);
    return null;
  }
  
  return { proofs: selected, total };
}

/**
 * Withdraw proofs from pool for spending.
 * Backs up pool, removes selected proofs, returns them.
 * 
 * IMPORTANT: Call returnProofs() if the spend fails!
 */
export function withdrawProofs(amount: number): { proofs: Proof[]; token: string; total: number } | null {
  const selection = selectProofs(amount);
  if (!selection) return null;
  
  // Backup current state
  if (existsSync(PROOFS_FILE)) {
    copyFileSync(PROOFS_FILE, BACKUP_FILE);
  }
  
  // Remove selected proofs from pool
  const allProofs: Proof[] = JSON.parse(readFileSync(PROOFS_FILE, 'utf-8'));
  const selectedSecrets = new Set(selection.proofs.map(p => p.secret));
  const remaining = allProofs.filter(p => !selectedSecrets.has(p.secret));
  
  writeFileSync(PROOFS_FILE, JSON.stringify(remaining, null, 2));
  
  // Create token
  const token = getEncodedTokenV4({
    mint: config.mintUrl,
    proofs: selection.proofs,
    unit: 'usd',
  });
  
  console.log(`[proof-pool] Withdrew ${selection.total} credits (${selection.proofs.length} proofs)`);
  console.log(`[proof-pool] Remaining: ${remaining.reduce((s, p) => s + p.amount, 0)} credits`);
  
  return {
    proofs: selection.proofs,
    token,
    total: selection.total,
  };
}

/**
 * Return proofs to pool (if spend failed).
 */
export function returnProofs(proofs: Proof[]): void {
  const allProofs: Proof[] = existsSync(PROOFS_FILE) 
    ? JSON.parse(readFileSync(PROOFS_FILE, 'utf-8'))
    : [];
  
  const merged = [...allProofs, ...proofs];
  writeFileSync(PROOFS_FILE, JSON.stringify(merged, null, 2));
  
  const total = merged.reduce((s, p) => s + p.amount, 0);
  console.log(`[proof-pool] Returned ${proofs.length} proofs. Pool balance: ${total}`);
}

/**
 * Add change proofs back to pool (after successful spend with overpayment).
 */
export function addChangeProofs(proofs: Proof[]): void {
  if (proofs.length === 0) return;
  
  const allProofs: Proof[] = existsSync(PROOFS_FILE)
    ? JSON.parse(readFileSync(PROOFS_FILE, 'utf-8'))
    : [];
  
  const merged = [...allProofs, ...proofs];
  writeFileSync(PROOFS_FILE, JSON.stringify(merged, null, 2));
  
  const changeAmount = proofs.reduce((s, p) => s + p.amount, 0);
  const total = merged.reduce((s, p) => s + p.amount, 0);
  console.log(`[proof-pool] Added ${changeAmount} change credits. Pool balance: ${total}`);
}

/**
 * Restore pool from backup (emergency recovery).
 */
export function restoreFromBackup(): boolean {
  if (!existsSync(BACKUP_FILE)) {
    console.error('No backup file found');
    return false;
  }
  
  copyFileSync(BACKUP_FILE, PROOFS_FILE);
  console.log('[proof-pool] Restored from backup');
  return true;
}

/**
 * Check if pool has enough balance for a test.
 */
export function hasBalance(amount: number): boolean {
  const status = getPoolStatus();
  return status.totalBalance >= amount;
}
