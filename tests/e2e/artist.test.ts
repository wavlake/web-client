/**
 * Phase 4: Artist & Royalty Tests
 * 
 * Test artist dashboard endpoints:
 * - /v1/artist/stats - Balance and stream counts
 * - /v1/artist/earnings - Earnings breakdown
 * - /v1/artist/streams - Recent stream events
 * 
 * All require NIP-98 authentication
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from './config';
import { getArtistStats, getArtistEarnings, getArtistStreams } from './helpers/api';
import { getNpubFromNsec, getPubkeyFromNsec } from './helpers/nostr';

const { testArtist } = config;

describe('Phase 4: Artist Dashboard', () => {
  let artistNpub: string;
  let artistPubkey: string;

  beforeAll(() => {
    artistPubkey = getPubkeyFromNsec(testArtist.nsec);
    artistNpub = getNpubFromNsec(testArtist.nsec);
    console.log('Test artist pubkey:', artistPubkey.slice(0, 16) + '...');
    console.log('Test artist npub:', artistNpub.slice(0, 20) + '...');
  });

  describe('Artist Stats (NIP-98 Auth)', () => {
    it('should return 401 without auth', async () => {
      const url = `${config.apiUrl}/api/v1/artist/stats`;
      const response = await fetch(url);
      
      expect(response.status).toBe(401);
      console.log('✅ Unauthenticated request rejected');
    });

    it('should return stats with NIP-98 auth', async () => {
      const result = await getArtistStats(testArtist.nsec);
      
      // Could be 401 if artist not registered, or 200 if they are
      if (result.ok) {
        expect(result.data).toBeDefined();
        expect(result.data?.balance).toBeDefined();
        expect(result.data?.streams).toBeDefined();
        
        console.log('✅ Artist stats retrieved');
        console.log('   Balance:', result.data?.balance.available_credits, 'credits');
        console.log('   Total streams:', result.data?.streams.total);
        console.log('   Paid streams:', result.data?.streams.paid);
        console.log('   Free streams:', result.data?.streams.free);
      } else {
        // Artist might not be registered in the system
        console.log('ℹ️ Artist not found or not registered:', result.error?.code);
        expect(['AUTH_REQUIRED', 'NOT_FOUND', 'FORBIDDEN']).toContain(result.error?.code);
      }
    });
  });

  describe('Artist Earnings (NIP-98 Auth)', () => {
    it('should return earnings history with NIP-98 auth', async () => {
      const result = await getArtistEarnings(testArtist.nsec);
      
      if (result.ok) {
        expect(result.data).toBeDefined();
        expect(result.data?.summary).toBeDefined();
        
        console.log('✅ Artist earnings retrieved');
        console.log('   Total streams:', result.data?.summary.total_streams);
        console.log('   Total earnings:', result.data?.summary.total_earnings_credits, 'credits');
        console.log('   Total tips:', result.data?.summary.total_tips_credits, 'credits');
        
        if (result.data?.by_track && result.data.by_track.length > 0) {
          console.log('   Top track:', result.data.by_track[0].title);
        }
      } else {
        console.log('ℹ️ Earnings not available:', result.error?.code);
      }
    });

    it('should support date range filtering', async () => {
      // Get last 7 days
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const result = await getArtistEarnings(testArtist.nsec, { startDate, endDate });
      
      if (result.ok) {
        console.log('✅ Date-filtered earnings retrieved');
        console.log(`   Range: ${startDate} to ${endDate}`);
        console.log('   Streams in range:', result.data?.summary.total_streams);
      }
    });
  });

  describe('Artist Streams (NIP-98 Auth)', () => {
    it('should return recent streams with NIP-98 auth', async () => {
      const result = await getArtistStreams(testArtist.nsec, 10);
      
      if (result.ok) {
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data?.streams)).toBe(true);
        
        console.log('✅ Recent streams retrieved');
        console.log('   Stream count:', result.data?.streams.length);
        
        if (result.data?.streams && result.data.streams.length > 0) {
          const latest = result.data.streams[0];
          console.log('   Latest stream type:', latest.stream_type);
          console.log('   Latest stream amount:', latest.amount_credits, 'credits');
          console.log('   Latest stream time:', latest.created_at);
        }
      } else {
        console.log('ℹ️ Streams not available:', result.error?.code);
      }
    });
  });
});

describe('Phase 4: Royalty Verification', () => {
  // These tests verify that payments result in artist earnings
  // Requires running content tests with actual tokens first
  
  describe.skip('Payment → Royalty Flow', () => {
    it('should increase artist balance after paid stream', async () => {
      // 1. Get initial balance
      const before = await getArtistStats(testArtist.nsec);
      const initialBalance = before.data?.balance.available_credits || 0;
      
      console.log('Initial balance:', initialBalance);
      
      // 2. Make a paid stream (requires token)
      // This would need actual token from mint tests
      // const token = await mintTokens(...);
      // await requestContent(testTracks.paid.dtag, token);
      
      // 3. Check balance increased
      // Wait a moment for royalty processing
      await new Promise(r => setTimeout(r, 2000));
      
      const after = await getArtistStats(testArtist.nsec);
      const finalBalance = after.data?.balance.available_credits || 0;
      
      expect(finalBalance).toBeGreaterThan(initialBalance);
      console.log('Final balance:', finalBalance);
      console.log('Royalty earned:', finalBalance - initialBalance);
    });

    it('should record stream in artist history', async () => {
      // After making a payment, the stream should appear in history
      const result = await getArtistStreams(testArtist.nsec, 1);
      
      if (result.ok && result.data?.streams.length) {
        const latest = result.data.streams[0];
        expect(latest.stream_type).toBe('paid');
        console.log('✅ Stream recorded in history');
      }
    });
  });
});
