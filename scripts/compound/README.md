# Compound Engineering Automation

This repo uses automated compound engineering to build features while you sleep.

## How It Works

Two nightly cron jobs:

1. **22:45 PT - Compound Review** - Extract learnings, update CLAUDE.md
2. **23:15 PT - Auto-Implement** - Pick next PRD, implement, create draft PR

## Adding Work

Create a PRD in `docs/PRD/daemon-queue/`:

```
docs/PRD/daemon-queue/my-feature/README.md
```

The daemon picks up the oldest unprocessed PRD.

## Monitoring

```bash
cat scripts/compound/state.json
```

## Manual Trigger

From Clawdbot:
```
/cron run web-client-review
/cron run web-client-implement
```
