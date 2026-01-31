/**
 * Token utilities tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateToken,
  parseToken,
  looksLikeToken,
  getTokenMint,
  getTokenAmount,
} from '../src/token.js';

// Mock cashu-ts
vi.mock('@cashu/cashu-ts', () => ({
  getDecodedToken: vi.fn().mockImplementation((token: string) => {
    if (token.includes('invalid')) {
      throw new Error('Invalid token format');
    }
    if (token.includes('empty')) {
      return { mint: 'https://mint.test.com', proofs: [] };
    }
    // Default valid token response
    return {
      mint: 'https://mint.wavlake.com',
      unit: 'usd',
      proofs: [
        { C: 'c1', amount: 1, id: 'keyset1', secret: 's1' },
        { C: 'c2', amount: 4, id: 'keyset1', secret: 's2' },
      ],
      memo: 'test memo',
    };
  }),
}));

describe('token utilities', () => {
  describe('looksLikeToken', () => {
    it('should return true for cashuA tokens', () => {
      expect(looksLikeToken('cashuAexample...')).toBe(true);
    });

    it('should return true for cashuB tokens', () => {
      expect(looksLikeToken('cashuBexample...')).toBe(true);
    });

    it('should handle whitespace', () => {
      expect(looksLikeToken('  cashuBtoken  ')).toBe(true);
    });

    it('should return false for invalid strings', () => {
      expect(looksLikeToken('random string')).toBe(false);
      expect(looksLikeToken('cashu')).toBe(false);
      expect(looksLikeToken('CASHUB...')).toBe(false);
      expect(looksLikeToken('')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(looksLikeToken(null as any)).toBe(false);
      expect(looksLikeToken(undefined as any)).toBe(false);
      expect(looksLikeToken(123 as any)).toBe(false);
    });
  });

  describe('parseToken', () => {
    it('should parse valid v4 token', () => {
      const info = parseToken('cashuBvalidtoken');
      
      expect(info.version).toBe(4);
      expect(info.mint).toBe('https://mint.wavlake.com');
      expect(info.unit).toBe('usd');
      expect(info.amount).toBe(5); // 1 + 4
      expect(info.proofCount).toBe(2);
      expect(info.memo).toBe('test memo');
    });

    it('should parse valid v3 token', () => {
      const info = parseToken('cashuAvalidtoken');
      
      expect(info.version).toBe(3);
    });

    it('should throw for empty string', () => {
      expect(() => parseToken('')).toThrow();
    });

    it('should throw for invalid format', () => {
      expect(() => parseToken('notavalidtoken')).toThrow();
    });

    it('should throw for decode errors', () => {
      expect(() => parseToken('cashuBinvaliddata')).toThrow();
    });
  });

  describe('validateToken', () => {
    it('should return valid result for good token', () => {
      const result = validateToken('cashuBvalidtoken');
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.info).toBeDefined();
      expect(result.info?.amount).toBe(5);
    });

    it('should return invalid result for bad token', () => {
      const result = validateToken('cashuBinvalid');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.info).toBeUndefined();
    });

    it('should return invalid for empty string', () => {
      const result = validateToken('');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty');
    });

    it('should return invalid for wrong prefix', () => {
      const result = validateToken('bitcoin:abc123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cashuA or cashuB');
    });
  });

  describe('getTokenMint', () => {
    it('should return mint URL for valid token', () => {
      expect(getTokenMint('cashuBvalidtoken')).toBe('https://mint.wavlake.com');
    });

    it('should return null for invalid token', () => {
      expect(getTokenMint('cashuBinvalid')).toBeNull();
      expect(getTokenMint('')).toBeNull();
    });
  });

  describe('getTokenAmount', () => {
    it('should return amount for valid token', () => {
      expect(getTokenAmount('cashuBvalidtoken')).toBe(5);
    });

    it('should return null for invalid token', () => {
      expect(getTokenAmount('cashuBinvalid')).toBeNull();
      expect(getTokenAmount('')).toBeNull();
    });
  });
});
