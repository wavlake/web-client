import { useState, useEffect, useCallback } from 'react';
import { useNDK } from '../lib/ndk';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '@wavlake/paywall-react';
import { TOKEN_KIND, HISTORY_KIND, WALLET_KIND } from '@wavlake/nostr-wallet';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

interface TokenEvent {
  id: string;
  createdAt: Date;
  contentLength: number;
  dTag?: string;
  decrypted?: {
    mint: string;
    unit: string;
    proofCount: number;
    totalAmount: number;
    proofs: Array<{ amount: number; id: string; C: string }>;
  };
}

interface HistoryEvent {
  id: string;
  createdAt: Date;
  direction?: 'in' | 'out';
  amount?: number;
  unit?: string;
}

interface WalletEvent {
  id: string;
  createdAt: Date;
  hasMints: boolean;
  hasPrivkey: boolean;
}

export function Nip60DebugPanel() {
  const { ndk, connected } = useNDK();
  const { pubkey, signer, isLoggedIn } = useAuth();
  const { walletStorage } = useSettings();
  const { proofs, balance, isReady } = useWallet();

  const [isCollapsed, setIsCollapsed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [tokenEvents, setTokenEvents] = useState<TokenEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [walletEvent, setWalletEvent] = useState<WalletEvent | null>(null);
  const [p2pkPubkey, setP2pkPubkey] = useState<string | null>(null);
  const [relays, setRelays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  
  // Calculate NIP-60 balance from token events
  const nip60Balance = tokenEvents.reduce((sum, evt) => {
    return sum + (evt.decrypted?.totalAmount || 0);
  }, 0);
  
  // Check if local and NIP-60 are in sync
  const isInSync = balance === nip60Balance;

  // Fetch NIP-60 events from relay
  const fetchNip60Data = useCallback(async () => {
    if (!ndk || !connected || !pubkey || !isLoggedIn || !signer) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get connected relay URLs
      const relayUrls = Array.from(ndk.pool?.relays?.keys() || []);
      setRelays(relayUrls);

      // Fetch token events (kind:7375)
      const tokenFilter: NDKFilter = {
        kinds: [TOKEN_KIND as number],
        authors: [pubkey],
        limit: 20,
      };
      
      const tokenEvts = await ndk.fetchEvents(tokenFilter, { closeOnEose: true });
      const parsedTokens: TokenEvent[] = [];
      
      for (const evt of tokenEvts) {
        const parsed: TokenEvent = {
          id: evt.id,
          createdAt: new Date((evt.created_at || 0) * 1000),
          contentLength: evt.content.length,
        };

        // Try to decrypt
        try {
          const user = await signer.user();
          const plaintext = await signer.decrypt(user, evt.content);
          const content = JSON.parse(plaintext);
          parsed.decrypted = {
            mint: content.mint || 'unknown',
            unit: content.unit || 'sat',
            proofCount: content.proofs?.length || 0,
            totalAmount: content.proofs?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0,
            proofs: (content.proofs || []).map((p: any) => ({
              amount: p.amount,
              id: p.id,
              C: p.C?.slice(0, 20) + '...',
            })),
          };
        } catch (e) {
          // Couldn't decrypt - might be old/corrupted
        }

        parsedTokens.push(parsed);
      }
      
      // Sort by date descending
      parsedTokens.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setTokenEvents(parsedTokens);

      // Fetch history events (kind:7376)
      const historyFilter: NDKFilter = {
        kinds: [HISTORY_KIND as number],
        authors: [pubkey],
        limit: 20,
      };
      
      const historyEvts = await ndk.fetchEvents(historyFilter, { closeOnEose: true });
      const parsedHistory: HistoryEvent[] = [];
      
      for (const evt of historyEvts) {
        const parsed: HistoryEvent = {
          id: evt.id,
          createdAt: new Date((evt.created_at || 0) * 1000),
        };

        try {
          const user = await signer.user();
          const plaintext = await signer.decrypt(user, evt.content);
          const tuples = JSON.parse(plaintext);
          for (const tuple of tuples) {
            if (tuple[0] === 'direction') parsed.direction = tuple[1] as 'in' | 'out';
            if (tuple[0] === 'amount') parsed.amount = parseInt(tuple[1], 10);
            if (tuple[0] === 'unit') parsed.unit = tuple[1];
          }
        } catch (e) {
          // Couldn't decrypt
        }

        parsedHistory.push(parsed);
      }
      
      parsedHistory.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setHistoryEvents(parsedHistory);

      // Fetch wallet event (kind:17375)
      const walletFilter: NDKFilter = {
        kinds: [WALLET_KIND as number],
        authors: [pubkey],
        limit: 1,
      };
      
      const walletEvts = await ndk.fetchEvents(walletFilter, { closeOnEose: true });
      const walletEvt = [...walletEvts][0];
      
      if (walletEvt) {
        const parsed: WalletEvent = {
          id: walletEvt.id,
          createdAt: new Date((walletEvt.created_at || 0) * 1000),
          hasMints: false,
          hasPrivkey: false,
        };

        try {
          const user = await signer.user();
          const plaintext = await signer.decrypt(user, walletEvt.content);
          const content = JSON.parse(plaintext);
          parsed.hasMints = !!content.mints?.length;
          parsed.hasPrivkey = !!content.privkey;
          
          // Derive P2PK pubkey if we have privkey
          if (content.privkey) {
            // Import secp256k1 dynamically
            const { getPublicKey } = await import('@noble/secp256k1');
            const privkeyBytes = hexToBytes(content.privkey);
            const pubkeyBytes = getPublicKey(privkeyBytes, true);
            setP2pkPubkey(bytesToHex(pubkeyBytes.slice(1)));
          }
        } catch (e) {
          // Couldn't decrypt
        }

        setWalletEvent(parsed);
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch NIP-60 data');
    } finally {
      setLoading(false);
    }
  }, [ndk, connected, pubkey, isLoggedIn, signer]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    if (walletStorage === 'nostr' && isLoggedIn) {
      fetchNip60Data();
    }
  }, [walletStorage, isLoggedIn, fetchNip60Data]);

  // Helper functions
  function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if (walletStorage !== 'nostr') {
    return (
      <section className="panel nip60-debug-panel">
        <h2 className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
          <span>{isCollapsed ? '▶' : '▼'} 🔐 NIP-60 Debug</span>
        </h2>
        {!isCollapsed && <p className="info-text">Switch to Nostr storage to view NIP-60 data</p>}
      </section>
    );
  }

  if (!isLoggedIn) {
    return (
      <section className="panel nip60-debug-panel">
        <h2 className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
          <span>{isCollapsed ? '▶' : '▼'} 🔐 NIP-60 Debug</span>
        </h2>
        {!isCollapsed && <p className="info-text">Login to view NIP-60 wallet data</p>}
      </section>
    );
  }

  return (
    <section className="panel nip60-debug-panel">
      <h2 className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span>{isCollapsed ? '▶' : '▼'} 🔐 NIP-60 Debug</span>
        <span className="header-badge">{tokenEvents.length} events</span>
      </h2>

      {isCollapsed ? null : (
        <>
      {/* Refresh button */}
      <button 
        onClick={(e) => { e.stopPropagation(); fetchNip60Data(); }} 
        disabled={loading}
        className="refresh-btn"
      >
        {loading ? '⏳ Loading...' : '🔄 Refresh'}
      </button>

      {error && <p className="error-text">{error}</p>}

      {/* Connection Status */}
      <div className="debug-section">
        <h3>📡 Connection</h3>
        <div className="debug-row">
          <span>Status:</span>
          <span className={connected ? 'status-ok' : 'status-error'}>
            {connected ? '✅ Connected' : '❌ Disconnected'}
          </span>
        </div>
        <div className="debug-row">
          <span>Relays:</span>
          <span className="mono">{relays.length > 0 ? relays.join(', ') : 'None'}</span>
        </div>
        <div className="debug-row">
          <span>Pubkey:</span>
          <span className="mono">{pubkey?.slice(0, 16)}...</span>
        </div>
      </div>

      {/* Wallet Event (kind:17375) */}
      <div className="debug-section">
        <h3>👛 Wallet Event (kind:{WALLET_KIND})</h3>
        {walletEvent ? (
          <>
            <div className="debug-row">
              <span>Event ID:</span>
              <span className="mono">{walletEvent.id.slice(0, 16)}...</span>
            </div>
            <div className="debug-row">
              <span>Created:</span>
              <span>{walletEvent.createdAt.toISOString()}</span>
            </div>
            <div className="debug-row">
              <span>Has P2PK Key:</span>
              <span>{walletEvent.hasPrivkey ? '✅ Yes' : '❌ No'}</span>
            </div>
            <div className="debug-row">
              <span>Has Mints:</span>
              <span>{walletEvent.hasMints ? '✅ Yes' : '❌ No'}</span>
            </div>
            {p2pkPubkey && (
              <div className="debug-row">
                <span>P2PK Pubkey:</span>
                <span className="mono" title={p2pkPubkey}>{p2pkPubkey.slice(0, 20)}...</span>
              </div>
            )}
          </>
        ) : (
          <p className="info-text">No wallet event found</p>
        )}
      </div>

      {/* Token Events (kind:7375) */}
      <div className="debug-section">
        <h3>🪙 Token Events (kind:{TOKEN_KIND})</h3>
        <p className="count-badge">{tokenEvents.length} event(s)</p>
        
        {tokenEvents.length > 0 ? (
          <div className="event-list">
            {tokenEvents.map((evt) => (
              <div 
                key={evt.id} 
                className={`event-item ${expandedEvent === evt.id ? 'expanded' : ''}`}
                onClick={() => setExpandedEvent(expandedEvent === evt.id ? null : evt.id)}
              >
                <div className="event-header">
                  <span className="mono">{evt.id.slice(0, 12)}...</span>
                  <span className="event-date">{evt.createdAt.toLocaleString()}</span>
                  {evt.decrypted && (
                    <span className="event-amount">{evt.decrypted.totalAmount} {evt.decrypted.unit}</span>
                  )}
                </div>
                
                {expandedEvent === evt.id && evt.decrypted && (
                  <div className="event-details">
                    <div className="debug-row">
                      <span>Mint:</span>
                      <span className="mono">{evt.decrypted.mint}</span>
                    </div>
                    <div className="debug-row">
                      <span>Proofs:</span>
                      <span>{evt.decrypted.proofCount}</span>
                    </div>
                    <div className="proofs-list">
                      {evt.decrypted.proofs.map((p, i) => (
                        <div key={i} className="proof-item">
                          <span>{p.amount} {evt.decrypted?.unit}</span>
                          <span className="mono">keyset: {p.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="info-text">No token events found</p>
        )}
      </div>

      {/* Spending History (kind:7376) */}
      <div className="debug-section">
        <h3>📜 Spending History (kind:{HISTORY_KIND})</h3>
        <p className="count-badge">{historyEvents.length} event(s)</p>
        
        {historyEvents.length > 0 ? (
          <div className="event-list">
            {historyEvents.map((evt) => (
              <div key={evt.id} className="event-item">
                <div className="event-header">
                  <span className={`direction ${evt.direction}`}>
                    {evt.direction === 'in' ? '📥' : '📤'} {evt.direction || '?'}
                  </span>
                  <span className="event-amount">
                    {evt.amount !== undefined ? `${evt.amount} ${evt.unit || 'sat'}` : '?'}
                  </span>
                  <span className="event-date">{evt.createdAt.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="info-text">No history events found</p>
        )}
      </div>

      {/* Sync Status */}
      <div className="debug-section sync-section">
        <h3>🔄 Sync Status</h3>
        <div className="sync-comparison">
          <div className="sync-item">
            <span className="sync-label">Local</span>
            <span className="sync-value">{balance}</span>
          </div>
          <div className="sync-arrow">{isInSync ? '=' : '≠'}</div>
          <div className="sync-item">
            <span className="sync-label">NIP-60</span>
            <span className="sync-value">{nip60Balance}</span>
          </div>
        </div>
        <div className={`sync-status ${isInSync ? 'synced' : 'unsynced'}`}>
          {isInSync ? '✅ In Sync' : '⚠️ Out of Sync'}
        </div>
        {!isInSync && (
          <p className="sync-hint">
            Difference: {Math.abs(balance - nip60Balance)} credits
            {balance > nip60Balance 
              ? ' (local has more - needs publish)' 
              : ' (NIP-60 has more - needs load)'}
          </p>
        )}
      </div>

      {/* Local Wallet State */}
      <div className="debug-section">
        <h3>💾 Local State</h3>
        <div className="debug-row">
          <span>Ready:</span>
          <span>{isReady ? '✅ Yes' : '⏳ No'}</span>
        </div>
        <div className="debug-row">
          <span>Balance:</span>
          <span>{balance} credits</span>
        </div>
        <div className="debug-row">
          <span>Local Proofs:</span>
          <span>{proofs.length}</span>
        </div>
        {proofs.length > 0 && (
          <div className="proofs-list">
            {proofs.map((p, i) => (
              <div key={i} className="proof-item">
                <span>{p.amount}</span>
                <span className="mono">keyset: {p.id}</span>
                <span className="mono">C: {p.C?.slice(0, 16)}...</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .nip60-debug-panel {
          font-size: 12px;
        }
        .nip60-debug-panel h2 {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .nip60-debug-panel h3 {
          font-size: 13px;
          margin: 12px 0 8px;
          color: #a78bfa;
        }
        .refresh-btn {
          padding: 6px 12px;
          font-size: 11px;
          margin-bottom: 12px;
        }
        .debug-section {
          background: rgba(0,0,0,0.2);
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 12px;
        }
        .debug-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .debug-row:last-child {
          border-bottom: none;
        }
        .mono {
          font-family: monospace;
          font-size: 10px;
          color: #888;
        }
        .status-ok { color: #4ade80; }
        .status-error { color: #f87171; }
        .info-text {
          color: #666;
          font-style: italic;
          font-size: 11px;
        }
        .error-text {
          color: #f87171;
          font-size: 11px;
        }
        .count-badge {
          display: inline-block;
          background: #a78bfa33;
          color: #a78bfa;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          margin-bottom: 8px;
        }
        .event-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .event-item {
          background: rgba(0,0,0,0.3);
          padding: 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .event-item:hover {
          background: rgba(0,0,0,0.4);
        }
        .event-item.expanded {
          background: rgba(167, 139, 250, 0.1);
        }
        .event-header {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .event-date {
          color: #666;
          font-size: 10px;
        }
        .event-amount {
          color: #4ade80;
          font-weight: bold;
        }
        .event-details {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        .direction.in { color: #4ade80; }
        .direction.out { color: #f87171; }
        .proofs-list {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .proof-item {
          display: flex;
          gap: 8px;
          font-size: 10px;
          padding: 4px;
          background: rgba(0,0,0,0.2);
          border-radius: 3px;
        }
        .proof-item span:first-child {
          color: #4ade80;
          min-width: 40px;
        }
        .collapsible-header {
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          user-select: none;
        }
        .collapsible-header:hover {
          opacity: 0.8;
        }
        .header-badge {
          font-size: 10px;
          font-weight: normal;
          color: #a78bfa;
          background: #a78bfa22;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .sync-section {
          background: rgba(167, 139, 250, 0.1);
          border: 1px solid #a78bfa44;
        }
        .sync-comparison {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          margin: 12px 0;
        }
        .sync-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .sync-label {
          font-size: 10px;
          color: #888;
          text-transform: uppercase;
        }
        .sync-value {
          font-size: 20px;
          font-weight: bold;
          color: #fff;
        }
        .sync-arrow {
          font-size: 24px;
          color: #666;
        }
        .sync-status {
          text-align: center;
          padding: 8px;
          border-radius: 4px;
          font-weight: bold;
        }
        .sync-status.synced {
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
        }
        .sync-status.unsynced {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
        }
        .sync-hint {
          text-align: center;
          font-size: 10px;
          color: #888;
          margin-top: 8px;
        }
      `}</style>
        </>
      )}
    </section>
  );
}
