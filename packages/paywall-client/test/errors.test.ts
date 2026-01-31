/**
 * Error utility tests
 */

import { describe, it, expect } from 'vitest';
import { PaywallError, NetworkError, TimeoutError } from '../src/errors.js';

describe('PaywallError', () => {
  describe('userMessage', () => {
    it('should return friendly message for PAYMENT_REQUIRED with amount', () => {
      const error = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: 'Payment required',
        details: { required: 5 },
      });
      expect(error.userMessage).toBe('This track costs 5 credits');
    });

    it('should handle singular credit', () => {
      const error = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: 'Payment required',
        details: { required: 1 },
      });
      expect(error.userMessage).toBe('This track costs 1 credit');
    });

    it('should return friendly message for INSUFFICIENT_PAYMENT', () => {
      const error = new PaywallError({
        code: 'INSUFFICIENT_PAYMENT',
        message: 'Not enough',
        details: { required: 10, provided: 7 },
      });
      expect(error.userMessage).toBe('Need 3 more credits (sent 7, costs 10)');
    });

    it('should return friendly message for TOKEN_ALREADY_SPENT', () => {
      const error = new PaywallError({
        code: 'TOKEN_ALREADY_SPENT',
        message: 'Spent',
        details: {},
      });
      expect(error.userMessage).toBe('This token has already been used');
    });

    it('should return friendly message for KEYSET_MISMATCH with mint', () => {
      const error = new PaywallError({
        code: 'KEYSET_MISMATCH',
        message: 'Wrong mint',
        details: { mintUrl: 'https://mint.wavlake.com' },
      });
      expect(error.userMessage).toBe('Tokens must be from https://mint.wavlake.com');
    });

    it('should return friendly message for RATE_LIMITED', () => {
      const error = new PaywallError({
        code: 'RATE_LIMITED',
        message: 'Too fast',
        details: {},
      });
      expect(error.userMessage).toBe('Too many requests. Please wait a moment.');
    });
  });

  describe('recoverySuggestion', () => {
    it('should suggest adding credits for payment errors', () => {
      const error = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: '',
        details: {},
      });
      expect(error.recoverySuggestion).toBe('Add more credits to your wallet');
    });

    it('should suggest new token for spent tokens', () => {
      const error = new PaywallError({
        code: 'TOKEN_ALREADY_SPENT',
        message: '',
        details: {},
      });
      expect(error.recoverySuggestion).toBe('Create a new token from your wallet');
    });

    it('should suggest waiting for rate limit', () => {
      const error = new PaywallError({
        code: 'RATE_LIMITED',
        message: '',
        details: {},
      });
      expect(error.recoverySuggestion).toBe('Wait a few seconds and try again');
    });

    it('should return undefined for non-recoverable errors', () => {
      const error = new PaywallError({
        code: 'CONTENT_NOT_FOUND',
        message: '',
        details: {},
      });
      expect(error.recoverySuggestion).toBeUndefined();
    });
  });

  describe('isRecoverable', () => {
    it('should return true for payment errors', () => {
      const error = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: '',
        details: {},
      });
      expect(error.isRecoverable).toBe(true);
    });

    it('should return true for rate limiting', () => {
      const error = new PaywallError({
        code: 'RATE_LIMITED',
        message: '',
        details: {},
      });
      expect(error.isRecoverable).toBe(true);
    });

    it('should return false for content not found', () => {
      const error = new PaywallError({
        code: 'CONTENT_NOT_FOUND',
        message: '',
        details: {},
      });
      expect(error.isRecoverable).toBe(false);
    });

    it('should return false for invalid token', () => {
      const error = new PaywallError({
        code: 'INVALID_TOKEN',
        message: '',
        details: {},
      });
      expect(error.isRecoverable).toBe(false);
    });
  });

  describe('type guards', () => {
    it('isPaywallError should identify PaywallError', () => {
      const error = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: '',
        details: {},
      });
      expect(PaywallError.isPaywallError(error)).toBe(true);
      expect(PaywallError.isPaywallError(new Error())).toBe(false);
    });

    it('isPaymentRequired should identify 402 errors', () => {
      const error = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: '',
        details: {},
      });
      expect(PaywallError.isPaymentRequired(error)).toBe(true);

      const other = new PaywallError({
        code: 'RATE_LIMITED',
        message: '',
        details: {},
      });
      expect(PaywallError.isPaymentRequired(other)).toBe(false);
    });

    it('isTokenSpent should identify spent tokens', () => {
      const error = new PaywallError({
        code: 'TOKEN_ALREADY_SPENT',
        message: '',
        details: {},
      });
      expect(PaywallError.isTokenSpent(error)).toBe(true);
    });

    it('isKeysetMismatch should identify wrong mint', () => {
      const error = new PaywallError({
        code: 'KEYSET_MISMATCH',
        message: '',
        details: {},
      });
      expect(PaywallError.isKeysetMismatch(error)).toBe(true);
    });
  });
});

describe('NetworkError', () => {
  it('should store cause', () => {
    const cause = new Error('Socket closed');
    const error = new NetworkError('Connection failed', cause);
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Connection failed');
  });

  it('should work without cause', () => {
    const error = new NetworkError('No network');
    expect(error.cause).toBeUndefined();
  });

  it('isNetworkError type guard should work', () => {
    const error = new NetworkError('Failed');
    expect(NetworkError.isNetworkError(error)).toBe(true);
    expect(NetworkError.isNetworkError(new Error())).toBe(false);
  });
});

describe('TimeoutError', () => {
  it('should include timeout in message', () => {
    const error = new TimeoutError(5000);
    expect(error.message).toContain('5000ms');
    expect(error.timeoutMs).toBe(5000);
  });

  it('isTimeoutError type guard should work', () => {
    const error = new TimeoutError(1000);
    expect(TimeoutError.isTimeoutError(error)).toBe(true);
    expect(TimeoutError.isTimeoutError(new Error())).toBe(false);
  });
});
