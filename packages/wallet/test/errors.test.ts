/**
 * Wallet Error Classes Tests
 */

import { describe, it, expect } from 'vitest';
import {
  TokenCreationError,
  WalletError,
  buildTokenErrorContext,
  generateTokenCreationSuggestion,
  isWalletRelatedError,
  getUserMessage,
  getRecoverySuggestion,
} from '../src/errors.js';
import type { Proof } from '@cashu/cashu-ts';

// Helper to create mock proofs
function createMockProofs(amounts: number[]): Proof[] {
  return amounts.map((amount, i) => ({
    C: `C${i}`,
    amount,
    id: 'keyset1',
    secret: `secret${i}`,
  }));
}

describe('TokenCreationError', () => {
  describe('construction', () => {
    it('should create error with all context properties', () => {
      const proofs = createMockProofs([1, 2, 4]);
      const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 10, proofs);
      const error = new TokenCreationError('Test message', context);

      expect(error.name).toBe('TokenCreationError');
      expect(error.code).toBe('INSUFFICIENT_BALANCE');
      expect(error.message).toBe('Test message');
      expect(error.requestedAmount).toBe(10);
      expect(error.availableBalance).toBe(7);
      expect(error.availableDenominations).toEqual([1, 2, 4]);
      expect(error.denominationCounts).toEqual({ 1: 1, 2: 1, 4: 1 });
      expect(error.suggestion).toBeDefined();
    });

    it('should include selected proofs when provided', () => {
      const proofs = createMockProofs([5, 5, 10]);
      const selected = [proofs[0], proofs[1]];
      const context = buildTokenErrorContext('SWAP_FAILED', 8, proofs, selected);
      const error = new TokenCreationError('Swap failed', context);

      expect(error.selectedProofs).toEqual(selected);
      expect(error.selectedTotal).toBe(10);
    });
  });

  describe('type guards', () => {
    it('isTokenCreationError should return true for TokenCreationError', () => {
      const context = buildTokenErrorContext('INVALID_AMOUNT', -1, []);
      const error = new TokenCreationError('Invalid', context);
      
      expect(TokenCreationError.isTokenCreationError(error)).toBe(true);
      expect(TokenCreationError.isTokenCreationError(new Error('test'))).toBe(false);
      expect(TokenCreationError.isTokenCreationError(null)).toBe(false);
      expect(TokenCreationError.isTokenCreationError('string')).toBe(false);
    });

    it('isInsufficientBalance should identify insufficient balance errors', () => {
      const insufficientCtx = buildTokenErrorContext('INSUFFICIENT_BALANCE', 100, []);
      const insufficient = new TokenCreationError('Not enough', insufficientCtx);
      
      const invalidCtx = buildTokenErrorContext('INVALID_AMOUNT', -1, []);
      const invalid = new TokenCreationError('Invalid', invalidCtx);

      expect(TokenCreationError.isInsufficientBalance(insufficient)).toBe(true);
      expect(TokenCreationError.isInsufficientBalance(invalid)).toBe(false);
    });

    it('isSelectionFailed should identify selection errors', () => {
      const selectionCtx = buildTokenErrorContext('SELECTION_FAILED', 5, createMockProofs([10]));
      const selection = new TokenCreationError('Cannot select', selectionCtx);

      expect(TokenCreationError.isSelectionFailed(selection)).toBe(true);
    });

    it('isInvalidAmount should identify invalid amount errors', () => {
      const invalidCtx = buildTokenErrorContext('INVALID_AMOUNT', 0, []);
      const invalid = new TokenCreationError('Invalid', invalidCtx);

      expect(TokenCreationError.isInvalidAmount(invalid)).toBe(true);
    });
  });

  describe('computed properties', () => {
    it('shortfall should return the amount needed', () => {
      const proofs = createMockProofs([5, 5]); // 10 total
      const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 15, proofs);
      const error = new TokenCreationError('Need more', context);

      expect(error.shortfall).toBe(5);
    });

    it('shortfall should return 0 when balance is sufficient', () => {
      const proofs = createMockProofs([10, 10]); // 20 total
      const context = buildTokenErrorContext('SELECTION_FAILED', 15, proofs);
      const error = new TokenCreationError('Cannot select', context);

      expect(error.shortfall).toBe(0);
    });

    it('isRecoverable should return true for insufficient balance', () => {
      const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 100, []);
      const error = new TokenCreationError('Need more', context);

      expect(error.isRecoverable).toBe(true);
    });

    it('isRecoverable should return false for other errors', () => {
      const context = buildTokenErrorContext('INVALID_AMOUNT', -1, []);
      const error = new TokenCreationError('Invalid', context);

      expect(error.isRecoverable).toBe(false);
    });
  });

  describe('userMessage', () => {
    it('should format insufficient balance message', () => {
      const proofs = createMockProofs([5]); // 5 total
      const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 10, proofs);
      const error = new TokenCreationError('Test', context);

      expect(error.userMessage).toBe('Need 5 more credits (have 5, need 10)');
    });

    it('should format single credit shortage correctly', () => {
      const proofs = createMockProofs([9]); // 9 total
      const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 10, proofs);
      const error = new TokenCreationError('Test', context);

      expect(error.userMessage).toBe('Need 1 more credit (have 9, need 10)');
    });

    it('should format selection failed message', () => {
      const context = buildTokenErrorContext('SELECTION_FAILED', 5, createMockProofs([10]));
      const error = new TokenCreationError('Test', context);

      expect(error.userMessage).toBe('Cannot create exact amount of 5 from available proofs');
    });

    it('should format invalid amount message', () => {
      const context = buildTokenErrorContext('INVALID_AMOUNT', 0, []);
      const error = new TokenCreationError('Test', context);

      expect(error.userMessage).toBe('Amount must be a positive number');
    });

    it('should format wallet not loaded message', () => {
      const context = buildTokenErrorContext('WALLET_NOT_LOADED', 5, []);
      const error = new TokenCreationError('Test', context);

      expect(error.userMessage).toBe('Wallet must be loaded before creating tokens');
    });

    it('should format swap failed message', () => {
      const context = buildTokenErrorContext('SWAP_FAILED', 5, createMockProofs([10]));
      const error = new TokenCreationError('Test', context);

      expect(error.userMessage).toBe('Failed to swap proofs for exact amount');
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const proofs = createMockProofs([5, 10]);
      const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 20, proofs);
      const error = new TokenCreationError('Test message', context);
      const json = error.toJSON();

      expect(json.name).toBe('TokenCreationError');
      expect(json.code).toBe('INSUFFICIENT_BALANCE');
      expect(json.message).toBe('Test message');
      expect(json.requestedAmount).toBe(20);
      expect(json.availableBalance).toBe(15);
      expect(json.shortfall).toBe(5);
    });
  });
});

