import { create } from 'zustand';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'request' | 'response' | 'wallet' | 'player' | 'event' | 'error';
  label: string;
  data: unknown;
}

interface DebugState {
  logs: LogEntry[];
  addLog: (entry: Omit<LogEntry, 'id'>) => void;
  clearLogs: () => void;
}

let logId = 0;

export const useDebugStore = create<DebugState>((set) => ({
  logs: [],
  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...entry,
          id: `log-${++logId}-${Date.now()}`,
        },
      ],
    })),
  clearLogs: () => set({ logs: [] }),
}));

// Helper for quick logging
export const debugLog = (
  type: LogEntry['type'],
  label: string,
  data?: unknown
) => {
  useDebugStore.getState().addLog({
    timestamp: new Date(),
    type,
    label,
    data,
  });
};
