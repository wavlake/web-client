import { useState } from 'react';
import { useWallet } from '@wavlake/paywall-react';

export function WalletPanel() {
  const { balance, isReady, isLoading, error, receiveToken, clear } = useWallet();
  const [tokenInput, setTokenInput] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleReceive = async () => {
    if (!tokenInput.trim()) return;
    
    setMessage(null);
    try {
      const amount = await receiveToken(tokenInput.trim());
      setMessage({ type: 'success', text: `Received ${amount} credits!` });
      setTokenInput('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to receive token' });
    }
  };

  const handleClear = async () => {
    if (confirm('Clear wallet? This cannot be undone.')) {
      await clear();
      setMessage({ type: 'success', text: 'Wallet cleared' });
    }
  };

  if (!isReady) {
    return (
      <section className="panel wallet-panel">
        <h2>💰 Wallet</h2>
        <p className="loading">Loading wallet...</p>
      </section>
    );
  }

  return (
    <section className="panel wallet-panel">
      <h2>💰 Wallet</h2>
      
      <div className="balance">
        <span className="balance-amount">{balance}</span>
        <span className="balance-label">credits</span>
      </div>

      <div className="receive-form">
        <input
          type="text"
          placeholder="Paste cashu token (cashuB...)"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          disabled={isLoading}
        />
        <button onClick={handleReceive} disabled={isLoading || !tokenInput.trim()}>
          {isLoading ? 'Receiving...' : 'Add Funds'}
        </button>
      </div>

      {message && (
        <p className={`message ${message.type}`}>{message.text}</p>
      )}

      {error && (
        <p className="message error">{error.message}</p>
      )}

      <button className="clear-btn" onClick={handleClear} disabled={isLoading || balance === 0}>
        Clear Wallet
      </button>
    </section>
  );
}
