import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@wavlake/paywall-react';

type MintState = 
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'waiting'; invoice: string; quoteId: string }
  | { status: 'minting' }
  | { status: 'success'; amount: number }
  | { status: 'error'; message: string };

export function WalletPanel() {
  const { 
    balance, 
    isReady, 
    isLoading, 
    error, 
    receiveToken, 
    createMintQuote,
    mintTokens,
    clear 
  } = useWallet();
  
  // Collapsed state
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Token paste input
  const [tokenInput, setTokenInput] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Mint flow state
  const [mintAmount, setMintAmount] = useState('5');
  const [mintState, setMintState] = useState<MintState>({ status: 'idle' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quoteRef = useRef<any>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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

  const handleCreateInvoice = async () => {
    const amount = parseInt(mintAmount, 10);
    if (isNaN(amount) || amount < 1) {
      setMintState({ status: 'error', message: 'Enter a valid amount' });
      return;
    }

    setMintState({ status: 'creating' });
    
    try {
      const quote = await createMintQuote(amount);
      quoteRef.current = quote;
      setMintState({ 
        status: 'waiting', 
        invoice: quote.request,
        quoteId: quote.id,
      });

      // Start polling for payment
      pollRef.current = setInterval(async () => {
        try {
          const minted = await mintTokens(quoteRef.current);
          if (minted > 0) {
            if (pollRef.current) clearInterval(pollRef.current);
            setMintState({ status: 'success', amount: minted });
            // Reset after 3 seconds
            setTimeout(() => setMintState({ status: 'idle' }), 3000);
          }
        } catch (err: any) {
          // Keep polling unless it's a real error (not just "not paid yet")
          if (err.message && !err.message.includes('not paid') && !err.message.includes('pending')) {
            console.log('Mint poll error:', err.message);
          }
        }
      }, 3000);

      // Timeout after 10 minutes
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          if (mintState.status === 'waiting') {
            setMintState({ status: 'error', message: 'Invoice expired' });
          }
        }
      }, 10 * 60 * 1000);

    } catch (err) {
      setMintState({ 
        status: 'error', 
        message: err instanceof Error ? err.message : 'Failed to create invoice' 
      });
    }
  };

  const handleCancelMint = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setMintState({ status: 'idle' });
  };

  const handleCopyInvoice = async () => {
    if (mintState.status === 'waiting') {
      await navigator.clipboard.writeText(mintState.invoice);
      setMessage({ type: 'success', text: 'Invoice copied!' });
      setTimeout(() => setMessage(null), 2000);
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
        <h2 className="collapsible-header">💰 Wallet <span className="header-badge">loading...</span></h2>
      </section>
    );
  }

  return (
    <section className="panel wallet-panel">
      <h2 className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span>{isCollapsed ? '▶' : '▼'} 💰 Wallet</span>
        <span className="header-balance">{balance} credits</span>
      </h2>
      
      {isCollapsed ? null : (
      <>
      <div className="balance">
        <span className="balance-amount">{balance}</span>
        <span className="balance-label">credits</span>
      </div>

      {/* Mint Flow */}
      <div className="mint-section">
        <h3>⚡ Add Credits</h3>
        
        {mintState.status === 'idle' && (
          <div className="mint-form">
            <input
              type="number"
              min="1"
              placeholder="Amount"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              className="mint-amount-input"
            />
            <button onClick={handleCreateInvoice} disabled={isLoading}>
              Get Invoice
            </button>
          </div>
        )}

        {mintState.status === 'creating' && (
          <p className="loading">Creating invoice...</p>
        )}

        {mintState.status === 'waiting' && (
          <div className="invoice-display">
            <p className="invoice-label">Pay this Lightning invoice:</p>
            <div className="invoice-box" onClick={handleCopyInvoice}>
              <code>{mintState.invoice}</code>
            </div>
            <div className="invoice-actions">
              <button onClick={handleCopyInvoice} className="copy-btn">
                📋 Copy
              </button>
              <button onClick={handleCancelMint} className="cancel-btn">
                Cancel
              </button>
            </div>
            <p className="waiting-text">⏳ Waiting for payment...</p>
          </div>
        )}

        {mintState.status === 'minting' && (
          <p className="loading">Minting tokens...</p>
        )}

        {mintState.status === 'success' && (
          <p className="message success">✅ Minted {mintState.amount} credits!</p>
        )}

        {mintState.status === 'error' && (
          <div>
            <p className="message error">{mintState.message}</p>
            <button onClick={() => setMintState({ status: 'idle' })}>Try Again</button>
          </div>
        )}
      </div>

      {/* Divider */}
      <hr className="divider" />

      {/* Manual token paste (backup option) */}
      <details className="paste-section">
        <summary>Paste token manually</summary>
        <div className="receive-form">
          <input
            type="text"
            placeholder="Paste cashu token (cashuB...)"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            disabled={isLoading}
          />
          <button onClick={handleReceive} disabled={isLoading || !tokenInput.trim()}>
            Add
          </button>
        </div>
      </details>

      {message && (
        <p className={`message ${message.type}`}>{message.text}</p>
      )}

      {error && (
        <p className="message error">{error.message}</p>
      )}

      <button className="clear-btn" onClick={handleClear} disabled={isLoading || balance === 0}>
        Clear Wallet
      </button>
      </>
      )}
    </section>
  );
}
