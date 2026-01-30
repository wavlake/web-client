/**
 * Login Modal
 * 
 * Allows login via:
 * 1. NIP-07 browser extension (Alby, nos2x)
 * 2. Paste nsec (private key)
 */

import { useState } from 'react';
import { nip19, getPublicKey } from 'nostr-tools';
import { debugLog } from '../stores/debug';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (pubkey: string, privkey?: string) => void;
}

export function LoginModal({ isOpen, onClose, onLogin }: LoginModalProps) {
  const [nsecInput, setNsecInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  if (!isOpen) return null;

  const handleNIP07 = async () => {
    if (!window.nostr) {
      setError('No Nostr extension found. Install Alby or nos2x.');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const pubkey = await window.nostr.getPublicKey();
      debugLog('event', 'NIP-07 login successful', { pubkey: pubkey.slice(0, 16) + '...' });
      onLogin(pubkey);
      onClose();
    } catch (err) {
      setError('Extension rejected request');
      debugLog('error', 'NIP-07 login failed', { error: String(err) });
    } finally {
      setConnecting(false);
    }
  };

  const handleNsecLogin = () => {
    setError(null);
    const input = nsecInput.trim();

    if (!input) {
      setError('Please enter your nsec');
      return;
    }

    try {
      let privkeyHex: string;

      if (input.startsWith('nsec1')) {
        // Decode bech32 nsec
        const decoded = nip19.decode(input);
        if (decoded.type !== 'nsec') {
          setError('Invalid nsec format');
          return;
        }
        privkeyHex = decoded.data as string;
      } else if (/^[0-9a-fA-F]{64}$/.test(input)) {
        // Raw hex private key
        privkeyHex = input.toLowerCase();
      } else {
        setError('Invalid format. Use nsec1... or 64-char hex');
        return;
      }

      // Derive public key
      const pubkey = getPublicKey(privkeyHex);
      
      debugLog('event', 'nsec login successful', { pubkey: pubkey.slice(0, 16) + '...' });
      onLogin(pubkey, privkeyHex);
      onClose();
      setNsecInput('');
    } catch (err) {
      setError('Invalid private key');
      debugLog('error', 'nsec login failed', { error: String(err) });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-surface border border-surface-light rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-4">Connect Nostr</h2>
        
        {/* NIP-07 Option */}
        <div className="mb-6">
          <button
            onClick={handleNIP07}
            disabled={connecting}
            className="w-full py-3 px-4 bg-primary hover:bg-primary-600 disabled:opacity-50 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            {connecting ? (
              'Connecting...'
            ) : (
              <>
                <span>🔌</span>
                <span>Use Browser Extension</span>
              </>
            )}
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Alby, nos2x, or any NIP-07 extension
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-surface-light" />
          <span className="text-xs text-gray-500">or</span>
          <div className="flex-1 h-px bg-surface-light" />
        </div>

        {/* nsec Input */}
        <div className="space-y-3">
          <label className="text-sm text-gray-400 block">
            Paste your nsec (private key)
          </label>
          <input
            type="password"
            value={nsecInput}
            onChange={(e) => setNsecInput(e.target.value)}
            placeholder="nsec1..."
            className="w-full px-3 py-2 bg-background border border-surface-light rounded-lg text-white text-sm font-mono focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleNsecLogin}
            className="w-full py-2 px-4 bg-surface-light hover:bg-gray-700 rounded-lg text-white font-medium transition-colors"
          >
            Login with nsec
          </button>
          <p className="text-xs text-yellow-500/80 text-center">
            ⚠️ Only use on trusted devices. Key stored in browser.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
