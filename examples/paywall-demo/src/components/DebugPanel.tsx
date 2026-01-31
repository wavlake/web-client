import { useState, useEffect, useRef } from 'react';
import { 
  subscribeToLogs as subscribeWallet, 
  getLogBuffer as getWalletLogs,
  clearLogBuffer as clearWalletLogs,
  type LogEntry,
} from '@wavlake/wallet';
import {
  subscribeToLogs as subscribePaywall,
  getLogBuffer as getPaywallLogs,
  clearLogBuffer as clearPaywallLogs,
} from '@wavlake/paywall-client';

export function DebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to logs from both packages
  useEffect(() => {
    // Load existing logs
    setLogs([...getWalletLogs(), ...getPaywallLogs()].sort((a, b) => a.timestamp - b.timestamp));

    // Subscribe to new logs
    const unsubWallet = subscribeWallet((entry) => {
      setLogs(prev => [...prev.slice(-99), entry]);
    });
    const unsubPaywall = subscribePaywall((entry) => {
      setLogs(prev => [...prev.slice(-99), entry]);
    });

    return () => {
      unsubWallet();
      unsubPaywall();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const handleClear = () => {
    clearWalletLogs();
    clearPaywallLogs();
    setLogs([]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const levelColors: Record<string, string> = {
    debug: '#888',
    info: '#4ade80',
    warn: '#fbbf24',
    error: '#f87171',
  };

  if (!isOpen) {
    return (
      <button className="debug-toggle" onClick={() => setIsOpen(true)}>
        🔍 Debug ({logs.length})
      </button>
    );
  }

  return (
    <section className="panel debug-panel">
      <div className="debug-header">
        <h2>🔍 Debug Logs</h2>
        <div className="debug-actions">
          <button onClick={handleClear}>Clear</button>
          <button onClick={() => setIsOpen(false)}>Close</button>
        </div>
      </div>
      
      <div className="debug-logs">
        {logs.length === 0 ? (
          <p className="no-logs">No logs yet. Interact with the wallet to see debug output.</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`log-entry log-${log.level}`}>
              <span className="log-time">{formatTime(log.timestamp)}</span>
              <span className="log-category" style={{ color: levelColors[log.level] }}>
                [{log.category}:{log.level}]
              </span>
              <span className="log-message">{log.message}</span>
              {log.data && Object.keys(log.data).length > 0 && (
                <pre className="log-data">{JSON.stringify(log.data, null, 2)}</pre>
              )}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </section>
  );
}
