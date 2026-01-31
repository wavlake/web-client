/**
 * Token Inspection Utility tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cashu-ts getDecodedToken
vi.mock('@cashu/cashu-ts', async () => {
  const actual = await vi.importActual('@cashu/cashu-ts');
  return {
    ...actual,
    getDecodedToken: vi.fn().mockImplementation((token: string) => {
      // Simulate different token types
      if (token === 'cashuBvalidtoken') {
        return {
          mint: 'https://mint.wavlake.com',
          proofs: [
            { C: 'c1', amount: 1, id: 'keyset1', secret: 's1' },
            { C: 'c2', amount: 2, id: 'keyset1', secret: 's2' },
            { C: 'c5', amount: 5, id: 'keyset1', secret: 's5' },
          ],
          unit: 'usd',
          memo: 'Test token',
        };
      }
      if (token === 'cashuAoldtoken') {
        return {
          mint: 'https://old.mint.com',
          proofs: [
            { C: 'c10', amount: 10, id: 'keyset2', secret: 's10' },
          ],
        };
      }
      if (token === 'cashuBnomint') {
        return {
          mint: '',
          proofs: [
            { C: 'c1', amount: 1, id: 'keyset1', secret: 's1' },
          ],
        };
      }
      if (token === 'cashuBemptyproofs') {
        return {
          mint: 'https://mint.com',
          proofs: [],
        };
      }
      if (token === 'cashuBmalformed') {
        throw new Error('Invalid token data');
      }
      // Default case
      return {
        mint: 'https://default.mint.com',
        proofs: [{ C: 'c1', amount: 1, id: 'keyset1', secret: 's1' }],
      };
    }),
  };
});

// Import after mock
import {
  inspectToken,
  validateToken,
  getTokenAmount,
  getTokenMint,
  getTokenProofs,
  isTokenFormat,
  summarizeToken,
  TokenParseError,
} from '../src/token.js';

describe('Token Inspection Utilities', () => {
  describe('inspectToken', () => {
    it('should decode a valid cashuB token', () => {
      const info = inspectToken('cashuBvalidtoken');

      expect(info.version).toBe(4);
      expect(info.mint).toBe('https://mint.wavlake.com');
      expect(info.amount).toBe(8); // 1 + 2 + 5
      expect(info.proofCount).toBe(3);
      expect(info.proofAmounts).toEqual([1, 2, 5]);
      expect(info.unit).toBe('usd');
      expect(info.memo).toBe('Test token');
      expect(info.proofs).toHaveLength(3);
      expect(info.encoded).toBe('cashuBvalidtoken');
    });

    it('should decode a valid cashuA token', () => {
      const info = inspectToken('cashuAoldtoken');

      expect(info.version).toBe(3);
      expect(info.mint).toBe('https://old.mint.com');
      expect(info.amount).toBe(10);
      expect(info.proofCount).toBe(1);
    });

    it('should throw TokenParseError for empty string', () => {
      expect(() => inspectToken('')).toThrow(TokenParseError);
      expect(() => inspectToken('')).toThrow('non-empty string');
    });

    it('should throw TokenParseError for invalid prefix', () => {
      expect(() => inspectToken('invalidtoken')).toThrow(TokenParseError);
      expect(() => inspectToken('invalidtoken')).toThrow('must start with cashuA or cashuB');
    });

    it('should throw TokenParseError for malformed token', () => {
      expect(() => inspectToken('cashuBmalformed')).toThrow(TokenParseError);
      expect(() => inspectToken('cashuBmalformed')).toThrow('Failed to decode');
    });

    it('should throw TokenParseError for token with no proofs', () => {
      expect(() => inspectToken('cashuBemptyproofs')).toThrow(TokenParseError);
      expect(() => inspectToken('cashuBemptyproofs')).toThrow('contains no proofs');
    });

    it('should handle null/undefined gracefully', () => {
      // @ts-expect-error - testing runtime behavior
      expect(() => inspectToken(null)).toThrow(TokenParseError);
      // @ts-expect-error - testing runtime behavior
      expect(() => inspectToken(undefined)).toThrow(TokenParseError);
    });
  });

  describe('validateToken', () => {
    it('should return valid for a well-formed token', () => {
      const result = validateToken('cashuBvalidtoken');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.info).toBeDefined();
      expect(result.info?.amount).toBe(8);
    });

    it('should fail when mint does not match', () => {
      const result = validateToken('cashuBvalidtoken', {
        expectedMint: 'https://different.mint.com',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('wrong mint'))).toBe(true);
    });

    it('should pass when mint matches (with trailing slash normalization)', () => {
      const result = validateToken('cashuBvalidtoken', {
        expectedMint: 'https://mint.wavlake.com/',
      });

      expect(result.valid).toBe(true);
    });

    it('should fail when unit does not match', () => {
      const result = validateToken('cashuBvalidtoken', {
        expectedUnit: 'sat',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('wrong unit'))).toBe(true);
    });

    it('should warn when unit is missing but expected', () => {
      const result = validateToken('cashuAoldtoken', {
        expectedUnit: 'usd',
      });

      // Not an error, just a warning
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('does not specify unit'))).toBe(true);
    });

    it('should fail when amount is below minimum', () => {
      const result = validateToken('cashuBvalidtoken', {
        minAmount: 10,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('amount too low'))).toBe(true);
    });

    it('should fail when amount is above maximum', () => {
      const result = validateToken('cashuBvalidtoken', {
        maxAmount: 5,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('amount too high'))).toBe(true);
    });

    it('should fail when amount does not match exact', () => {
      const result = validateToken('cashuBvalidtoken', {
        exactAmount: 10,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('amount mismatch'))).toBe(true);
    });

    it('should pass when amount matches exact', () => {
      const result = validateToken('cashuBvalidtoken', {
        exactAmount: 8,
      });

      expect(result.valid).toBe(true);
    });

    it('should warn when mint URL is missing', () => {
      const result = validateToken('cashuBnomint');

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('does not specify a mint'))).toBe(true);
    });

    it('should return multiple errors for multiple failures', () => {
      const result = validateToken('cashuBvalidtoken', {
        expectedMint: 'https://wrong.mint.com',
        minAmount: 100,
        expectedUnit: 'sat',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should return error for malformed token', () => {
      const result = validateToken('notavalidtoken');

      expect(result.valid).toBe(false);
      expect(result.info).toBeUndefined();
      expect(result.errors.some(e => e.includes('Invalid token format'))).toBe(true);
    });
  });

  describe('getTokenAmount', () => {
    it('should return total amount', () => {
      expect(getTokenAmount('cashuBvalidtoken')).toBe(8);
    });

    it('should throw for invalid token', () => {
      expect(() => getTokenAmount('invalid')).toThrow(TokenParseError);
    });
  });

  describe('getTokenMint', () => {
    it('should return mint URL', () => {
      expect(getTokenMint('cashuBvalidtoken')).toBe('https://mint.wavlake.com');
    });

    it('should throw for invalid token', () => {
      expect(() => getTokenMint('invalid')).toThrow(TokenParseError);
    });
  });

  describe('getTokenProofs', () => {
    it('should return proofs array', () => {
      const proofs = getTokenProofs('cashuBvalidtoken');

      expect(proofs).toHaveLength(3);
      expect(proofs[0]).toHaveProperty('C');
      expect(proofs[0]).toHaveProperty('amount');
    });

    it('should throw for invalid token', () => {
      expect(() => getTokenProofs('invalid')).toThrow(TokenParseError);
    });
  });

  describe('isTokenFormat', () => {
    it('should return true for cashuA tokens', () => {
      expect(isTokenFormat('cashuAabcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('should return true for cashuB tokens', () => {
      expect(isTokenFormat('cashuBabcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('should return false for short strings', () => {
      expect(isTokenFormat('cashuB')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isTokenFormat(123)).toBe(false);
      expect(isTokenFormat(null)).toBe(false);
      expect(isTokenFormat(undefined)).toBe(false);
      expect(isTokenFormat({})).toBe(false);
    });

    it('should return false for wrong prefix', () => {
      expect(isTokenFormat('randomstring')).toBe(false);
      expect(isTokenFormat('cashuC123456789012345678901234567890')).toBe(false);
    });
  });

  describe('summarizeToken', () => {
    it('should produce readable summary for valid token', () => {
      const summary = summarizeToken('cashuBvalidtoken');

      expect(summary).toContain('cashuB');
      expect(summary).toContain('8');
      expect(summary).toContain('usd');
      expect(summary).toContain('3 proofs');
      expect(summary).toContain('mint.wavlake.com');
    });

    it('should handle token without unit', () => {
      const summary = summarizeToken('cashuAoldtoken');

      expect(summary).toContain('cashuA');
      expect(summary).toContain('10');
      expect(summary).toContain('credits'); // default
      expect(summary).toContain('1 proof'); // singular
    });

    it('should return error message for invalid token', () => {
      const summary = summarizeToken('invalid');

      expect(summary).toContain('Invalid token');
    });
  });

  describe('TokenParseError', () => {
    it('should truncate token in error', () => {
      const error = new TokenParseError('Test error', 'cashuBveryverylongtokenstring');

      expect(error.token).toContain('...');
      expect(error.token.length).toBeLessThan(30);
    });

    it('should include cause if provided', () => {
      const cause = new Error('Original error');
      const error = new TokenParseError('Test error', 'token', cause);

      expect(error.cause).toBe(cause);
    });

    it('should have correct name', () => {
      const error = new TokenParseError('Test', 'token');
      expect(error.name).toBe('TokenParseError');
    });
  });
});
