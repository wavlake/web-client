/**
 * Snapshot Types
 * 
 * Type definitions for the E2E snapshot system.
 */

export interface SnapshotMetadata {
  id: string;                    // ISO timestamp: 2026-01-31T22-45-00Z
  timestamp: string;             // ISO date string
  gitHash: string;               // Current commit
  gitBranch: string;             // Current branch
  triggeredBy: 'manual' | 'ci' | 'nightly';
  duration: number;              // Total test duration in ms
  nodeVersion: string;
  environment: 'staging' | 'production';
}

export interface ArtistState {
  pubkey: string;
  npub: string;
  balance: {
    available_credits: number;
    lifetime_earnings_credits: number;
    pending_payout_credits: number;
  };
  streams: {
    paid: number;
    free_tier: number;
    free_access: number;
    honor_paid: number;
    honor_unpaid: number;
    total: number;
  };
  trackCount: number;
  capturedAt: string;
}

export interface ListenerState {
  pubkey: string;
  npub: string;
  spending: {
    total_spent_credits: number;
    monthly_cap_credits: number;
    cap_reached: boolean;
    period_start: string;
    period_end: string;
  } | null;  // null if anonymous or not tracked
  capturedAt: string;
}

export interface MintState {
  url: string;
  name: string;
  version: string;
  activeKeysets: Array<{
    id: string;
    unit: string;
    active: boolean;
  }>;
  healthy: boolean;
  responseTimeMs: number;
  capturedAt: string;
}

export interface ProofPoolState {
  totalBalance: number;
  proofCount: number;
  denominations: Record<number, number>;  // amount -> count
  capturedAt: string;
}

export interface TrackState {
  dtag: string;
  title: string;
  priceCredits: number;
  accessMode: 'free' | 'paid' | 'preview';
  artistPubkey: string;
}

export interface ApiMetrics {
  endpoint: string;
  method: string;
  responseTimeMs: number;
  statusCode: number;
  success: boolean;
  error?: string;
  capturedAt: string;
}

export interface TestResult {
  name: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  sideEffects?: string[];  // List of expected side effects
}

export interface Snapshot {
  metadata: SnapshotMetadata;
  artist: ArtistState;
  listener: ListenerState;
  anonymousListener: {
    tested: boolean;
    canAccessFreeContent: boolean;
    gets402ForPaidContent: boolean;
  };
  mint: MintState;
  proofPool: ProofPoolState;
  tracks: TrackState[];
  apiMetrics: ApiMetrics[];
  testResults: TestResult[];
}

export interface SnapshotDiff {
  snapshotId: string;
  comparedTo: string;  // 'golden' or previous snapshot ID
  timestamp: string;
  
  artist: {
    earnings_delta: number;
    streams_delta: {
      paid: number;
      free: number;
      total: number;
    };
    balance_delta: number;
  };
  
  listener: {
    spending_delta: number;
    cap_status_changed: boolean;
  };
  
  mint: {
    keyset_changed: boolean;
    version_changed: boolean;
    health_changed: boolean;
    avg_response_time_delta: number;
  };
  
  proofPool: {
    balance_delta: number;
    proofs_delta: number;
  };
  
  tests: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    new_failures: string[];
    fixed: string[];
  };
  
  apiMetrics: {
    avg_response_time_delta: number;
    error_rate_delta: number;
    slowest_endpoint: string;
    fastest_endpoint: string;
  };
  
  deviations: Deviation[];
}

export interface Deviation {
  category: 'artist' | 'listener' | 'mint' | 'pool' | 'test' | 'api';
  field: string;
  expected: string | number | boolean;
  actual: string | number | boolean;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface SnapshotManifest {
  version: string;
  goldenBaseline: string | null;  // ID of golden snapshot
  latestSnapshot: string | null;
  snapshots: Array<{
    id: string;
    timestamp: string;
    triggeredBy: string;
    testsPassed: number;
    testsFailed: number;
    deviationCount: number;
  }>;
}
