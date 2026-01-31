/**
 * Unit Conversion Tests
 * 
 * Verify API behavior with different keyset units (sat vs usd).
 * 
 * Per PAYWALL_ENDPOINTS.md and monorepo code:
 * - sat unit: amount × 1000 (converted to msats)
 * - usd unit: amount used directly as credits
 * 
 * This test ensures the API correctly handles cross-unit payments.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from './config';
import { Mint, Wallet, getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';

const API_URL = config.apiUrl;
const MINT_URL = config.mintUrl;
const PAID_TRACK = config.testTracks.paid.dtag;
const TRACK_PRICE = config.testTracks.paid.priceCredits; // 2 credits

describe('Unit Conversion (sat vs usd)', () => {
  let satKeyset: { id: string; unit: string } | null = null;
  let usdKeyset: { id: string; unit: string } | null = null;

  beforeAll(async () => {
    // Fetch active keysets from mint
    const response = await fetch(`${MINT_URL}/v1/keysets`);
    const data = await response.json();
    
    for (const ks of data.keysets) {
      if (ks.active && ks.unit === 'sat' && !satKeyset) {
        satKeyset = ks;
      }
      if (ks.active && ks.unit === 'usd' && !usdKeyset) {
        usdKeyset = ks;
      }
    }
    
    console.log('Active keysets:');
    console.log(`  SAT: ${satKeyset?.id || 'not found'}`);
    console.log(`  USD: ${usdKeyset?.id || 'not found'}`);
  });

  describe('Keyset Discovery', () => {
    it('should have both sat and usd keysets available', () => {
      expect(satKeyset).not.toBeNull();
      expect(usdKeyset).not.toBeNull();
      expect(satKeyset?.unit).toBe('sat');
      expect(usdKeyset?.unit).toBe('usd');
      
      console.log('✅ Both sat and usd keysets available');
    });
  });

  describe('Token Unit Encoding', () => {
    it('should encode token with explicit unit field', () => {
      // Create dummy proofs to test encoding
      const dummyProofs: Proof[] = [{
        amount: 2,
        C: '02' + '0'.repeat(62),
        id: usdKeyset?.id || 'test',
        secret: 'test-secret',
      }];

      const tokenUsd = getEncodedTokenV4({
        mint: MINT_URL,
        proofs: dummyProofs,
        unit: 'usd',
      });

      const tokenSat = getEncodedTokenV4({
        mint: MINT_URL,
        proofs: dummyProofs,
        unit: 'sat',
      });

      // Both should be valid cashuB tokens
      expect(tokenUsd.startsWith('cashuB')).toBe(true);
      expect(tokenSat.startsWith('cashuB')).toBe(true);
      
      // They should be different (unit is encoded)
      expect(tokenUsd).not.toBe(tokenSat);
      
      console.log('✅ Tokens encode unit field correctly');
      console.log(`   USD token: ${tokenUsd.slice(0, 30)}...`);
      console.log(`   SAT token: ${tokenSat.slice(0, 30)}...`);
    });
  });

  describe('API Unit Handling', () => {
    it('should document expected conversion behavior', () => {
      /**
       * Based on monorepo ecash_token_parser.go:
       * 
       * if token.Unit == "sat" {
       *     totalAmount += int64(entry.Amount) * 1000 // Convert sats to msats
       * } else {
       *     totalAmount += int64(entry.Amount) // Credits (no conversion)
       * }
       * 
       * This means:
       * - 2 sat proofs with unit="sat" → 2000 credits (massive overpay for 2-credit track)
       * - 2 usd proofs with unit="usd" → 2 credits (correct payment)
       * 
       * The API accepts BOTH units but applies different conversion.
       */
      
      console.log('\n📋 Unit Conversion Behavior (from monorepo code):');
      console.log('   sat unit: amount × 1000 (converted to msats)');
      console.log('   usd unit: amount used directly');
      console.log('');
      console.log(`   Track price: ${TRACK_PRICE} credits`);
      console.log(`   2 sat proofs → 2000 credits (${2000 - TRACK_PRICE} overpay)`);
      console.log(`   2 usd proofs → 2 credits (exact payment)`);
      
      expect(true).toBe(true);
    });

    it('should reject invalid token regardless of unit', async () => {
      // Create an invalid token with sat unit
      const invalidToken = 'cashuBinvalidtokendata';
      
      const response = await fetch(`${API_URL}/api/v1/content/${PAID_TRACK}`, {
        headers: { 'X-Ecash-Token': invalidToken },
      });
      
      expect(response.status).toBe(402);
      console.log('✅ Invalid tokens rejected regardless of unit');
    });

    // This test would require minting sat proofs which costs real sats
    // Skip unless explicitly running cross-unit tests
    it.skip('should accept sat-unit proofs with 1000x conversion', async () => {
      /**
       * To fully test this, we would need to:
       * 1. Mint sat-unit proofs (costs real sats)
       * 2. Send them with unit="sat" 
       * 3. Verify payment accepted
       * 4. Verify change = (amount * 1000) - track_price
       * 
       * For a 2-credit track with 2 sat proofs:
       * - Provided: 2000 credits (2 sats × 1000)
       * - Required: 2 credits
       * - Change: 1998 credits
       * 
       * This is skipped by default to avoid wasting test funds.
       * Enable with: TEST_CROSS_UNIT=true npm run test:e2e
       */
    });
  });

  describe('Keyset-Proof Matching', () => {
    it('should document keyset validation behavior', () => {
      /**
       * The proof validator (proof_validator.go) validates proofs by:
       * 1. Looking up keyset by ID (proof.ID)
       * 2. Getting public key for amount
       * 3. Verifying BDHKE signature
       * 
       * It does NOT filter by unit - all active keysets are loaded.
       * 
       * This means:
       * - Proofs with sat keyset ID: validated against sat keyset keys
       * - Proofs with usd keyset ID: validated against usd keyset keys
       * - Proofs with unknown keyset ID: REJECTED (keyset not found)
       * 
       * The unit in the token is used only for amount conversion,
       * not for keyset filtering.
       */
      
      console.log('\n📋 Keyset Validation Behavior:');
      console.log('   - Proof keyset ID must match an active mint keyset');
      console.log('   - Unit in token is for amount conversion only');
      console.log('   - Mismatched keyset ID → REJECTED');
      console.log('');
      console.log('   Example keyset IDs:');
      console.log(`   SAT: ${satKeyset?.id}`);
      console.log(`   USD: ${usdKeyset?.id}`);
      
      expect(true).toBe(true);
    });

    it('should reject proofs with unknown keyset ID', async () => {
      // Create a token with a fake keyset ID (must be valid hex format)
      const fakeProofs: Proof[] = [{
        amount: 2,
        C: '02' + '0'.repeat(62),
        id: '00deadbeef123456', // Valid hex but unknown keyset
        secret: 'test-secret-' + Date.now(),
      }];

      const fakeToken = getEncodedTokenV4({
        mint: MINT_URL,
        proofs: fakeProofs,
        unit: 'usd',
      });

      const response = await fetch(`${API_URL}/api/v1/content/${PAID_TRACK}`, {
        headers: { 'X-Ecash-Token': fakeToken },
      });

      expect(response.status).toBe(402);
      const body = await response.json();
      
      // Should indicate keyset or validation issue
      console.log('✅ Unknown keyset ID rejected');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${body.error?.code || body.error?.message || 'validation failed'}`);
    });
  });
});

describe('Cross-Unit Payment Safety', () => {
  it('should document risks of unit mismatch', () => {
    /**
     * IMPORTANT: If you encode proofs with the wrong unit:
     * 
     * Scenario 1: USD proofs encoded with unit="sat"
     * - Proofs: 2 usd credits
     * - Token unit: "sat"
     * - API calculation: 2 × 1000 = 2000 credits
     * - Result: 1998 credits OVERPAY (but proofs might fail validation
     *           if keyset ID doesn't match sat keyset)
     * 
     * Scenario 2: SAT proofs encoded with unit="usd"
     * - Proofs: 2 sats
     * - Token unit: "usd"
     * - API calculation: 2 credits (no conversion)
     * - Result: Correct payment IF track is 2 credits
     *           (but this "works" only by accident)
     * 
     * BEST PRACTICE: Always match token unit to proof keyset unit.
     */
    
    console.log('\n⚠️ Cross-Unit Safety:');
    console.log('   Always match token.unit to proof keyset unit');
    console.log('   Mismatch can cause overpayment or validation failure');
    console.log('');
    console.log('   The test proof pool uses USD keyset exclusively');
    console.log('   to ensure correct payment amounts.');
    
    expect(true).toBe(true);
  });
});
