/**
 * WalletError tests
 */

import { describe, it, expect } from 'vitest';
import {
  WalletError,
  toWalletError,
  needsMoreFunds,
} from '../src/errors.js';

describe('WalletError', () => {
  describe('factory methods', () => {
    it('insufficientBalance creates correct error', () => {
      const error = WalletError.insufficientBalance(100, 50);
      expect(error.code).toBe('INSUFFICIENT_BALANCE');
      expect(error.details.required).toBe(100);
      expect(error.details.available).toBe(50);
      expect(error.message).toContain('100');
      expect(error.message).toContain('50');
    });

    it('invalidAmount creates correct error', () => {
      const error = WalletError.invalidAmount(-5);
      expect(error.code).toBe('INVALID_AMOUNT');
      expect(error.message).toContain('-5');
    });

    it('invalidAmount with reason creates correct error', () => {
      const error = WalletError.invalidAmount(0, 'cannot be zero');
      expect(error.message).toContain('cannot be zero');
    });

    it('proofSelectionFailed creates correct error', () => {
      const error = WalletError.proofSelectionFailed(50, 100);
      expect(error.code).toBe('PROOF_SELECTION_FAILED');
      expect(error.details.required).toBe(50);
      expect(error.details.available).toBe(100);
    });

    it('mintMismatch creates correct error', () => {
      const error = WalletError.mintMismatch(
        'https://expected.mint.com',
        'https://actual.mint.com'
      );
      expect(error.code).toBe('MINT_MISMATCH');
      expect(error.details.expectedMint).toBe('https://expected.mint.com');
      expect(error.details.actualMint).toBe('https://actual.mint.com');
    });

    it('emptyToken creates correct error', () => {
      const error = WalletError.emptyToken();
      expect(error.code).toBe('EMPTY_TOKEN');
      expect(error.message).toContain('no proofs');
    });

    it('invalidToken creates correct error', () => {
      const cause = new Error('parse failed');
      const error = WalletError.invalidToken('malformed', cause);
      expect(error.code).toBe('INVALID_TOKEN');
      expect(error.details.cause).toBe(cause);
    });

    it('notLoaded creates correct error', () => {
      const error = WalletError.notLoaded();
      expect(error.code).toBe('WALLET_NOT_LOADED');
    });

    it('storageError creates correct error', () => {
      const cause = new Error('disk full');
      const error = WalletError.storageError('save', cause);
      expect(error.code).toBe('STORAGE_ERROR');
      expect(error.message).toContain('disk full');
    });

    it('mintError creates correct error', () => {
      const cause = new Error('connection refused');
      const error = WalletError.mintError('connect', cause);
      expect(error.code).toBe('MINT_ERROR');
      expect(error.message).toContain('connection refused');
    });

    it('swapFailed creates correct error', () => {
      const cause = new Error('swap rejected');
      const error = WalletError.swapFailed(10, cause);
      expect(error.code).toBe('SWAP_FAILED');
      expect(error.details.required).toBe(10);
    });
  });

  describe('type guards', () => {
    it('isWalletError identifies WalletError', () => {
      const walletError = WalletError.insufficientBalance(10, 5);
      const regularError = new Error('test');

      expect(WalletError.isWalletError(walletError)).toBe(true);
      expect(WalletError.isWalletError(regularError)).toBe(false);
      expect(WalletError.isWalletError(null)).toBe(false);
      expect(WalletError.isWalletError(undefined)).toBe(false);
    });

    it('isInsufficientBalance identifies balance errors', () => {
      const balanceError = WalletError.insufficientBalance(10, 5);
      const otherError = WalletError.invalidAmount(0);

      expect(WalletError.isInsufficientBalance(balanceError)).toBe(true);
      expect(WalletError.isInsufficientBalance(otherError)).toBe(false);
    });

    it('isInvalidAmount identifies amount errors', () => {
      const amountError = WalletError.invalidAmount(-1);
      const otherError = WalletError.insufficientBalance(10, 5);

      expect(WalletError.isInvalidAmount(amountError)).toBe(true);
      expect(WalletError.isInvalidAmount(otherError)).toBe(false);
    });

    it('isMintMismatch identifies mint errors', () => {
      const mintError = WalletError.mintMismatch('a', 'b');
      const otherError = WalletError.emptyToken();

      expect(WalletError.isMintMismatch(mintError)).toBe(true);
      expect(WalletError.isMintMismatch(otherError)).toBe(false);
    });

    it('isNotLoaded identifies not loaded errors', () => {
      const notLoadedError = WalletError.notLoaded();
      const otherError = WalletError.emptyToken();

      expect(WalletError.isNotLoaded(notLoadedError)).toBe(true);
      expect(WalletError.isNotLoaded(otherError)).toBe(false);
    });

    it('isRecoverable identifies recoverable errors', () => {
      expect(WalletError.isRecoverable(WalletError.insufficientBalance(10, 5))).toBe(true);
      expect(WalletError.isRecoverable(WalletError.invalidAmount(0))).toBe(true);
      expect(WalletError.isRecoverable(WalletError.notLoaded())).toBe(true);
      expect(WalletError.isRecoverable(WalletError.emptyToken())).toBe(false);
      expect(WalletError.isRecoverable(WalletError.mintMismatch('a', 'b'))).toBe(false);
      expect(WalletError.isRecoverable(new Error('test'))).toBe(false);
    });
  });

  describe('userMessage', () => {
    it('returns friendly message for INSUFFICIENT_BALANCE', () => {
      const error = WalletError.insufficientBalance(100, 50);
      expect(error.userMessage).toBe('You need 50 more credits');
    });

    it('handles singular credit', () => {
      const error = WalletError.insufficientBalance(6, 5);
      expect(error.userMessage).toBe('You need 1 more credit');
    });

    it('returns friendly message for INVALID_AMOUNT', () => {
      const error = WalletError.invalidAmount(-5);
      expect(error.userMessage).toBe('Please enter a valid amount');
    });

    it('returns friendly message for PROOF_SELECTION_FAILED', () => {
      const error = WalletError.proofSelectionFailed(50, 100);
      expect(error.userMessage).toContain('50');
    });

    it('returns friendly message for MINT_MISMATCH', () => {
      const error = WalletError.mintMismatch('a', 'b');
      expect(error.userMessage).toContain('wrong mint');
    });

    it('returns friendly message for EMPTY_TOKEN', () => {
      const error = WalletError.emptyToken();
      expect(error.userMessage).toBe('This token is empty');
    });

    it('returns friendly message for INVALID_TOKEN', () => {
      const error = WalletError.invalidToken('bad format');
      expect(error.userMessage).toBe('This token is invalid or corrupted');
    });

    it('returns friendly message for WALLET_NOT_LOADED', () => {
      const error = WalletError.notLoaded();
      expect(error.userMessage).toContain('loading');
    });

    it('returns friendly message for STORAGE_ERROR', () => {
      const error = WalletError.storageError('save');
      expect(error.userMessage).toContain('save');
    });

    it('returns friendly message for MINT_ERROR', () => {
      const error = WalletError.mintError('connect');
      expect(error.userMessage).toContain('mint');
    });

    it('returns friendly message for SWAP_FAILED', () => {
      const error = WalletError.swapFailed(10);
      expect(error.userMessage).toContain('failed');
    });
  });

  describe('recoverySuggestion', () => {
    it('suggests adding credits for balance errors', () => {
      const error = WalletError.insufficientBalance(100, 50);
      expect(error.recoverySuggestion).toContain('Add more credits');
    });

    it('suggests valid amount for amount errors', () => {
      const error = WalletError.invalidAmount(0);
      expect(error.recoverySuggestion).toContain('greater than zero');
    });

    it('suggests trying different amount for selection errors', () => {
      const error = WalletError.proofSelectionFailed(50, 100);
      expect(error.recoverySuggestion).toContain('different amount');
    });

    it('suggests correct mint for mismatch errors', () => {
      const error = WalletError.mintMismatch('a', 'b');
      expect(error.recoverySuggestion).toContain('correct mint');
    });

    it('suggests waiting for not loaded errors', () => {
      const error = WalletError.notLoaded();
      expect(error.recoverySuggestion).toContain('Wait');
    });

    it('returns undefined for non-recoverable errors', () => {
      const error = WalletError.emptyToken();
      expect(error.recoverySuggestion).toBeUndefined();
    });
  });

  describe('shortfall', () => {
    it('returns shortfall for balance errors', () => {
      const error = WalletError.insufficientBalance(100, 30);
      expect(error.shortfall).toBe(70);
    });

    it('returns undefined for non-balance errors', () => {
      const error = WalletError.invalidAmount(0);
      expect(error.shortfall).toBeUndefined();
    });
  });

  describe('isRecoverable instance property', () => {
    it('returns true for recoverable errors', () => {
      expect(WalletError.insufficientBalance(10, 5).isRecoverable).toBe(true);
    });

    it('returns false for non-recoverable errors', () => {
      expect(WalletError.emptyToken().isRecoverable).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('serializes error to plain object', () => {
      const error = WalletError.insufficientBalance(100, 50);
      const json = error.toJSON();

      expect(json.code).toBe('INSUFFICIENT_BALANCE');
      expect(json.message).toBe(error.message);
      expect(json.details.required).toBe(100);
      expect(json.details.available).toBe(50);
    });

    it('does not include cause in JSON', () => {
      const cause = new Error('original');
      const error = WalletError.storageError('save', cause);
      const json = error.toJSON();

      expect(json.details.cause).toBeUndefined();
    });
  });

  describe('error name', () => {
    it('sets name to WalletError', () => {
      const error = WalletError.insufficientBalance(10, 5);
      expect(error.name).toBe('WalletError');
    });
  });
});

describe('toWalletError', () => {
  it('returns WalletError unchanged', () => {
    const original = WalletError.insufficientBalance(10, 5);
    const result = toWalletError(original);
    expect(result).toBe(original);
  });

  it('wraps Error in WalletError', () => {
    const original = new Error('network issue');
    const result = toWalletError(original);

    expect(WalletError.isWalletError(result)).toBe(true);
    expect(result.code).toBe('MINT_ERROR'); // default fallback
    expect(result.message).toBe('network issue');
    expect(result.details.cause).toBe(original);
  });

  it('wraps string in WalletError', () => {
    const result = toWalletError('something broke');

    expect(WalletError.isWalletError(result)).toBe(true);
    expect(result.message).toBe('something broke');
  });

  it('uses provided fallback code', () => {
    const result = toWalletError(new Error('disk full'), 'STORAGE_ERROR');
    expect(result.code).toBe('STORAGE_ERROR');
  });
});

describe('needsMoreFunds', () => {
  it('returns true for insufficient balance', () => {
    const error = WalletError.insufficientBalance(100, 50);
    expect(needsMoreFunds(error)).toBe(true);
  });

  it('returns true for proof selection failed', () => {
    const error = WalletError.proofSelectionFailed(50, 100);
    expect(needsMoreFunds(error)).toBe(true);
  });

  it('returns false for other wallet errors', () => {
    expect(needsMoreFunds(WalletError.emptyToken())).toBe(false);
    expect(needsMoreFunds(WalletError.mintMismatch('a', 'b'))).toBe(false);
    expect(needsMoreFunds(WalletError.invalidAmount(0))).toBe(false);
  });

  it('returns false for non-wallet errors', () => {
    expect(needsMoreFunds(new Error('test'))).toBe(false);
    expect(needsMoreFunds(null)).toBe(false);
  });
});
