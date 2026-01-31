/**
 * Token utility tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateToken,
  parseToken,
  looksLikeToken,
  getTokenMint,
  getTokenAmount,
} from '../src/token.js';
import { getEncodedTokenV4, type Proof, type Token } from '@cashu/cashu-ts';

// Create a valid test token
function createTestToken(): string {
  // All hex values must be even-length and valid
  const proofs: Proof[] = [{
    C: '02abc123def4567890abcdef1234567890abcdef1234567890abcdef12345678',  // 66 chars (33 bytes)
    amount: 10,
    id: '00ad268c4d1f5826',  // Valid hex keyset ID (16 chars = 8 bytes)
    secret: '0011223344556677889900aabbccddeeff0011223344556677889900aabbccdd',  // 64 chars (32 bytes)
  }];
  
  const token: Token = {
    mint: 'https://test.mint.com',
    proofs,
  };
  
  return getEncodedTokenV4(token);
}

describe('looksLikeToken', () => {
  it('should return true for cashuA prefix', () => {
    expect(looksLikeToken('cashuAabc123')).toBe(true);
  });

  it('should return true for cashuB prefix', () => {
    expect(looksLikeToken('cashuBxyz789')).toBe(true);
  });

  it('should return false for invalid prefixes', () => {
    expect(looksLikeToken('cashu123')).toBe(false);
    expect(looksLikeToken('bitcoin')).toBe(false);
    expect(looksLikeToken('lnbc10')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(looksLikeToken('')).toBe(false);
    expect(looksLikeToken(null as any)).toBe(false);
    expect(looksLikeToken(undefined as any)).toBe(false);
    expect(looksLikeToken(123 as any)).toBe(false);
  });

  it('should handle whitespace', () => {
    expect(looksLikeToken('  cashuBtest  ')).toBe(true);
  });
});

describe('validateToken', () => {
  it('should validate a real V4 token', () => {
    const token = createTestToken();
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.info).toBeDefined();
    expect(result.info?.version).toBe(4);
    expect(result.info?.mint).toBe('https://test.mint.com');
    expect(result.info?.amount).toBe(10);
    expect(result.info?.proofCount).toBe(1);
  });

  it('should reject empty strings', () => {
    const result = validateToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  it('should reject invalid prefixes', () => {
    const result = validateToken('bitcoin:abc123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cashuA or cashuB');
  });

  it('should reject malformed tokens', () => {
    const result = validateToken('cashuBinvaliddata!!!');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('parseToken', () => {
  it('should parse valid token', () => {
    const token = createTestToken();
    const info = parseToken(token);
    expect(info.version).toBe(4);
    expect(info.mint).toBe('https://test.mint.com');
  });

  it('should throw on invalid token', () => {
    expect(() => parseToken('invalid')).toThrow();
  });
});

describe('getTokenMint', () => {
  it('should extract mint from valid token', () => {
    const token = createTestToken();
    const mint = getTokenMint(token);
    expect(mint).toBe('https://test.mint.com');
  });

  it('should return null for invalid token', () => {
    expect(getTokenMint('invalid')).toBeNull();
  });
});

describe('getTokenAmount', () => {
  it('should extract amount from valid token', () => {
    const token = createTestToken();
    const amount = getTokenAmount(token);
    expect(amount).toBe(10);
  });

  it('should return null for invalid token', () => {
    expect(getTokenAmount('invalid')).toBeNull();
  });
});
