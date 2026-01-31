/**
 * Snapshot Runner
 * 
 * CLI to capture snapshots, run tests, and compare results.
 * 
 * Usage:
 *   npx tsx tests/e2e/snapshots/run-snapshot.ts [command] [options]
 * 
 * Commands:
 *   capture [--trigger=manual|ci|nightly]  Capture a new snapshot
 *   compare <id> [--vs=golden|previous]    Compare snapshot to baseline
 *   list                                   List all snapshots
 *   set-golden <id>                        Set snapshot as golden baseline
 *   export-csv                             Export time series data as CSV
 *   run-tests [--trigger=manual|ci|nightly] Run tests and capture snapshot
 */

import { captureSnapshot } from './capture';
import { compareSnapshots, formatDiffReport } from './compare';
import {
  saveSnapshot,
  saveDiff,
  loadSnapshot,
  getGoldenBaseline,
  getPreviousSnapshot,
  setGoldenBaseline,
  listSnapshots,
  exportTimeSeriesData,
} from './storage';
import type { TestResult } from './snapshot-types';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  switch (command) {
    case 'capture': {
      const trigger = (args.find(a => a.startsWith('--trigger='))?.split('=')[1] || 'manual') as 'manual' | 'ci' | 'nightly';
      
      console.log(`\n🚀 Capturing snapshot (trigger: ${trigger})...\n`);
      
      const snapshot = await captureSnapshot(trigger);
      const dir = saveSnapshot(snapshot);
      
      // Compare to golden if exists
      const golden = getGoldenBaseline();
      if (golden) {
        console.log(`\n📊 Comparing to golden baseline...`);
        const diff = compareSnapshots(snapshot, golden, 'golden');
        saveDiff(diff, snapshot.metadata.id);
        console.log(formatDiffReport(diff));
      }
      
      // Compare to previous if exists
      const previous = getPreviousSnapshot(snapshot.metadata.id);
      if (previous && previous.metadata.id !== snapshot.metadata.id) {
        console.log(`\n📊 Comparing to previous snapshot (${previous.metadata.id})...`);
        const diff = compareSnapshots(snapshot, previous, previous.metadata.id);
        saveDiff(diff, snapshot.metadata.id);
        console.log(formatDiffReport(diff));
      }
      
      console.log(`\n✅ Snapshot saved to: ${dir}`);
      break;
    }
    
    case 'compare': {
      const id = args[1];
      if (!id) {
        console.error('Usage: compare <snapshot-id> [--vs=golden|previous|<id>]');
        process.exit(1);
      }
      
      const snapshot = loadSnapshot(id);
      if (!snapshot) {
        console.error(`Snapshot not found: ${id}`);
        process.exit(1);
      }
      
      const vsArg = args.find(a => a.startsWith('--vs='))?.split('=')[1] || 'golden';
      
      let baseline;
      let baselineLabel;
      
      if (vsArg === 'golden') {
        baseline = getGoldenBaseline();
        baselineLabel = 'golden';
      } else if (vsArg === 'previous') {
        baseline = getPreviousSnapshot(id);
        baselineLabel = baseline?.metadata.id || 'none';
      } else {
        baseline = loadSnapshot(vsArg);
        baselineLabel = vsArg;
      }
      
      if (!baseline) {
        console.error(`Baseline not found: ${vsArg}`);
        process.exit(1);
      }
      
      const diff = compareSnapshots(snapshot, baseline, baselineLabel);
      console.log(formatDiffReport(diff));
      break;
    }
    
    case 'list': {
      const snapshots = listSnapshots();
      
      console.log('\n📋 Snapshots:\n');
      console.log('| ID | Timestamp | Golden | Deviations |');
      console.log('|----|-----------|--------|------------|');
      
      for (const s of snapshots) {
        const golden = s.isGolden ? '⭐' : '';
        const devs = s.deviationCount > 0 ? `${s.deviationCount}` : '-';
        console.log(`| ${s.id} | ${s.timestamp} | ${golden} | ${devs} |`);
      }
      
      console.log(`\nTotal: ${snapshots.length} snapshots`);
      break;
    }
    
    case 'set-golden': {
      const id = args[1];
      if (!id) {
        console.error('Usage: set-golden <snapshot-id>');
        process.exit(1);
      }
      
      setGoldenBaseline(id);
      console.log(`\n⭐ Golden baseline set to: ${id}`);
      break;
    }
    
    case 'export-csv': {
      const data = exportTimeSeriesData();
      
      if (data.length === 0) {
        console.log('No snapshots to export.');
        break;
      }
      
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).join(','));
      
      console.log(headers);
      rows.forEach(row => console.log(row));
      break;
    }
    
    case 'run-tests': {
      const trigger = (args.find(a => a.startsWith('--trigger='))?.split('=')[1] || 'manual') as 'manual' | 'ci' | 'nightly';
      
      console.log(`\n🧪 Running E2E tests (trigger: ${trigger})...\n`);
      
      // Capture before state
      console.log('📸 Capturing pre-test state...');
      const beforeSnapshot = await captureSnapshot(trigger);
      
      // Run vitest and capture results
      const { execSync } = await import('child_process');
      let testOutput: string;
      let testsPassed = true;
      
      try {
        testOutput = execSync('npm run test:e2e -- --reporter=json', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        testOutput = err.stdout || '';
        testsPassed = false;
      }
      
      // Parse test results (simplified - vitest JSON output)
      const testResults: TestResult[] = [];
      try {
        const jsonMatch = testOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const results = JSON.parse(jsonMatch[0]);
          // Convert vitest format to our format
          // This is simplified - would need proper vitest JSON parsing
        }
      } catch {
        console.log('Could not parse test output, capturing raw results');
      }
      
      // Capture after state with test results
      console.log('\n📸 Capturing post-test state...');
      const afterSnapshot = await captureSnapshot(trigger, testResults);
      const dir = saveSnapshot(afterSnapshot);
      
      // Compare to golden
      const golden = getGoldenBaseline();
      if (golden) {
        console.log(`\n📊 Comparing to golden baseline...`);
        const diff = compareSnapshots(afterSnapshot, golden, 'golden');
        saveDiff(diff, afterSnapshot.metadata.id);
        console.log(formatDiffReport(diff));
      } else {
        console.log('\n⚠️ No golden baseline set. Use "set-golden <id>" to set one.');
      }
      
      // Compare before/after
      console.log(`\n📊 Comparing before/after test run...`);
      const runDiff = compareSnapshots(afterSnapshot, beforeSnapshot, 'pre-test');
      console.log(formatDiffReport(runDiff));
      
      console.log(`\n✅ Test run complete. Snapshot: ${afterSnapshot.metadata.id}`);
      
      if (!testsPassed) {
        process.exit(1);
      }
      break;
    }
    
    case 'help':
    default: {
      console.log(`
Snapshot Runner - E2E Test State Tracking

Usage:
  npx tsx tests/e2e/snapshots/run-snapshot.ts <command> [options]

Commands:
  capture [--trigger=manual|ci|nightly]
    Capture current state as a snapshot
    
  compare <id> [--vs=golden|previous|<other-id>]
    Compare a snapshot to a baseline
    
  list
    List all snapshots
    
  set-golden <id>
    Set a snapshot as the golden baseline
    
  export-csv
    Export time series data for charting
    
  run-tests [--trigger=manual|ci|nightly]
    Run tests and capture before/after snapshots

Examples:
  npx tsx tests/e2e/snapshots/run-snapshot.ts capture --trigger=nightly
  npx tsx tests/e2e/snapshots/run-snapshot.ts compare 2026-01-31T22-45-00Z --vs=golden
  npx tsx tests/e2e/snapshots/run-snapshot.ts set-golden 2026-01-31T22-45-00Z
      `);
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
