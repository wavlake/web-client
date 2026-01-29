import { useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { usePurchaseStore } from '../stores/purchase';
import { useWalletStore } from '../stores/wallet';

export function PurchasePanel() {
  const [amount, setAmount] = useState(100);
  const [copied, setCopied] = useState(false);
  
  const {
    quoteId,
    bolt11,
    quoteAmount,
    quoteExpiry,
    quotePaid,
    mintedProofs,
    isCreatingQuote,
    isCheckingStatus,
    isMinting,
    error,
    createQuote,
    checkQuoteStatus,
    mintTokens,
    reset,
  } = usePurchaseStore();
  
  const balance = useWalletStore(state => state.getBalance());
  
  const handleCreateQuote = async () => {
    await createQuote(amount);
  };
  
  const handleCheckStatus = async () => {
    await checkQuoteStatus();
  };
  
  const handleMint = async () => {
    await mintTokens();
  };
  
  const handleCopyInvoice = async () => {
    if (bolt11) {
      await navigator.clipboard.writeText(bolt11);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  const isExpired = quoteExpiry && new Date() > quoteExpiry;
  
  return (
    <DebugPanel title="Buy Credits">
      <div className="space-y-4">
        {/* Wallet Balance */}
        <div className="flex justify-between items-center p-2 bg-surface-light rounded">
          <span className="text-xs text-gray-400">Wallet Balance</span>
          <span className="text-sm font-mono text-green-400">{balance} credits</span>
        </div>
        
        {/* Amount Input */}
        {!quoteId && (
          <div className="space-y-2">
            <label className="text-xs text-gray-400 block">Amount (credits)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className="flex-1 px-3 py-2 text-sm font-mono bg-background border border-surface-light rounded text-white focus:outline-none focus:border-primary"
                min={1}
                disabled={isCreatingQuote}
              />
              <button
                onClick={handleCreateQuote}
                disabled={isCreatingQuote || amount < 1}
                className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingQuote ? 'Creating...' : 'Create Quote'}
              </button>
            </div>
          </div>
        )}
        
        {/* Quote Info */}
        {quoteId && (
          <div className="space-y-3">
            <div className="p-2 bg-surface-light rounded space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Quote ID</span>
                <span className="font-mono text-gray-300">{quoteId.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Amount</span>
                <span className="font-mono text-white">{quoteAmount} credits</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Status</span>
                <span className={`font-medium ${
                  quotePaid ? 'text-green-400' : isExpired ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {quotePaid ? '✅ PAID' : isExpired ? '❌ Expired' : '⏳ Unpaid'}
                </span>
              </div>
            </div>
            
            {/* Invoice Display */}
            {bolt11 && !quotePaid && !isExpired && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400 block">Lightning Invoice</label>
                <div className="p-2 bg-background border border-surface-light rounded">
                  <code className="text-xs text-gray-300 break-all block max-h-20 overflow-auto">
                    {bolt11}
                  </code>
                </div>
                <button
                  onClick={handleCopyInvoice}
                  className="w-full py-2 text-xs font-medium bg-surface-light hover:bg-surface text-white rounded transition-colors"
                >
                  {copied ? '✓ Copied!' : '📋 Copy Invoice'}
                </button>
              </div>
            )}
            
            {/* Check Status Button */}
            {!quotePaid && !isExpired && (
              <button
                onClick={handleCheckStatus}
                disabled={isCheckingStatus}
                className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
              >
                {isCheckingStatus ? 'Checking...' : '🔄 Check Status'}
              </button>
            )}
            
            {/* Mint Button */}
            {quotePaid && !mintedProofs && (
              <button
                onClick={handleMint}
                disabled={isMinting}
                className="w-full py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
              >
                {isMinting ? 'Minting...' : '🪙 Mint Tokens'}
              </button>
            )}
            
            {/* Success Message */}
            {mintedProofs && (
              <div className="p-3 bg-green-900/30 border border-green-500/50 rounded">
                <p className="text-sm text-green-400 font-medium mb-1">
                  ✅ Minted Successfully!
                </p>
                <p className="text-xs text-green-300">
                  {mintedProofs.length} proof{mintedProofs.length !== 1 ? 's' : ''} added to wallet
                </p>
                <p className="text-xs text-green-300 font-mono">
                  Total: {mintedProofs.reduce((s, p) => s + p.amount, 0)} credits
                </p>
              </div>
            )}
            
            {/* Reset Button */}
            <button
              onClick={reset}
              className="w-full py-2 text-xs text-gray-400 hover:text-white transition-colors"
            >
              ↩ Start Over
            </button>
          </div>
        )}
        
        {/* Error Display */}
        {error && (
          <div className="p-2 bg-red-900/30 border border-red-500/50 rounded">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>
    </DebugPanel>
  );
}
