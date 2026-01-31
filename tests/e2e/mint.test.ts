/**
 * Phase 1: Mint Operations Tests
 * 
 * Verify we can interact with Nutshell staging mint:
 * - Get mint info
 * - Create mint quotes
 * - Mint tokens (requires external invoice payment)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from './config';
import { getMint, getMintInfo, getWallet, createMintQuote, checkMintQuote, encodeToken } from './helpers/mint';

describe('Phase 1: Mint Operations', () => {
  describe('Mint Info', () => {
    it('should fetch mint info', async () => {
      const info = await getMintInfo();
      
      expect(info).toBeDefined();
      expect(info.name).toBeDefined();
      console.log('Mint name:', info.name);
      console.log('Mint version:', info.version);
    });

    it('should have active keysets', async () => {
      const mint = getMint();
      const keysets = await mint.getKeySets();
      
      expect(keysets.keysets.length).toBeGreaterThan(0);
      
      const activeKeyset = keysets.keysets.find(k => k.active);
      expect(activeKeyset).toBeDefined();
      
      console.log('Active keyset:', activeKeyset?.id);
      console.log('Unit:', activeKeyset?.unit);
    });
  });

  describe('Wallet Initialization', () => {
    it('should create wallet with active keyset', async () => {
      const wallet = await getWallet();
      
      expect(wallet).toBeDefined();
      expect(wallet.mint.mintUrl).toBe(config.mintUrl);
    });
  });

  describe('Mint Quote', () => {
    it('should create a mint quote for 10 sats', async () => {
      const quote = await createMintQuote(10);
      
      expect(quote.id).toBeDefined();
      expect(quote.invoice).toBeDefined();
      expect(quote.invoice.startsWith('lnbc') || quote.invoice.startsWith('lntb')).toBe(true);
      expect(quote.amount).toBe(10);
      
      console.log('Quote ID:', quote.id);
      console.log('Invoice (first 50 chars):', quote.invoice.slice(0, 50) + '...');
    });

    it('should check quote status (unpaid)', async () => {
      const quote = await createMintQuote(5);
      const status = await checkMintQuote(quote.id);
      
      expect(status.id).toBe(quote.id);
      expect(status.paid).toBe(false);
      expect(['UNPAID', 'PENDING']).toContain(status.state);
    });
  });

  describe('Token Encoding', () => {
    it('should encode proofs as cashuB token', () => {
      // Mock proofs for encoding test
      const mockProofs = [{
        C: '02' + '0'.repeat(64),
        amount: 10,
        id: '00' + '0'.repeat(14),
        secret: '00' + '0'.repeat(62),
      }];
      
      const token = encodeToken(mockProofs as any);
      
      expect(token.startsWith('cashuB')).toBe(true);
      console.log('Encoded token prefix:', token.slice(0, 30) + '...');
    });
  });
});

describe('Phase 1: Integration Test (requires payment)', () => {
  // This test requires actually paying the Lightning invoice
  // Skip in automated runs, enable for manual testing
  it.skip('should mint tokens after invoice payment', async () => {
    const { mintTokensWithPolling } = await import('./helpers/mint');
    
    // This will print an invoice and wait for payment
    const { token, quote } = await mintTokensWithPolling(10, 2000, 120000);
    
    expect(token.startsWith('cashuB')).toBe(true);
    console.log('✅ Minted tokens:', token.slice(0, 50) + '...');
  });
});