describe('WalletError', () => {
  describe('construction', () => {
    it('should create error with all context properties', () => {
      const error = new WalletError('Mint unreachable', {
        code: 'MINT_UNREACHABLE',
        mintUrl: 'https://mint.example.com',
        details: { timeout: 5000 },
      });

      expect(error.name).toBe('WalletError');
      expect(error.code).toBe('MINT_UNREACHABLE');
      expect(error.message).toBe('Mint unreachable');
      expect(error.mintUrl).toBe('https://mint.example.com');
      expect(error.details).toEqual({ timeout: 5000 });
    });
  });

  describe('type guards', () => {
    it('isWalletError should return true for WalletError', () => {
      const error = new WalletError('Test', { code: 'LOAD_FAILED' });
      
      expect(WalletError.isWalletError(error)).toBe(true);
      expect(WalletError.isWalletError(new Error('test'))).toBe(false);
    });

    it('isMintUnreachable should identify mint unreachable errors', () => {
      const unreachable = new WalletError('Test', { code: 'MINT_UNREACHABLE' });
      const other = new WalletError('Test', { code: 'LOAD_FAILED' });

      expect(WalletError.isMintUnreachable(unreachable)).toBe(true);
      expect(WalletError.isMintUnreachable(other)).toBe(false);
    });

    it('isMintMismatch should identify mint mismatch errors', () => {
      const mismatch = new WalletError('Test', { 
        code: 'MINT_MISMATCH',
        mintUrl: 'https://expected.mint.com',
      });

      expect(WalletError.isMintMismatch(mismatch)).toBe(true);
    });
  });

  describe('userMessage', () => {
    it('should format mint unreachable message', () => {
      const error = new WalletError('Test', { code: 'MINT_UNREACHABLE' });
      expect(error.userMessage).toBe('Cannot connect to the mint. Check your internet connection.');
    });

    it('should format load failed message', () => {
      const error = new WalletError('Test', { code: 'LOAD_FAILED' });
      expect(error.userMessage).toBe('Failed to load wallet data.');
    });

    it('should format save failed message', () => {
      const error = new WalletError('Test', { code: 'SAVE_FAILED' });
      expect(error.userMessage).toBe('Failed to save wallet data.');
    });

    it('should format invalid token message', () => {
      const error = new WalletError('Test', { code: 'INVALID_TOKEN' });
      expect(error.userMessage).toBe('The token is invalid or corrupted.');
    });

    it('should format mint mismatch message with mint URL', () => {
      const error = new WalletError('Test', { 
        code: 'MINT_MISMATCH',
        mintUrl: 'https://expected.mint.com',
      });
      expect(error.userMessage).toBe('Token is for a different mint (expected https://expected.mint.com)');
    });

    it('should format mint mismatch message without mint URL', () => {
      const error = new WalletError('Test', { code: 'MINT_MISMATCH' });
      expect(error.userMessage).toBe('Token is for a different mint.');
    });

    it('should format receive failed message', () => {
      const error = new WalletError('Test', { code: 'RECEIVE_FAILED' });
      expect(error.userMessage).toBe('Failed to receive token.');
    });
  });

  describe('recoverySuggestion', () => {
    it('should provide suggestion for mint unreachable', () => {
      const error = new WalletError('Test', { code: 'MINT_UNREACHABLE' });
      expect(error.recoverySuggestion).toBe('Wait a moment and try again, or check if the mint is online.');
    });

    it('should provide suggestion for load failed', () => {
      const error = new WalletError('Test', { code: 'LOAD_FAILED' });
      expect(error.recoverySuggestion).toBe('Try reloading the page. If the problem persists, clear wallet data.');
    });

    it('should provide suggestion for invalid token', () => {
      const error = new WalletError('Test', { code: 'INVALID_TOKEN' });
      expect(error.recoverySuggestion).toBe('Request a new token from the sender.');
    });
  });

  describe('isRecoverable', () => {
    it('should return true for recoverable errors', () => {
      const unreachable = new WalletError('Test', { code: 'MINT_UNREACHABLE' });
      const mismatch = new WalletError('Test', { code: 'MINT_MISMATCH' });

      expect(unreachable.isRecoverable).toBe(true);
      expect(mismatch.isRecoverable).toBe(true);
    });

    it('should return false for non-recoverable errors', () => {
      const loadFailed = new WalletError('Test', { code: 'LOAD_FAILED' });
      const invalid = new WalletError('Test', { code: 'INVALID_TOKEN' });

      expect(loadFailed.isRecoverable).toBe(false);
      expect(invalid.isRecoverable).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const error = new WalletError('Test message', {
        code: 'MINT_MISMATCH',
        mintUrl: 'https://mint.example.com',
        details: { tokenMint: 'https://other.mint.com' },
      });
      const json = error.toJSON();

      expect(json.name).toBe('WalletError');
      expect(json.code).toBe('MINT_MISMATCH');
      expect(json.message).toBe('Test message');
      expect(json.mintUrl).toBe('https://mint.example.com');
      expect(json.details).toEqual({ tokenMint: 'https://other.mint.com' });
    });
  });
});

