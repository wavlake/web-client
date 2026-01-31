/**
 * Snapshot Comparison
 * 
 * Compare snapshots and detect deviations.
 */

import type { Snapshot, SnapshotDiff, Deviation } from './snapshot-types';

/**
 * Compare two snapshots and generate diff
 */
export function compareSnapshots(
  current: Snapshot,
  baseline: Snapshot,
  baselineLabel: string = 'baseline'
): SnapshotDiff {
  const deviations: Deviation[] = [];
  
  // Artist comparison
  const artistEarningsDelta = 
    current.artist.balance.lifetime_earnings_credits - 
    baseline.artist.balance.lifetime_earnings_credits;
  
  const artistStreamsDelta = {
    paid: current.artist.streams.paid - baseline.artist.streams.paid,
    free: current.artist.streams.free_access - baseline.artist.streams.free_access,
    total: current.artist.streams.total - baseline.artist.streams.total,
  };
  
  const artistBalanceDelta = 
    current.artist.balance.available_credits - 
    baseline.artist.balance.available_credits;
  
  // Flag unexpected artist changes
  if (artistEarningsDelta !== 0) {
    deviations.push({
      category: 'artist',
      field: 'lifetime_earnings_credits',
      expected: baseline.artist.balance.lifetime_earnings_credits,
      actual: current.artist.balance.lifetime_earnings_credits,
      severity: artistEarningsDelta > 0 ? 'info' : 'warning',
      message: `Artist earnings changed by ${artistEarningsDelta > 0 ? '+' : ''}${artistEarningsDelta} credits`,
    });
  }
  
  if (artistStreamsDelta.total !== 0) {
    deviations.push({
      category: 'artist',
      field: 'streams.total',
      expected: baseline.artist.streams.total,
      actual: current.artist.streams.total,
      severity: 'info',
      message: `Stream count changed by ${artistStreamsDelta.total > 0 ? '+' : ''}${artistStreamsDelta.total}`,
    });
  }
  
  // Listener comparison
  const listenerSpendingDelta = 
    (current.listener.spending?.total_spent_credits || 0) - 
    (baseline.listener.spending?.total_spent_credits || 0);
  
  const capStatusChanged = 
    (current.listener.spending?.cap_reached || false) !== 
    (baseline.listener.spending?.cap_reached || false);
  
  if (listenerSpendingDelta !== 0) {
    deviations.push({
      category: 'listener',
      field: 'total_spent_credits',
      expected: baseline.listener.spending?.total_spent_credits || 0,
      actual: current.listener.spending?.total_spent_credits || 0,
      severity: 'info',
      message: `Listener spending changed by ${listenerSpendingDelta > 0 ? '+' : ''}${listenerSpendingDelta} credits`,
    });
  }
  
  if (capStatusChanged) {
    deviations.push({
      category: 'listener',
      field: 'cap_reached',
      expected: baseline.listener.spending?.cap_reached || false,
      actual: current.listener.spending?.cap_reached || false,
      severity: 'warning',
      message: `Listener cap status changed: ${current.listener.spending?.cap_reached ? 'reached' : 'not reached'}`,
    });
  }
  
  // Mint comparison
  const keysetChanged = JSON.stringify(current.mint.activeKeysets.map(k => k.id).sort()) !== 
    JSON.stringify(baseline.mint.activeKeysets.map(k => k.id).sort());
  
  const versionChanged = current.mint.version !== baseline.mint.version;
  const healthChanged = current.mint.healthy !== baseline.mint.healthy;
  
  if (keysetChanged) {
    deviations.push({
      category: 'mint',
      field: 'activeKeysets',
      expected: baseline.mint.activeKeysets.map(k => k.id).join(', '),
      actual: current.mint.activeKeysets.map(k => k.id).join(', '),
      severity: 'critical',
      message: 'Mint keyset IDs changed! Existing proofs may be invalid.',
    });
  }
  
  if (versionChanged) {
    deviations.push({
      category: 'mint',
      field: 'version',
      expected: baseline.mint.version,
      actual: current.mint.version,
      severity: 'info',
      message: `Mint version changed: ${baseline.mint.version} → ${current.mint.version}`,
    });
  }
  
  if (healthChanged) {
    deviations.push({
      category: 'mint',
      field: 'healthy',
      expected: baseline.mint.healthy,
      actual: current.mint.healthy,
      severity: current.mint.healthy ? 'info' : 'critical',
      message: current.mint.healthy ? 'Mint recovered' : 'Mint is unhealthy!',
    });
  }
  
  const avgResponseTimeDelta = 
    (current.mint.responseTimeMs - baseline.mint.responseTimeMs);
  
  if (Math.abs(avgResponseTimeDelta) > 100) {
    deviations.push({
      category: 'mint',
      field: 'responseTimeMs',
      expected: baseline.mint.responseTimeMs,
      actual: current.mint.responseTimeMs,
      severity: avgResponseTimeDelta > 500 ? 'warning' : 'info',
      message: `Mint response time changed by ${avgResponseTimeDelta > 0 ? '+' : ''}${avgResponseTimeDelta.toFixed(0)}ms`,
    });
  }
  
  // Proof pool comparison
  const poolBalanceDelta = current.proofPool.totalBalance - baseline.proofPool.totalBalance;
  const poolProofsDelta = current.proofPool.proofCount - baseline.proofPool.proofCount;
  
  if (poolBalanceDelta !== 0) {
    deviations.push({
      category: 'pool',
      field: 'totalBalance',
      expected: baseline.proofPool.totalBalance,
      actual: current.proofPool.totalBalance,
      severity: poolBalanceDelta < 0 ? 'info' : 'info',
      message: `Pool balance changed by ${poolBalanceDelta > 0 ? '+' : ''}${poolBalanceDelta} credits`,
    });
  }
  
  // Test results comparison
  const currentPassed = current.testResults.filter(t => t.status === 'passed').length;
  const currentFailed = current.testResults.filter(t => t.status === 'failed').length;
  const currentSkipped = current.testResults.filter(t => t.status === 'skipped').length;
  
  const baselinePassed = baseline.testResults.filter(t => t.status === 'passed').length;
  const baselineFailed = baseline.testResults.filter(t => t.status === 'failed').length;
  
  const baselineFailedNames = new Set(
    baseline.testResults.filter(t => t.status === 'failed').map(t => t.name)
  );
  const currentFailedNames = new Set(
    current.testResults.filter(t => t.status === 'failed').map(t => t.name)
  );
  
  const newFailures = [...currentFailedNames].filter(n => !baselineFailedNames.has(n));
  const fixed = [...baselineFailedNames].filter(n => !currentFailedNames.has(n));
  
  if (newFailures.length > 0) {
    deviations.push({
      category: 'test',
      field: 'failures',
      expected: baselineFailed,
      actual: currentFailed,
      severity: 'critical',
      message: `New test failures: ${newFailures.join(', ')}`,
    });
  }
  
  if (fixed.length > 0) {
    deviations.push({
      category: 'test',
      field: 'fixed',
      expected: baselineFailed,
      actual: currentFailed,
      severity: 'info',
      message: `Tests fixed: ${fixed.join(', ')}`,
    });
  }
  
  // API metrics comparison
  const currentAvgTime = current.apiMetrics.length > 0
    ? current.apiMetrics.reduce((s, m) => s + m.responseTimeMs, 0) / current.apiMetrics.length
    : 0;
  const baselineAvgTime = baseline.apiMetrics.length > 0
    ? baseline.apiMetrics.reduce((s, m) => s + m.responseTimeMs, 0) / baseline.apiMetrics.length
    : 0;
  
  const currentErrorRate = current.apiMetrics.length > 0
    ? current.apiMetrics.filter(m => !m.success).length / current.apiMetrics.length
    : 0;
  const baselineErrorRate = baseline.apiMetrics.length > 0
    ? baseline.apiMetrics.filter(m => !m.success).length / baseline.apiMetrics.length
    : 0;
  
  const slowest = [...current.apiMetrics].sort((a, b) => b.responseTimeMs - a.responseTimeMs)[0];
  const fastest = [...current.apiMetrics].sort((a, b) => a.responseTimeMs - b.responseTimeMs)[0];
  
  if (currentErrorRate > baselineErrorRate) {
    deviations.push({
      category: 'api',
      field: 'error_rate',
      expected: baselineErrorRate,
      actual: currentErrorRate,
      severity: 'warning',
      message: `API error rate increased: ${(baselineErrorRate * 100).toFixed(1)}% → ${(currentErrorRate * 100).toFixed(1)}%`,
    });
  }
  
  return {
    snapshotId: current.metadata.id,
    comparedTo: baselineLabel,
    timestamp: new Date().toISOString(),
    
    artist: {
      earnings_delta: artistEarningsDelta,
      streams_delta: artistStreamsDelta,
      balance_delta: artistBalanceDelta,
    },
    
    listener: {
      spending_delta: listenerSpendingDelta,
      cap_status_changed: capStatusChanged,
    },
    
    mint: {
      keyset_changed: keysetChanged,
      version_changed: versionChanged,
      health_changed: healthChanged,
      avg_response_time_delta: avgResponseTimeDelta,
    },
    
    proofPool: {
      balance_delta: poolBalanceDelta,
      proofs_delta: poolProofsDelta,
    },
    
    tests: {
      total: current.testResults.length,
      passed: currentPassed,
      failed: currentFailed,
      skipped: currentSkipped,
      new_failures: newFailures,
      fixed,
    },
    
    apiMetrics: {
      avg_response_time_delta: currentAvgTime - baselineAvgTime,
      error_rate_delta: currentErrorRate - baselineErrorRate,
      slowest_endpoint: slowest?.endpoint || 'none',
      fastest_endpoint: fastest?.endpoint || 'none',
    },
    
    deviations,
  };
}

