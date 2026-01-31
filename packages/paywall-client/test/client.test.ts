/**
 * PaywallClient tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { PaywallClient, PaywallError } from '../src/index.js';

// =============================================================================
// Mock Server Setup
// =============================================================================

const API_URL = 'https://api.test.wavlake.com';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// =============================================================================
// Tests
// =============================================================================

describe('PaywallClient', () => {
  describe('constructor', () => {
    it('should normalize API URL (remove trailing slash)', () => {
      const client = new PaywallClient({ apiUrl: 'https://api.test.com/' });
      expect(client.apiUrl).toBe('https://api.test.com');
    });

    it('should set default timeout', () => {
      const client = new PaywallClient({ apiUrl: API_URL });
      expect(client.timeout).toBe(30000);
    });

    it('should allow custom timeout', () => {
      const client = new PaywallClient({ apiUrl: API_URL, timeout: 5000 });
      expect(client.timeout).toBe(5000);
    });
  });

  describe('requestContent', () => {
    it('should return content result on success', async () => {
      server.use(
        http.get(`${API_URL}/api/v1/content/test-track`, () => {
          return HttpResponse.json({
            success: true,
            data: {
              url: 'https://storage.example.com/audio.mp3',
              grant: {
                id: 'grant-123',
                expires_at: '2026-01-30T23:00:00Z',
                stream_type: 'paid',
              },
            },
          });
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });
      const result = await client.requestContent('test-track', 'cashuBtoken');

      expect(result.url).toBe('https://storage.example.com/audio.mp3');
      expect(result.grant.id).toBe('grant-123');
      expect(result.grant.streamType).toBe('paid');
    });

    it('should throw PaywallError on 402', async () => {
      server.use(
        http.get(`${API_URL}/api/v1/content/paid-track`, () => {
          return HttpResponse.json(
            {
              success: false,
              error: {
                code: 'PAYMENT_REQUIRED',
                message: 'Payment required',
                details: {
                  required: 5,
                  mint_url: 'https://mint.wavlake.com',
                },
              },
            },
            { status: 402 }
          );
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });

      await expect(client.requestContent('paid-track', '')).rejects.toThrow(PaywallError);

      try {
        await client.requestContent('paid-track', '');
      } catch (error) {
        expect(PaywallClient.isPaymentRequired(error)).toBe(true);
        expect((error as PaywallError).requiredAmount).toBe(5);
        expect((error as PaywallError).expectedMint).toBe('https://mint.wavlake.com');
      }
    });

    it('should include X-Grant-ID header for replay', async () => {
      let capturedHeaders: Headers | null = null;

      server.use(
        http.get(`${API_URL}/api/v1/content/test-track`, ({ request }) => {
          capturedHeaders = request.headers;
          return HttpResponse.json({
            success: true,
            data: {
              url: 'https://storage.example.com/audio.mp3',
              grant: {
                id: 'grant-123',
                expires_at: '2026-01-30T23:00:00Z',
                stream_type: 'paid',
              },
            },
          });
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });
      await client.requestContent('test-track', '', { grantId: 'grant-abc' });

      expect(capturedHeaders?.get('X-Grant-ID')).toBe('grant-abc');
    });
  });

  describe('getContentPrice', () => {
    it('should return 0 for free tracks', async () => {
      server.use(
        http.get(`${API_URL}/api/v1/content/free-track`, () => {
          return HttpResponse.json({
            success: true,
            data: {
              url: 'https://storage.example.com/audio.mp3',
            },
          });
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });
      const price = await client.getContentPrice('free-track');

      expect(price).toBe(0);
    });

    it('should return price for paywalled tracks', async () => {
      server.use(
        http.get(`${API_URL}/api/v1/content/paid-track`, () => {
          return HttpResponse.json(
            {
              success: false,
              error: {
                code: 'PAYMENT_REQUIRED',
                message: 'Payment required',
                details: {
                  required: 3,
                },
              },
            },
            { status: 402 }
          );
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });
      const price = await client.getContentPrice('paid-track');

      expect(price).toBe(3);
    });
  });

  describe('replayGrant', () => {
    it('should replay without token', async () => {
      let capturedHeaders: Headers | null = null;

      server.use(
        http.get(`${API_URL}/api/v1/content/test-track`, ({ request }) => {
          capturedHeaders = request.headers;
          return HttpResponse.json({
            success: true,
            data: {
              url: 'https://storage.example.com/audio.mp3',
              grant: {
                id: 'grant-123',
                expires_at: '2026-01-30T23:00:00Z',
                stream_type: 'paid',
              },
            },
          });
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });
      await client.replayGrant('test-track', 'existing-grant');

      expect(capturedHeaders?.get('X-Grant-ID')).toBe('existing-grant');
      expect(capturedHeaders?.get('X-Ecash-Token')).toBeNull();
    });
  });

  describe('fetchChange', () => {
    it('should return change token', async () => {
      server.use(
        http.get(`${API_URL}/api/v1/change/payment-123`, () => {
          return HttpResponse.json({
            success: true,
            data: {
              payment_id: 'payment-123',
              change: 'cashuBchangetoken',
              change_amount: 2,
            },
          });
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });
      const result = await client.fetchChange('payment-123');

      expect(result.paymentId).toBe('payment-123');
      expect(result.change).toBe('cashuBchangetoken');
      expect(result.changeAmount).toBe(2);
    });

    it('should return null change if already claimed', async () => {
      server.use(
        http.get(`${API_URL}/api/v1/change/payment-456`, () => {
          return HttpResponse.json({
            success: true,
            data: {
              payment_id: 'payment-456',
              change: null,
            },
          });
        })
      );

      const client = new PaywallClient({ apiUrl: API_URL });
      const result = await client.fetchChange('payment-456');

      expect(result.change).toBeNull();
    });
  });

  describe('getAudioUrl', () => {
    it('should generate URL with token', () => {
      const client = new PaywallClient({ apiUrl: API_URL });
      const url = client.getAudioUrl('track-123', 'cashuBtoken');

      expect(url).toBe(`${API_URL}/api/v1/audio/track-123?token=cashuBtoken`);
    });

    it('should include paymentId if provided', () => {
      const client = new PaywallClient({ apiUrl: API_URL });
      const url = client.getAudioUrl('track-123', 'cashuBtoken', 'pay-456');

      expect(url).toContain('paymentId=pay-456');
    });

    it('should encode dtag', () => {
      const client = new PaywallClient({ apiUrl: API_URL });
      const url = client.getAudioUrl('track/with/slashes', 'token');

      expect(url).toContain('track%2Fwith%2Fslashes');
    });
  });

  describe('static error helpers', () => {
    it('isPaymentError should detect PaywallError', () => {
      const error = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: 'test',
        details: {},
      });

      expect(PaywallClient.isPaymentError(error)).toBe(true);
      expect(PaywallClient.isPaymentError(new Error('test'))).toBe(false);
    });

    it('isPaymentRequired should detect 402 errors', () => {
      const paymentError = new PaywallError({
        code: 'PAYMENT_REQUIRED',
        message: 'test',
        details: {},
      });
      const otherError = new PaywallError({
        code: 'INVALID_TOKEN',
        message: 'test',
        details: {},
      });

      expect(PaywallClient.isPaymentRequired(paymentError)).toBe(true);
      expect(PaywallClient.isPaymentRequired(otherError)).toBe(false);
    });

    it('isTokenSpent should detect spent tokens', () => {
      const spentError = new PaywallError({
        code: 'TOKEN_ALREADY_SPENT',
        message: 'test',
        details: {},
      });

      expect(PaywallClient.isTokenSpent(spentError)).toBe(true);
    });

    it('isKeysetMismatch should detect wrong mint', () => {
      const mintError = new PaywallError({
        code: 'KEYSET_MISMATCH',
        message: 'test',
        details: { mintUrl: 'https://correct.mint' },
      });

      expect(PaywallClient.isKeysetMismatch(mintError)).toBe(true);
    });
  });

  describe('withConfig', () => {
    it('should create new client with merged config', () => {
      const client = new PaywallClient({ apiUrl: API_URL, timeout: 5000 });
      const newClient = client.withConfig({ timeout: 10000 });

      expect(client.timeout).toBe(5000);
      expect(newClient.timeout).toBe(10000);
      expect(newClient.apiUrl).toBe(API_URL);
    });
  });
});