describe('generateTokenCreationSuggestion', () => {
  it('should generate suggestion for empty wallet', () => {
    const suggestion = generateTokenCreationSuggestion('INSUFFICIENT_BALANCE', {
      requestedAmount: 10,
      availableBalance: 0,
      availableDenominations: [],
    });

    expect(suggestion).toBe('Wallet is empty. Add at least 10 credits to continue.');
  });

  it('should generate suggestion for partial balance', () => {
    const suggestion = generateTokenCreationSuggestion('INSUFFICIENT_BALANCE', {
      requestedAmount: 10,
      availableBalance: 7,
      availableDenominations: [1, 2, 4],
    });

    expect(suggestion).toBe('Add 3 more credits to your wallet.');
  });

  it('should generate singular suggestion for 1 credit', () => {
    const suggestion = generateTokenCreationSuggestion('INSUFFICIENT_BALANCE', {
      requestedAmount: 10,
      availableBalance: 9,
      availableDenominations: [1, 8],
    });

    expect(suggestion).toBe('Add 1 more credit to your wallet.');
  });

  it('should handle large denomination only case', () => {
    const suggestion = generateTokenCreationSuggestion('SELECTION_FAILED', {
      requestedAmount: 5,
      availableBalance: 20,
      availableDenominations: [20],
    });

    expect(suggestion).toBe('Only have 20-credit proofs. A swap will break these into smaller denominations.');
  });

  it('should handle amount smaller than smallest denomination', () => {
    const suggestion = generateTokenCreationSuggestion('SELECTION_FAILED', {
      requestedAmount: 3,
      availableBalance: 20,
      availableDenominations: [5, 10],
    });

    expect(suggestion).toBe('Smallest available denomination is 5. Try requesting at least 5 credits.');
  });

  it('should provide generic suggestion for selection failed', () => {
    const suggestion = generateTokenCreationSuggestion('SELECTION_FAILED', {
      requestedAmount: 7,
      availableBalance: 20,
      availableDenominations: [1, 5, 10],
    });

    expect(suggestion).toBe('Try a different amount or consolidate your proofs.');
  });
});

