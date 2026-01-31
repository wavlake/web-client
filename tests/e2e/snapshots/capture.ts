/**
 * Snapshot Capture
 * 
 * Functions to capture current state of all tracked resources.
 */

import { execSync } from 'child_process';
import { config } from '../config';
import { getArtistStats, getArtistEarnings } from '../helpers/api';
import { getNpubFromNsec, getPubkeyFromNsec, createNip98Auth } from '../helpers/nostr';
import { getPoolStatus } from '../helpers/proof-pool';
import type {
  Snapshot,
  SnapshotMetadata,
  ArtistState,
  ListenerState,
  MintState,
  ProofPoolState,
  TrackState,
  ApiMetrics,
} from './snapshot-types';

/**
 * Generate snapshot ID from current time
 */
export function generateSnapshotId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5) + 'Z';
}

/**
 * Get current git info
 */
function getGitInfo(): { hash: string; branch: string } {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    return { hash, branch };
  } catch {
    return { hash: 'unknown', branch: 'unknown' };
  }
}

/**
 * Capture artist state via NIP-98 authenticated requests
 */
export async function captureArtistState(nsec: string): Promise<ArtistState> {
  const pubkey = getPubkeyFromNsec(nsec);
  const npub = getNpubFromNsec(nsec);
  const capturedAt = new Date().toISOString();
  
  const stats = await getArtistStats(nsec);
  
  if (!stats.ok || !stats.data) {
    return {
      pubkey,
      npub,
      balance: { available_credits: 0, lifetime_earnings_credits: 0, pending_payout_credits: 0 },
      streams: { paid: 0, free_tier: 0, free_access: 0, honor_paid: 0, honor_unpaid: 0, total: 0 },
      trackCount: 0,
      capturedAt,
    };
  }
  
  return {
    pubkey,
    npub,
    balance: stats.data.balance,
    streams: stats.data.streams,
    trackCount: stats.data.deposits?.tracks_uploaded || 0,
    capturedAt,
  };
}

/**
 * Capture listener state (spending caps)
 */
export async function captureListenerState(nsec: string): Promise<ListenerState> {
  const pubkey = getPubkeyFromNsec(nsec);
  const npub = getNpubFromNsec(nsec);
  const capturedAt = new Date().toISOString();
  
  // Try to get spending status
  const url = `${config.apiUrl}/api/v1/listener/spending-status`;
  const auth = createNip98Auth(url, 'GET', nsec);
  
  try {
    const response = await fetch(url, {
      headers: { Authorization: auth },
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        pubkey,
        npub,
        spending: data.data || null,
        capturedAt,
      };
    }
  } catch {
    // Endpoint might not exist or listener not tracked
  }
  
  return {
    pubkey,
    npub,
    spending: null,
    capturedAt,
  };
}

/**
 * Capture mint state
 */
export async function captureMintState(): Promise<MintState> {
  const capturedAt = new Date().toISOString();
  const startTime = performance.now();
  
  try {
    const [infoRes, keysetsRes] = await Promise.all([
      fetch(`${config.mintUrl}/v1/info`),
      fetch(`${config.mintUrl}/v1/keysets`),
    ]);
    
    const responseTimeMs = performance.now() - startTime;
    
    const info = await infoRes.json();
    const keysets = await keysetsRes.json();
    
    return {
      url: config.mintUrl,
      name: info.name || 'unknown',
      version: info.version || 'unknown',
      activeKeysets: (keysets.keysets || []).map((k: any) => ({
        id: k.id,
        unit: k.unit,
        active: k.active,
      })),
      healthy: infoRes.ok && keysetsRes.ok,
      responseTimeMs,
      capturedAt,
    };
  } catch (err) {
    return {
      url: config.mintUrl,
      name: 'error',
      version: 'error',
      activeKeysets: [],
      healthy: false,
      responseTimeMs: performance.now() - startTime,
      capturedAt,
    };
  }
}

/**
 * Capture proof pool state
 */
