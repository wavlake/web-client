import type { Track } from '../types/nostr';
import { useWalletStore } from '../stores/wallet';

interface PaymentModalProps {
  track: Track;
  price: number;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export default function PaymentModal({
  track,
  price,
  onConfirm,
  onCancel,
  isProcessing,
}: PaymentModalProps) {
  const balance = useWalletStore((s) => s.getBalance());
  const hasEnough = balance >= price;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-4">Pay to Play</h3>
        
        {/* Track info */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-surface-light rounded-lg">
          {track.metadata.artwork_url ? (
            <img
              src={track.metadata.artwork_url}
              alt={track.metadata.title}
              className="w-12 h-12 rounded object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-gray-700 flex items-center justify-center">
              🎵
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{track.metadata.title}</p>
            <p className="text-gray-400 text-sm truncate">{track.metadata.artist}</p>
          </div>
        </div>

        {/* Price */}
        <div className="flex justify-between items-center mb-4 text-sm">
          <span className="text-gray-400">Price:</span>
          <span className="text-white font-mono">{price} credits</span>
        </div>

        {/* Balance */}
        <div className="flex justify-between items-center mb-4 text-sm">
          <span className="text-gray-400">Your balance:</span>
          <span className={`font-mono ${hasEnough ? 'text-green-400' : 'text-red-400'}`}>
            {balance} credits
          </span>
        </div>

        {!hasEnough && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
            Insufficient balance. Buy more credits first.
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-surface-light transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!hasEnough || isProcessing}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : `Pay ${price} credits`}
          </button>
        </div>
      </div>
    </div>
  );
}
