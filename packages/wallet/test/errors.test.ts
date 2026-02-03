/**
 * TokenCreationError tests
 */

import { describe, it, expect } from 'vitest';
import { TokenCreationError, generateSuggestion } from '../src/errors.js';

describe('TokenCreationError', () => {
  describe('constructor', () => {
    it('should create error with all fields', () => {
      const error = new TokenCreationError('Test error', {
        code: 'INSUFFICIENT_BALANCE',
        requestedAmount: 100,
        availableBalance: 50,
        availableDenominations: [1, 2, 4, 8],
        denominationCounts: { 1: 2, 2: 3, 4: 1, 8: 1 },
        suggestion: 'Add more credits',
      });

      expect(error.name).toBe('TokenCreationError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('INSUFFICIENT_BALANCE');
      expect(error.requestedAmount).toBe(100);
      expect(error.availableBalance).toBe(50);
      expect(error.availableDenominations).toEqual([1, 2, 4, 8]);
      expect(error.denominationCounts).toEqual({ 1: 2, 2: 3, 4: 1, 8: 1 });
      expect(error.suggestion).toBe('Add more credits');
    });

    it('should handle optional fields', () => {
      const error = new TokenCreationError('Test', {
        code: 'INVALID_AMOUNT',
        requestedAmount: -5,
        availableBalance: 100,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(error.selectedProofs).toBeUndefined();
      expect(error.selectedTotal).toBeUndefined();
      expect(error.suggestion).toBeUndefined();
    });
  });

  describe('userMessage', () => {
    it('should format INSUFFICIENT_BALANCE message', () => {
      const error = new TokenCreationError('', {
        code: 'INSUFFICIENT_BALANCE',
        requestedAmount: 100,
        availableBalance: 30,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(error.userMessage).toBe('Need 70 more credits (have 30, need 100)');
    });

    it('should handle singular credit', () => {
      const error = new TokenCreationError('', {
        code: 'INSUFFICIENT_BALANCE',
        requestedAmount: 51,
        availableBalance: 50,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(error.userMessage).toBe('Need 1 more credit (have 50, need 51)');
    });

    it('should format SELECTION_FAILED message', () => {
      const error = new TokenCreationError('', {
        code: 'SELECTION_FAILED',
        requestedAmount: 3,
        availableBalance: 10,
        availableDenominations: [4, 8],
        denominationCounts: { 4: 1, 8: 1 },
      });

      expect(error.userMessage).toContain('Cannot create exact amount');
    });

    it('should format INVALID_AMOUNT message', () => {
      const error = new TokenCreationError('', {
        code: 'INVALID_AMOUNT',
        requestedAmount: -1,
        availableBalance: 10,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(error.userMessage).toBe('Amount must be a positive number');
    });

    it('should format WALLET_NOT_LOADED message', () => {
      const error = new TokenCreationError('', {
        code: 'WALLET_NOT_LOADED',
        requestedAmount: 5,
        availableBalance: 0,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(error.userMessage).toBe('Wallet must be loaded before creating tokens');
    });

    it('should format SWAP_FAILED message', () => {
      const error = new TokenCreationError('', {
        code: 'SWAP_FAILED',
        requestedAmount: 5,
        availableBalance: 10,
        availableDenominations: [8],
        denominationCounts: { 8: 1 },
      });

      expect(error.userMessage).toBe('Failed to swap proofs for exact amount');
    });
  });

  describe('shortfall', () => {
    it('should calculate shortfall correctly', () => {
      const error = new TokenCreationError('', {
        code: 'INSUFFICIENT_BALANCE',
        requestedAmount: 100,
        availableBalance: 30,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(error.shortfall).toBe(70);
    });

    it('should return 0 when balance is sufficient', () => {
      const error = new TokenCreationError('', {
        code: 'SELECTION_FAILED',
        requestedAmount: 5,
        availableBalance: 10,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(error.shortfall).toBe(0);
    });
  });

  describe('toJSON', () => {
    it('should serialize all relevant fields', () => {
      const error = new TokenCreationError('Test error', {
        code: 'INSUFFICIENT_BALANCE',
        requestedAmount: 100,
        availableBalance: 50,
        availableDenominations: [1, 2, 4],
        denominationCounts: { 1: 10, 2: 5, 4: 2 },
        suggestion: 'Add credits',
      });

      const json = error.toJSON();

      expect(json.name).toBe('TokenCreationError');
      expect(json.code).toBe('INSUFFICIENT_BALANCE');
      expect(json.message).toBe('Test error');
      expect(json.requestedAmount).toBe(100);
      expect(json.availableBalance).toBe(50);
      expect(json.availableDenominations).toEqual([1, 2, 4]);
      expect(json.denominationCounts).toEqual({ 1: 10, 2: 5, 4: 2 });
      expect(json.suggestion).toBe('Add credits');
      expect(json.shortfall).toBe(50);
    });
  });

  describe('type guards', () => {
    it('isTokenCreationError should identify TokenCreationError', () => {
      const error = new TokenCreationError('Test', {
        code: 'INVALID_AMOUNT',
        requestedAmount: -1,
        availableBalance: 0,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(TokenCreationError.isTokenCreationError(error)).toBe(true);
    });

    it('isTokenCreationError should reject other errors', () => {
      expect(TokenCreationError.isTokenCreationError(new Error('Regular'))).toBe(false);
      expect(TokenCreationError.isTokenCreationError(null)).toBe(false);
      expect(TokenCreationError.isTokenCreationError(undefined)).toBe(false);
      expect(TokenCreationError.isTokenCreationError('string')).toBe(false);
    });

    it('isInsufficientBalance should identify correct code', () => {
      const insufficientError = new TokenCreationError('', {
        code: 'INSUFFICIENT_BALANCE',
        requestedAmount: 100,
        availableBalance: 10,
        availableDenominations: [],
        denominationCounts: {},
      });

      const otherError = new TokenCreationError('', {
        code: 'SELECTION_FAILED',
        requestedAmount: 5,
        availableBalance: 10,
        availableDenominations: [],
        denominationCounts: {},
      });

      expect(TokenCreationError.isInsufficientBalance(insufficientError)).toBe(true);
      expect(TokenCreationError.isInsufficientBalance(otherError)).toBe(false);
    });
  });
});

describe('generateSuggestion', () => {
  it('should generate INSUFFICIENT_BALANCE suggestion', () => {
    const suggestion = generateSuggestion('INSUFFICIENT_BALANCE', {
      requestedAmount: 100,
      availableBalance: 30,
      availableDenominations: [1, 2, 4],
    });

    expect(suggestion).toContain('70'); // 100 - 30
    expect(suggestion).toContain('credit');
  });

  it('should suggest wallet is empty', () => {
    const suggestion = generateSuggestion('INSUFFICIENT_BALANCE', {
      requestedAmount: 10,
      availableBalance: 0,
      availableDenominations: [],
    });

    expect(suggestion).toContain('empty');
    expect(suggestion).toContain('10'); // minimum needed
  });

  it('should generate SELECTION_FAILED suggestion for small amount', () => {
    const suggestion = generateSuggestion('SELECTION_FAILED', {
      requestedAmount: 2,
      availableBalance: 8,
      availableDenominations: [4, 8],
    });

    expect(suggestion).toContain('4'); // minimum denomination
  });

  it('should generate SELECTION_FAILED suggestion for single large proof', () => {
    const suggestion = generateSuggestion('SELECTION_FAILED', {
      requestedAmount: 3,
      availableBalance: 8,
      availableDenominations: [8],
    });

    expect(suggestion).toContain('8'); // denomination
    expect(suggestion).toContain('swap'); // mentions swap as recovery
  });

  it('should generate INVALID_AMOUNT suggestion', () => {
    const suggestion = generateSuggestion('INVALID_AMOUNT', {
      requestedAmount: -5,
      availableBalance: 10,
      availableDenominations: [],
    });

    expect(suggestion).toContain('positive');
  });

  it('should generate WALLET_NOT_LOADED suggestion', () => {
    const suggestion = generateSuggestion('WALLET_NOT_LOADED', {
      requestedAmount: 5,
      availableBalance: 0,
      availableDenominations: [],
    });

    expect(suggestion).toContain('load');
  });

  it('should return undefined for unknown codes', () => {
    const suggestion = generateSuggestion('UNKNOWN' as any, {
      requestedAmount: 5,
      availableBalance: 10,
      availableDenominations: [],
    });

    expect(suggestion).toBeUndefined();
  });
});
