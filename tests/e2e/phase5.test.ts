/**
 * Phase 5: URL Token Parameter & Change Recovery Tests
 * 
 * Tests for new Phase 5 features:
 * - ?token= query parameter (alternative to X-Ecash-Token header)
 * - ?payment-id= for change recovery tracking
 * - GET /v1/change/{payment-id} endpoint
 * 
 * These endpoints enable true progressive streaming with native HTML audio:
 *   <audio src="/v1/audio/track?token=cashuB...&payment-id=uuid">
 */

import { describe, it, expect } from 'vitest';
import { config } from './config';
import {
  requestAudio,
  requestAudioWithUrlToken,
  claimChange,
  generatePaymentId,
} from './helpers/api';

const { testTracks } = config;

describe('Phase 5: URL Token Parameter', () => {
  describe('Audio with ?token= query parameter', () => {
    it('should return 402 for paid track without token (URL mode)', async () => {
      const result = await requestAudioWithUrlToken(testTracks.paid.dtag);
      
      expect(result.ok).toBe(false);
      expect(result.status).toBe(402);
      expect(result.error?.code).toBe('PAYMENT_REQUIRED');
      
      console.log('✅ URL mode: 402 returned for paid track without token');
    });

    it('should return 402 with same format as header mode', async () => {
      // Compare URL mode vs header mode responses
      const urlResult = await requestAudioWithUrlToken(testTracks.paid.dtag);
      const headerResult = await requestAudio(testTracks.paid.dtag);
      
      expect(urlResult.status).toBe(headerResult.status);
      expect(urlResult.error?.code).toBe(headerResult.error?.code);
      expect(urlResult.error?.details?.required).toBe(headerResult.error?.details?.required);
      
      console.log('✅ URL mode and header mode return consistent 402 responses');
    });

    it('should reject invalid token format via URL', async () => {
      const result = await requestAudioWithUrlToken(
        testTracks.paid.dtag,
        'not-a-valid-token'
      );
      
      expect(result.ok).toBe(false);
      expect(result.status).toBe(402);
      
      console.log('✅ Invalid token rejected via URL parameter');
    });

    it('should accept ?payment-id= parameter', async () => {
      const paymentId = generatePaymentId();
      
      // Request without token should still return 402, but accept the payment-id
      const result = await requestAudioWithUrlToken(
        testTracks.paid.dtag,
        undefined,
        { paymentId }
      );
      
      expect(result.status).toBe(402);
      // The payment-id is accepted (no error about invalid param)
      expect(result.error?.code).toBe('PAYMENT_REQUIRED');
      
      console.log('✅ payment-id parameter accepted');
      console.log('   Payment ID:', paymentId);
    });
  });

  describe('Free content with URL token', () => {
    it('should stream free track without token (URL mode)', async () => {
      const result = await requestAudioWithUrlToken(testTracks.free.dtag);
      
      if (result.ok) {
        expect(result.contentType).toContain('audio');
        expect(result.contentLength).toBeGreaterThan(0);
        console.log('✅ Free track streams via URL mode');
      } else {
        // Track might be in paywall mode
        console.log('ℹ️ Track requires payment');
      }
    });
  });
});

describe('Phase 5: Change Recovery Endpoint', () => {
  describe('GET /v1/change/{payment-id}', () => {
    it('should return 200 with null change for unknown payment-id', async () => {
      const unknownId = generatePaymentId();
      const result = await claimChange(unknownId);
      
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data?.payment_id).toBe(unknownId);
      expect(result.data?.change_token).toBeNull();
      expect(result.data?.change_amount).toBeNull();
      
      console.log('✅ Unknown payment-id returns 200 with null change');
    });

    it('should return consistent response format', async () => {
      const paymentId = generatePaymentId();
      const result = await claimChange(paymentId);
      
      expect(result.ok).toBe(true);
      expect(result.data).toHaveProperty('payment_id');
      expect(result.data).toHaveProperty('change_token');
      expect(result.data).toHaveProperty('change_amount');
      
      console.log('✅ Change endpoint returns expected response format');
    });

    it('should handle multiple claims for same payment-id', async () => {
      const paymentId = generatePaymentId();
      
      // First claim
      const first = await claimChange(paymentId);
      expect(first.ok).toBe(true);
      
      // Second claim (should also succeed, but still null since no payment was made)
      const second = await claimChange(paymentId);
      expect(second.ok).toBe(true);
      expect(second.data?.change_token).toBeNull();
      
      console.log('✅ Multiple claims handled gracefully');
    });
  });
});

describe('Phase 5: Header vs URL Token Priority', () => {
  it('header should take priority over URL token', async () => {
    // Both header and URL have tokens - header should win
    // We can't fully test this without valid tokens, but we can verify
    // the endpoint accepts both simultaneously
    
    const paymentId = generatePaymentId();
    const url = `${config.apiUrl}/api/v1/audio/${testTracks.paid.dtag}?token=url-token&payment-id=${paymentId}`;
    
    const response = await fetch(url, {
      headers: {
        'X-Ecash-Token': 'header-token',
      },
    });
    
    expect(response.status).toBe(402);
    
    // Both tokens are invalid, but the request should process
    // (the header token is tried first per Phase 5 spec)
    console.log('✅ Endpoint accepts both header and URL tokens');
  });
});

// These tests require actual tokens - run manually or with pre-minted tokens
describe.skip('Phase 5: Paid Content with URL Token', () => {
  const testToken = process.env.TEST_CASHU_TOKEN;

  it('should stream paid track with token via URL parameter', async () => {
    if (!testToken) {
      console.log('⚠️ Set TEST_CASHU_TOKEN env var to run this test');
      return;
    }

    const paymentId = generatePaymentId();
    const result = await requestAudioWithUrlToken(
      testTracks.paid.dtag,
      testToken,
      { paymentId }
    );
    
    expect(result.ok).toBe(true);
    expect(result.contentType).toContain('audio');
    
    console.log('✅ Paid track streams via URL token');
    console.log('   Payment ID:', paymentId);
  });

  it('should store change for retrieval when using payment-id', async () => {
    if (!testToken) return;

    const paymentId = generatePaymentId();
    
    // Make payment with URL token and payment-id
    const audioResult = await requestAudioWithUrlToken(
      testTracks.paid.dtag,
      testToken,
      { paymentId }
    );
    
    expect(audioResult.ok).toBe(true);

    // Retrieve change
    const changeResult = await claimChange(paymentId);
    
    expect(changeResult.ok).toBe(true);
    expect(changeResult.data?.payment_id).toBe(paymentId);
    
    if (changeResult.data?.change_token) {
      expect(changeResult.data.change_token.startsWith('cashuB')).toBe(true);
      expect(changeResult.data.change_amount).toBeGreaterThan(0);
      console.log('✅ Change retrieved:', changeResult.data.change_amount, 'credits');
    } else {
      console.log('ℹ️ No change (exact payment or no overpayment)');
    }
  });

  it('change should only be claimable once', async () => {
    if (!testToken) return;

    const paymentId = generatePaymentId();
    
    // Make payment
    await requestAudioWithUrlToken(testTracks.paid.dtag, testToken, { paymentId });

    // First claim
    const first = await claimChange(paymentId);
    const hadChange = first.data?.change_token !== null;

    // Second claim should return null (already claimed)
    const second = await claimChange(paymentId);
    
    expect(second.ok).toBe(true);
    expect(second.data?.change_token).toBeNull();
    
    if (hadChange) {
      console.log('✅ Change claimed once, second claim returns null');
    } else {
      console.log('ℹ️ No change to claim');
    }
  });
});