/**
 * Format diff as human-readable report
 */
export function formatDiffReport(diff: SnapshotDiff): string {
  const lines: string[] = [
    `# Snapshot Comparison Report`,
    ``,
    `**Snapshot:** ${diff.snapshotId}`,
    `**Compared to:** ${diff.comparedTo}`,
    `**Generated:** ${diff.timestamp}`,
    ``,
    `## Summary`,
    ``,
    `| Category | Changes |`,
    `|----------|---------|`,
    `| Artist Earnings | ${diff.artist.earnings_delta >= 0 ? '+' : ''}${diff.artist.earnings_delta} credits |`,
    `| Artist Streams | ${diff.artist.streams_delta.total >= 0 ? '+' : ''}${diff.artist.streams_delta.total} |`,
    `| Listener Spending | ${diff.listener.spending_delta >= 0 ? '+' : ''}${diff.listener.spending_delta} credits |`,
    `| Pool Balance | ${diff.proofPool.balance_delta >= 0 ? '+' : ''}${diff.proofPool.balance_delta} credits |`,
    `| Tests Passed | ${diff.tests.passed}/${diff.tests.total} |`,
    ``,
  ];
  
  if (diff.deviations.length > 0) {
    lines.push(`## Deviations (${diff.deviations.length})`);
    lines.push(``);
    
    const bySeverity = {
      critical: diff.deviations.filter(d => d.severity === 'critical'),
      warning: diff.deviations.filter(d => d.severity === 'warning'),
      info: diff.deviations.filter(d => d.severity === 'info'),
    };
    
    if (bySeverity.critical.length > 0) {
      lines.push(`### 🔴 Critical`);
      bySeverity.critical.forEach(d => lines.push(`- **${d.field}**: ${d.message}`));
      lines.push(``);
    }
    
    if (bySeverity.warning.length > 0) {
      lines.push(`### 🟡 Warning`);
      bySeverity.warning.forEach(d => lines.push(`- **${d.field}**: ${d.message}`));
      lines.push(``);
    }
    
    if (bySeverity.info.length > 0) {
      lines.push(`### 🔵 Info`);
      bySeverity.info.forEach(d => lines.push(`- **${d.field}**: ${d.message}`));
      lines.push(``);
    }
  } else {
    lines.push(`## Deviations`);
    lines.push(``);
    lines.push(`✅ No deviations detected.`);
  }
  
  lines.push(``);
  lines.push(`## API Performance`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Avg Response Time Δ | ${diff.apiMetrics.avg_response_time_delta >= 0 ? '+' : ''}${diff.apiMetrics.avg_response_time_delta.toFixed(0)}ms |`);
  lines.push(`| Slowest Endpoint | ${diff.apiMetrics.slowest_endpoint} |`);
  lines.push(`| Fastest Endpoint | ${diff.apiMetrics.fastest_endpoint} |`);
  
  return lines.join('\n');
}
