import { useEffect, useRef, useState } from 'react';
import { useDebugStore, type LogEntry } from '../stores/debug';
import { JsonViewer } from './DebugPanel';

const TYPE_COLORS: Record<LogEntry['type'], string> = {
  request: 'text-blue-400',
  response: 'text-green-400',
  wallet: 'text-yellow-400',
  player: 'text-purple-400',
  event: 'text-cyan-400',
  error: 'text-red-400',
  app: 'text-gray-400',
  tokenCache: 'text-orange-400',
  smartPrebuild: 'text-pink-400',
};

const TYPE_ICONS: Record<LogEntry['type'], string> = {
  request: '→',
  response: '←',
  wallet: '💰',
  player: '🎵',
  event: '⚡',
  error: '❌',
  app: '🚀',
  tokenCache: '🎟️',
  smartPrebuild: '🧠',
};

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const time = entry.timestamp.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  return (
    <div className="border-b border-surface-light last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-light transition-colors text-left"
      >
        <span className="text-xs text-gray-500 font-mono w-20 shrink-0">
          {time}
        </span>
        <span className={`text-sm ${TYPE_COLORS[entry.type]}`}>
          {TYPE_ICONS[entry.type]}
        </span>
        <span className={`text-xs font-medium ${TYPE_COLORS[entry.type]} uppercase w-16 shrink-0`}>
          {entry.type}
        </span>
        <span className="text-xs text-gray-300 truncate flex-1">
          {entry.label}
        </span>
        {entry.data !== undefined && (
          <span className="text-gray-500 text-xs">
            {expanded ? '▼' : '▶'}
          </span>
        )}
      </button>
      {expanded && entry.data !== undefined && (
        <div className="px-2 pb-2">
          <JsonViewer data={entry.data} maxHeight="150px" />
        </div>
      )}
    </div>
  );
}

export function DebugLog() {
  const logs = useDebugStore((state) => state.logs);
  const clearLogs = useDebugStore((state) => state.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // Enable auto-scroll if user scrolls to bottom
      setAutoScroll(scrollTop + clientHeight >= scrollHeight - 10);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface/50 border-t border-surface-light">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-light bg-surface">
        <span className="text-sm font-medium text-white">Debug Log</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{logs.length} entries</span>
          <button
            onClick={clearLogs}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-surface-light transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No logs yet. Interact with the app to see debug output.
          </div>
        ) : (
          logs.map((entry) => (
            <LogEntryRow key={entry.id} entry={entry} />
          ))
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && logs.length > 0 && (
        <button
          onClick={() => setAutoScroll(true)}
          className="absolute bottom-2 right-2 px-2 py-1 text-xs bg-primary rounded text-white hover:bg-primary-600 transition-colors"
        >
          ↓ New logs
        </button>
      )}
    </div>
  );
}
