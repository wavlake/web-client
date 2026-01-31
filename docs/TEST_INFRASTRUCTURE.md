# Test Infrastructure

## Proof Pool Management

The E2E tests use real ecash proofs stored in `proofs.json`. This pool needs periodic refilling.

### Quick Commands

```bash
# Check pool status
npm run pool:status

# Create refill invoice
npm run pool:refill

# Check if healthy (CI mode, exits 1 if low)
npm run pool:check
```

### Pool Status

```bash
npx tsx scripts/proof-pool-status.ts
```

Output:
```
🏦 Proof Pool Status
════════════════════════════════════════
Balance:     35 credits
Proofs:      15
Denominations: 8, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 1

🟢 OK: Balance healthy
```

### Refilling the Pool

1. **Create a mint quote:**
   ```bash
   npm run pool:refill
   # Or specify amount:
   npx tsx scripts/proof-pool-status.ts --refill 200
   ```

2. **Pay the Lightning invoice** displayed in the output

3. **Claim the minted proofs:**
   ```bash
   # One-shot (if already paid):
   npx tsx scripts/proof-pool-refill.ts <quote-id> <amount>
   
   # Or poll until paid:
   npx tsx scripts/proof-pool-refill.ts --poll <quote-id> <amount>
   ```

4. **Commit the updated proofs:**
   ```bash
   git add proofs.json
   git commit -m "refill: add test credits"
   git push
   ```

### Thresholds

| Level | Balance | Action |
|-------|---------|--------|
| 🟢 Healthy | ≥50 | None |
| 🟡 Warning | 20-49 | Refill soon |
| 🔴 Critical | <20 | E2E tests skip in CI |

### CI Integration

The GitHub Actions workflow (`e2e-tests.yml`):

1. Checks pool balance before running tests
2. Skips E2E tests if balance < 20 credits
3. Creates a GitHub Issue on scheduled runs if balance is low
4. Reports remaining balance after tests

### Manual Refill Estimate

Each test run uses approximately:
- **Access mode tests**: 0 credits (no payments)
- **Payment tests**: ~12-20 credits (with change recovery)

Recommended refill: **100 credits** lasts ~5-8 full test runs.

### Files

| File | Purpose |
|------|---------|
| `proofs.json` | Current proof pool (committed) |
| `proofs.backup.json` | Backup before modifications |
| `scripts/proof-pool-status.ts` | Status check & quote creation |
| `scripts/proof-pool-refill.ts` | Claim minted proofs |
| `tests/e2e/helpers/proof-pool.ts` | Test-time proof management |

### Security Notes

- `proofs.json` contains real ecash that can be spent
- Proofs are for **staging mint only** (worthless on mainnet)
- Don't commit proofs from production mints
- The backup file is gitignored

### Troubleshooting

**"Insufficient balance" during tests:**
```bash
npm run pool:status  # Check current balance
npm run pool:refill  # Create refill quote
```

**Tests failing with spent proofs:**
```bash
# Restore from backup
cp proofs.backup.json proofs.json
```

**Quote expired:**
- Quotes expire after ~10 minutes
- Create a new quote with `npm run pool:refill`
