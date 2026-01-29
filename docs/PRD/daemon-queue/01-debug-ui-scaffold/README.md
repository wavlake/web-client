# PRD: Debug UI Scaffold

Build the debug-first layout with visible state panels.

## Goal

Three-panel layout showing tracks, wallet state, and request/response logs.

## Implementation

### Phase 1: Debug Layout

**Tasks:**
1. Create `src/components/DebugPanel.tsx`
   - Collapsible panel component
   - JSON viewer for state inspection
   - Copy-to-clipboard for values

2. Create `src/components/DebugLayout.tsx`
   - Left: Track list (narrow)
   - Center: Now playing + controls
   - Right: Debug panels (wallet, logs)
   - Bottom: Request/response log stream

3. Create `src/stores/debug.ts`
   ```typescript
   interface DebugState {
     logs: LogEntry[];
     addLog: (entry: LogEntry) => void;
     clearLogs: () => void;
   }
   
   interface LogEntry {
     timestamp: Date;
     type: 'request' | 'response' | 'event' | 'error';
     label: string;
     data: unknown;
   }
   ```

4. Update App.tsx to use DebugLayout

**Acceptance Criteria:**
- [ ] Three-panel layout renders
- [ ] Debug panels collapsible
- [ ] Log entries display with timestamps
- [ ] JSON data viewable and copyable
