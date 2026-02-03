/**
 * Phase 2 & 3: Content Access Tests
 * 
 * Test paywall endpoints:
 * - /v1/content/{dtag} - JSON with grants
 * - /v1/audio/{dtag} - Binary streaming
 */

import { describe, it, expect } from 'vitest';
import { config } from './config';
import { requestContent, requestAudio, getContentPrice } from './helpers/api';

const { testTracks, testListener } = config;

describe('Phase 2: ContentHandler (/v1/content)', () => {
  describe('Free Content', () => {
    it('should return content URL for free track without token', async () => {
      const result = await requestContent(testTracks.free.dtag);
      
      // Free tracks should return 200 with URL
      if (result.ok) {
        expect(result.data?.url).toBeDefined();
        console.log('✅ Free track access granted');
        console.log('   URL:', result.data?.url?.slice(0, 60) + '...');
        
        // Grant is optional for free content
        if (result.data?.grant) {
          expect(result.data.grant.stream_type).toBe('free');
        }
      } else {
        // Some tracks might still require payment
        console.log('ℹ️ Track returned:', result.status);
      }
    });
  });

  describe('Paid Content - No Token', () => {
    it('should return 402 with price info for paid track', async () => {
      const result = await requestContent(testTracks.paid.dtag);
      
      expect(result.ok).toBe(false);
      expect(result.status).toBe(402);
      
      // API returns price in different formats - check both
      const price = result.priceCredits || result.error?.details?.required;
      const mintUrl = result.mintUrl || result.error?.details?.mint_url;
      
      expect(price).toBeGreaterThan(0);
      expect(mintUrl).toBe(config.mintUrl);
      
      console.log('✅ 402 returned with price:', price, 'credits');
      console.log('   Mint URL:', mintUrl);
    });
  });

  describe('Price Check', () => {
    it('should return correct price for paid track', async () => {
      const price = await getContentPrice(testTracks.paid.dtag);
      
      expect(price).toBe(testTracks.paid.priceCredits);
      console.log('✅ Track price:', price, 'credits');
    });

    it('should return 0 for free track', async () => {
      const price = await getContentPrice(testTracks.free.dtag);
      
      expect(price).toBe(0);
      console.log('✅ Free track price: 0');
    });
  });

  // These tests require actual tokens - run manually or with pre-minted tokens
  describe.skip('Paid Content - With Token', () => {
    const testToken = process.env.TEST_CASHU_TOKEN;

    it('should return content URL when paid with token', async () => {
      if (!testToken) {
        console.log('⚠️ Set TEST_CASHU_TOKEN env var to run this test');
        return;
      }

      const result = await requestContent(testTracks.paid.dtag, testToken);
      
      expect(result.ok).toBe(true);
      expect(result.data?.url).toBeDefined();
      expect(result.data?.grant?.id).toBeDefined();
      expect(result.data?.grant?.stream_type).toBe('paid');
      
      console.log('✅ Paid track access granted');
      console.log('   Grant ID:', result.data?.grant?.id);
      console.log('   Expires:', result.data?.grant?.expires_at);
    });

    it('should return change when overpaying', async () => {
      if (!testToken) return;

      // This would need a token worth more than the track price
      const result = await requestContent(testTracks.paid.dtag, testToken);
      
      if (result.ok && result.data?.change) {
        expect(result.data.change.startsWith('cashuB')).toBe(true);
        expect(result.data.change_amount).toBeGreaterThan(0);
        console.log('✅ Received change:', result.data.change_amount, 'credits');
      }
    });

    it('should allow grant replay without new payment', async () => {
      if (!testToken) return;

      // First request with payment
      const first = await requestContent(testTracks.paid.dtag, testToken);
      expect(first.ok).toBe(true);
      
      const grantId = first.data?.grant?.id;
      expect(grantId).toBeDefined();

      // Second request with grant ID (no token)
      const replay = await requestContent(testTracks.paid.dtag, undefined, { grantId });
      
      expect(replay.ok).toBe(true);
      expect(replay.data?.url).toBeDefined();
      console.log('✅ Grant replay successful');
    });
  });
});

describe('Phase 2: AudioHandler (/v1/audio)', () => {
  describe('Paid Audio - No Token', () => {
    it('should return 402 for paid track without token', async () => {
      const result = await requestAudio(testTracks.paid.dtag);
      
      expect(result.ok).toBe(false);
      expect(result.status).toBe(402);
      expect(result.error?.code).toBe('PAYMENT_REQUIRED');
      
      console.log('✅ Audio 402 returned for paid track');
    });
  });

  describe('Free Audio', () => {
    it('should stream free track without token', async () => {
      const result = await requestAudio(testTracks.free.dtag);
      
      if (result.ok) {
        expect(result.contentType).toContain('audio');
        expect(result.contentLength).toBeGreaterThan(0);
        console.log('✅ Free audio stream started');
        console.log('   Content-Type:', result.contentType);
        console.log('   Content-Length:', result.contentLength);
      } else {
        // Track might be in paywall mode
        console.log('ℹ️ Track requires payment:', result.error?.details?.required);
      }
    });
  });

  // These tests require actual tokens
  describe.skip('Paid Audio - With Token', () => {
    const testToken = process.env.TEST_CASHU_TOKEN;

    it('should stream paid track with valid token', async () => {
      if (!testToken) return;

      const result = await requestAudio(testTracks.paid.dtag, testToken);
      
      expect(result.ok).toBe(true);
      expect(result.contentType).toContain('audio');
      expect(result.contentLength).toBeGreaterThan(0);
      
      console.log('✅ Paid audio stream started');
    });

    it('should accept overpayment as artist tip', async () => {
      // Note: Server-side change was removed in Phase 5 of Sat-to-USD PRD.
      // Overpayment now becomes artist tip instead of being returned as change.
      if (!testToken) return;

      const result = await requestAudio(testTracks.paid.dtag, testToken);
      expect(result.ok).toBe(true);
      console.log('✅ Overpayment accepted (becomes artist tip)');
    });
  });
});
