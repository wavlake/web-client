import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../hooks/useAuth';

const DESCRIPTIONS = {
  'content': '📄 /content → JSON with signed URL + grant replay (2 requests)',
  'audio': '🎵 /audio → Direct binary stream via header token (1 request)',
  'audio-url': '🔗 /audio?token= → URL param token for native <audio> element',
};

export function Settings() {
  const { endpoint, setEndpoint, walletStorage, setWalletStorage } = useSettings();
  const { pubkey, isLoggedIn, loginWithNip07, loginWithNsec, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showNsecInput, setShowNsecInput] = useState(false);
  const [nsecInput, setNsecInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleNip07Login = async () => {
    setAuthError(null);
    try {
      await loginWithNip07();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  const handleNsecLogin = async () => {
    setAuthError(null);
    try {
      await loginWithNsec(nsecInput);
      setNsecInput('');
      setShowNsecInput(false);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Invalid nsec');
    }
  };

  return (
    <section className="panel settings-panel">
      <h2 className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span>{isCollapsed ? '▶' : '▼'} ⚙️ Settings</span>
        <span className="header-badge">{walletStorage === 'nostr' ? '☁️' : '💾'} {isLoggedIn ? '🔑' : ''}</span>
      </h2>
      
      {isCollapsed ? null : (
      <>
      {/* Auth Section */}
      <div className="setting-row">
        <label>Nostr Account:</label>
        {isLoggedIn ? (
          <div className="auth-status">
            <span className="pubkey">🔑 {pubkey?.slice(0, 8)}...</span>
            <button className="btn-small" onClick={logout}>Logout</button>
          </div>
        ) : (
          <div className="auth-buttons">
            <button className="btn-small" onClick={handleNip07Login}>
              🔌 Extension
            </button>
            <button className="btn-small" onClick={() => setShowNsecInput(!showNsecInput)}>
              🔐 nsec
            </button>
          </div>
        )}
      </div>
      
      {showNsecInput && !isLoggedIn && (
        <div className="nsec-input-row">
          <input
            type="password"
            value={nsecInput}
            onChange={(e) => setNsecInput(e.target.value)}
            placeholder="nsec1..."
          />
          <button className="btn-small" onClick={handleNsecLogin}>Login</button>
        </div>
      )}
      
      {authError && <p className="error-text">{authError}</p>}

      {/* Wallet Storage Toggle */}
      <div className="setting-row">
        <label>Wallet Storage:</label>
        <div className="toggle-group">
          <button 
            className={walletStorage === 'local' ? 'active' : ''}
            onClick={() => setWalletStorage('local')}
          >
            💾 Local
          </button>
          <button 
            className={walletStorage === 'nostr' ? 'active' : ''}
            onClick={() => setWalletStorage('nostr')}
            disabled={!isLoggedIn}
            title={!isLoggedIn ? 'Login required' : ''}
          >
            ☁️ Nostr
          </button>
        </div>
      </div>
      
      {walletStorage === 'nostr' && (
        <p className="setting-description" style={{ color: '#a78bfa' }}>
          ☁️ Tokens synced to Nostr relays via NIP-60
        </p>
      )}
      
      {/* Endpoint Toggle */}
      <div className="setting-row">
        <label>Payment Method:</label>
        <div className="toggle-group">
          <button 
            className={endpoint === 'content' ? 'active' : ''}
            onClick={() => setEndpoint('content')}
          >
            /content
          </button>
          <button 
            className={endpoint === 'audio' ? 'active' : ''}
            onClick={() => setEndpoint('audio')}
          >
            /audio
          </button>
          <button 
            className={endpoint === 'audio-url' ? 'active' : ''}
            onClick={() => setEndpoint('audio-url')}
          >
            URL token
          </button>
        </div>
      </div>
      
      <p className="setting-description">
        {DESCRIPTIONS[endpoint]}
      </p>
      </>
      )}
    </section>
  );
}
