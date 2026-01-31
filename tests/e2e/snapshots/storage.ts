/**
 * Snapshot Storage
 * 
 * Read/write snapshots to filesystem.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import type { Snapshot, SnapshotDiff, SnapshotManifest } from './snapshot-types';

const SNAPSHOTS_DIR = resolve(__dirname);
const MANIFEST_FILE = join(SNAPSHOTS_DIR, 'manifest.json');

/**
 * Initialize manifest if it doesn't exist
 */
function ensureManifest(): SnapshotManifest {
  if (existsSync(MANIFEST_FILE)) {
    return JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
  }
  
  const manifest: SnapshotManifest = {
    version: '1.0.0',
    goldenBaseline: null,
    latestSnapshot: null,
    snapshots: [],
  };
  
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Save a snapshot
 */
export function saveSnapshot(snapshot: Snapshot): string {
  const snapshotDir = join(SNAPSHOTS_DIR, snapshot.metadata.id);
  
  if (!existsSync(snapshotDir)) {
    mkdirSync(snapshotDir, { recursive: true });
  }
  
  // Save snapshot data
  writeFileSync(
    join(snapshotDir, 'snapshot.json'),
    JSON.stringify(snapshot, null, 2)
  );
  
  // Update manifest
  const manifest = ensureManifest();
  
  // Remove existing entry if re-running
  manifest.snapshots = manifest.snapshots.filter(s => s.id !== snapshot.metadata.id);
  
  manifest.snapshots.push({
    id: snapshot.metadata.id,
    timestamp: snapshot.metadata.timestamp,
    triggeredBy: snapshot.metadata.triggeredBy,
    testsPassed: snapshot.testResults.filter(t => t.status === 'passed').length,
    testsFailed: snapshot.testResults.filter(t => t.status === 'failed').length,
    deviationCount: 0, // Updated after diff
  });
  
  // Sort by timestamp descending
  manifest.snapshots.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  manifest.latestSnapshot = snapshot.metadata.id;
  
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  
  console.log(`💾 Saved snapshot: ${snapshot.metadata.id}`);
  return snapshotDir;
}

/**
 * Save a diff
 */
export function saveDiff(diff: SnapshotDiff, snapshotId: string): void {
  const snapshotDir = join(SNAPSHOTS_DIR, snapshotId);
  
  if (!existsSync(snapshotDir)) {
    throw new Error(`Snapshot directory not found: ${snapshotId}`);
  }
  
  const filename = diff.comparedTo === 'golden' 
    ? 'diff-vs-golden.json' 
    : 'diff-vs-previous.json';
  
  writeFileSync(
    join(snapshotDir, filename),
    JSON.stringify(diff, null, 2)
  );
  
  // Update deviation count in manifest
  const manifest = ensureManifest();
  const entry = manifest.snapshots.find(s => s.id === snapshotId);
  if (entry) {
    entry.deviationCount = Math.max(entry.deviationCount, diff.deviations.length);
    writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  }
}

/**
 * Load a snapshot by ID
 */
export function loadSnapshot(id: string): Snapshot | null {
  const snapshotFile = join(SNAPSHOTS_DIR, id, 'snapshot.json');
  
  if (!existsSync(snapshotFile)) {
    return null;
  }
  
  return JSON.parse(readFileSync(snapshotFile, 'utf-8'));
}

/**
 * Get the golden baseline snapshot
 */
export function getGoldenBaseline(): Snapshot | null {
  const manifest = ensureManifest();
  
  if (!manifest.goldenBaseline) {
    return null;
  }
  
  return loadSnapshot(manifest.goldenBaseline);
}

/**
 * Set a snapshot as the golden baseline
 */
export function setGoldenBaseline(id: string): void {
  const manifest = ensureManifest();
  
  if (!loadSnapshot(id)) {
    throw new Error(`Snapshot not found: ${id}`);
  }
  
  manifest.goldenBaseline = id;
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  
  console.log(`⭐ Set golden baseline: ${id}`);
}

/**
 * Get the previous snapshot (for comparison)
 */
export function getPreviousSnapshot(currentId?: string): Snapshot | null {
  const manifest = ensureManifest();
  
  if (manifest.snapshots.length === 0) {
    return null;
  }
  
  // If currentId provided, find the one before it
  if (currentId) {
    const idx = manifest.snapshots.findIndex(s => s.id === currentId);
    if (idx >= 0 && idx < manifest.snapshots.length - 1) {
      return loadSnapshot(manifest.snapshots[idx + 1].id);
    }
  }
  
  // Otherwise return the latest
  return loadSnapshot(manifest.snapshots[0].id);
}

/**
 * Get manifest
 */
export function getManifest(): SnapshotManifest {
  return ensureManifest();
}

/**
 * List all snapshots
 */
export function listSnapshots(): Array<{
  id: string;
  timestamp: string;
  isGolden: boolean;
  deviationCount: number;
}> {
  const manifest = ensureManifest();
  
  return manifest.snapshots.map(s => ({
    id: s.id,
    timestamp: s.timestamp,
    isGolden: s.id === manifest.goldenBaseline,
    deviationCount: s.deviationCount,
  }));
}

/**
 * Export data for charting (all snapshots as time series)
 */
export function exportTimeSeriesData(): Array<{
  timestamp: string;
  artist_earnings: number;
  artist_streams: number;
  listener_spending: number;
  pool_balance: number;
  tests_passed: number;
  tests_failed: number;
  avg_response_time: number;
}> {
  const manifest = ensureManifest();
  const series: any[] = [];
  
  for (const entry of manifest.snapshots) {
    const snapshot = loadSnapshot(entry.id);
    if (!snapshot) continue;
    
    const avgResponseTime = snapshot.apiMetrics.length > 0
      ? snapshot.apiMetrics.reduce((s, m) => s + m.responseTimeMs, 0) / snapshot.apiMetrics.length
      : 0;
    
    series.push({
      timestamp: snapshot.metadata.timestamp,
      artist_earnings: snapshot.artist.balance.lifetime_earnings_credits,
      artist_streams: snapshot.artist.streams.total,
      listener_spending: snapshot.listener.spending?.total_spent_credits || 0,
      pool_balance: snapshot.proofPool.totalBalance,
      tests_passed: snapshot.testResults.filter(t => t.status === 'passed').length,
      tests_failed: snapshot.testResults.filter(t => t.status === 'failed').length,
      avg_response_time: avgResponseTime,
    });
  }
  
  // Sort by timestamp ascending for charting
  series.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  return series;
}