describe('Utility functions', () => {
  describe('isWalletRelatedError', () => {
    it('should return true for TokenCreationError', () => {
      const context = buildTokenErrorContext('INVALID_AMOUNT', -1, []);
      const error = new TokenCreationError('Invalid', context);
      expect(isWalletRelatedError(error)).toBe(true);
    });

    it('should return true for WalletError', () => {
      const error = new WalletError('Test', { code: 'LOAD_FAILED' });
      expect(isWalletRelatedError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      expect(isWalletRelatedError(new Error('test'))).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isWalletRelatedError(null)).toBe(false);
      expect(isWalletRelatedError('string')).toBe(false);
      expect(isWalletRelatedError(123)).toBe(false);
    });
  });

  describe('getUserMessage', () => {
    it('should get message from TokenCreationError', () => {
      const context = buildTokenErrorContext('INVALID_AMOUNT', -1, []);
      const error = new TokenCreationError('Test', context);
      expect(getUserMessage(error)).toBe('Amount must be a positive number');
    });

    it('should get message from WalletError', () => {
      const error = new WalletError('Test', { code: 'LOAD_FAILED' });
      expect(getUserMessage(error)).toBe('Failed to load wallet data.');
    });

    it('should get message from regular Error', () => {
      expect(getUserMessage(new Error('Custom error'))).toBe('Custom error');
    });

    it('should return fallback for non-errors', () => {
      expect(getUserMessage(null)).toBe('An unknown error occurred');
      expect(getUserMessage('string')).toBe('An unknown error occurred');
    });
  });

  describe('getRecoverySuggestion', () => {
    it('should get suggestion from TokenCreationError', () => {
      const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 10, []);
      const error = new TokenCreationError('Test', context);
      expect(getRecoverySuggestion(error)).toBeDefined();
      expect(getRecoverySuggestion(error)).toContain('10 credits');
    });

    it('should get suggestion from WalletError', () => {
      const error = new WalletError('Test', { code: 'MINT_UNREACHABLE' });
      expect(getRecoverySuggestion(error)).toBe('Wait a moment and try again, or check if the mint is online.');
    });

    it('should return undefined for regular Error', () => {
      expect(getRecoverySuggestion(new Error('test'))).toBeUndefined();
    });
  });
});

describe('buildTokenErrorContext', () => {
  it('should build context from proofs', () => {
    const proofs = createMockProofs([1, 1, 2, 4, 8]); // 16 total
    const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 20, proofs);

    expect(context.code).toBe('INSUFFICIENT_BALANCE');
    expect(context.requestedAmount).toBe(20);
    expect(context.availableBalance).toBe(16);
    expect(context.availableDenominations).toEqual([1, 2, 4, 8]);
    expect(context.denominationCounts).toEqual({ 1: 2, 2: 1, 4: 1, 8: 1 });
    expect(context.suggestion).toBeDefined();
  });

  it('should handle empty proofs', () => {
    const context = buildTokenErrorContext('INSUFFICIENT_BALANCE', 10, []);

    expect(context.availableBalance).toBe(0);
    expect(context.availableDenominations).toEqual([]);
    expect(context.denominationCounts).toEqual({});
  });

  it('should include selected proofs when provided', () => {
    const proofs = createMockProofs([5, 5, 10]);
    const selected = [proofs[0], proofs[1]];
    const context = buildTokenErrorContext('SWAP_FAILED', 8, proofs, selected);

    expect(context.selectedProofs).toEqual(selected);
    expect(context.selectedTotal).toBe(10);
  });
});