export function captureProofPoolState(): ProofPoolState {
  const status = getPoolStatus();
  const denominations: Record<number, number> = {};
  
  for (const proof of status.proofs) {
    denominations[proof.amount] = (denominations[proof.amount] || 0) + 1;
  }
  
  return {
    totalBalance: status.totalBalance,
    proofCount: status.proofCount,
    denominations,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Capture track states
 */
export async function captureTrackStates(): Promise<TrackState[]> {
  const tracks: TrackState[] = [];
  
  // Capture configured test tracks
  for (const [key, track] of Object.entries(config.testTracks)) {
    tracks.push({
      dtag: track.dtag,
      title: track.title,
      priceCredits: track.priceCredits,
      accessMode: track.priceCredits > 0 ? 'paid' : 'free',
      artistPubkey: '', // Could fetch from relay if needed
    });
  }
  
  return tracks;
}

/**
 * Test anonymous access and capture results
 */
export async function captureAnonymousAccess(): Promise<{
  tested: boolean;
  canAccessFreeContent: boolean;
  gets402ForPaidContent: boolean;
}> {
  const freeTrack = config.testTracks.free;
  const paidTrack = config.testTracks.paid;
  
  let canAccessFreeContent = false;
  let gets402ForPaidContent = false;
  
  try {
    // Test free content (no auth)
    const freeRes = await fetch(`${config.apiUrl}/api/v1/content/${freeTrack.dtag}`);
    canAccessFreeContent = freeRes.ok;
    
    // Test paid content (no auth, no token)
    const paidRes = await fetch(`${config.apiUrl}/api/v1/content/${paidTrack.dtag}`);
    gets402ForPaidContent = paidRes.status === 402;
  } catch {
    // Network error
  }
  
  return {
    tested: true,
    canAccessFreeContent,
    gets402ForPaidContent,
  };
}

/**
 * Measure API response time for an endpoint
 */
export async function measureApiEndpoint(
  endpoint: string,
  method: string = 'GET',
  headers?: Record<string, string>
): Promise<ApiMetrics> {
  const url = `${config.apiUrl}${endpoint}`;
  const startTime = performance.now();
  const capturedAt = new Date().toISOString();
  
  try {
    const response = await fetch(url, { method, headers });
    const responseTimeMs = performance.now() - startTime;
    
    return {
      endpoint,
      method,
      responseTimeMs,
      statusCode: response.status,
      success: response.ok || response.status === 402, // 402 is expected for paid content
      capturedAt,
    };
  } catch (err) {
    return {
      endpoint,
      method,
      responseTimeMs: performance.now() - startTime,
      statusCode: 0,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      capturedAt,
    };
  }
}

/**
 * Capture full snapshot
 */
export async function captureSnapshot(
  triggeredBy: 'manual' | 'ci' | 'nightly',
  testResults?: any[]
): Promise<Snapshot> {
  const id = generateSnapshotId();
  const startTime = performance.now();
  const git = getGitInfo();
  
  console.log(`📸 Capturing snapshot ${id}...`);
  
  // Capture all states in parallel where possible
  const [artist, listener, mint, anonymousAccess, tracks] = await Promise.all([
    captureArtistState(config.testArtist.nsec),
    captureListenerState(config.testListener.nsec),
    captureMintState(),
    captureAnonymousAccess(),
    captureTrackStates(),
  ]);
  
  const proofPool = captureProofPoolState();
  
  // Measure key API endpoints
  const apiMetrics = await Promise.all([
    measureApiEndpoint('/api/v1/content/' + config.testTracks.free.dtag),
    measureApiEndpoint('/api/v1/content/' + config.testTracks.paid.dtag),
    measureApiEndpoint('/api/v1/audio/' + config.testTracks.free.dtag),
    measureApiEndpoint('/api/v1/audio/' + config.testTracks.paid.dtag),
  ]);
  
  const duration = performance.now() - startTime;
  
  const metadata: SnapshotMetadata = {
    id,
    timestamp: new Date().toISOString(),
    gitHash: git.hash,
    gitBranch: git.branch,
    triggeredBy,
    duration,
    nodeVersion: process.version,
    environment: 'staging',
  };
  
  console.log(`✅ Snapshot captured in ${duration.toFixed(0)}ms`);
  
  return {
    metadata,
    artist,
    listener,
    anonymousListener: anonymousAccess,
    mint,
    proofPool,
    tracks,
    apiMetrics,
    testResults: testResults || [],
  };
}
