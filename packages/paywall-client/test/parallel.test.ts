/**
 * Parallel Payment Streaming Tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  PaywallClient,
  generateDepositId,
  buildStreamUrl,
  fetchStreamHeaders,
  sendPayment,
  createParallelStream,
} from '../src/index.js';

// =============================================================================
// Mock Server Setup
// =============================================================================

const API_URL = 'https://api.test.wavlake.com';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('generateDepositId', () => {
  it('should generate a valid UUID', () => {
    const id = generateDepositId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDepositId()));
    expect(ids.size).toBe(100);
  });
});

describe('buildStreamUrl', () => {
  it('should build URL with deposit ID query parameter', () => {
    const url = buildStreamUrl(API_URL, 'track-123', 'deposit-uuid');
    expect(url).toBe(`${API_URL}/api/v1/audio/track-123?d=deposit-uuid`);
  });

  it('should include dtag in path and deposit in query', () => {
    const url = buildStreamUrl(API_URL, 'track-abc-123', 'deposit-uuid');
    expect(url).toContain('/audio/track-abc-123');
    expect(url).toContain('d=deposit-uuid');
  });
});

// =============================================================================
// fetchStreamHeaders Tests
// =============================================================================

describe('fetchStreamHeaders', () => {
  const config = { apiUrl: API_URL };

  it('should parse stream headers from HEAD response', async () => {
    server.use(
      http.head(`${API_URL}/api/v1/audio/track-123`, () => {
        return new HttpResponse(null, {
          status: 200,
          headers: {
            'X-Preview-End-Byte': '1440000',
            'X-Price-Credits': '5',
            'X-Mint-URL': 'https://mint.example.com',
            'X-Duration-Seconds': '180.5',
          },
        });
      })
    );

    const headers = await fetchStreamHeaders(config, 'track-123', 'deposit-uuid');

    expect(headers).toEqual({
      previewEndByte: 1440000,
      priceCredits: 5,
      mintUrl: 'https://mint.example.com',
      durationSeconds: 180.5,
    });
  });

  it('should return null for free tracks (no paywall headers)', async () => {
    server.use(
      http.head(`${API_URL}/api/v1/audio/free-track`, () => {
        return new HttpResponse(null, { status: 200 });
      })
    );

    const headers = await fetchStreamHeaders(config, 'free-track', 'deposit-uuid');
    expect(headers).toBeNull();
  });

  it('should handle missing optional headers', async () => {
    server.use(
      http.head(`${API_URL}/api/v1/audio/track-456`, () => {
        return new HttpResponse(null, {
          status: 200,
          headers: {
            'X-Preview-End-Byte': '720000',
            'X-Price-Credits': '1',
          },
        });
      })
    );

    const headers = await fetchStreamHeaders(config, 'track-456', 'deposit-uuid');

    expect(headers).toEqual({
      previewEndByte: 720000,
      priceCredits: 1,
      mintUrl: undefined,
      durationSeconds: undefined,
    });
  });

  it('should throw PaywallError on 404', async () => {
    server.use(
      http.head(`${API_URL}/api/v1/audio/nonexistent`, () => {
        return new HttpResponse(null, { status: 404 });
      })
    );

    await expect(
      fetchStreamHeaders(config, 'nonexistent', 'deposit-uuid')
    ).rejects.toMatchObject({
      code: 'CONTENT_NOT_FOUND',
    });
  });
});

// =============================================================================
// sendPayment Tests
// =============================================================================

describe('sendPayment', () => {
  const config = { apiUrl: API_URL };
  const mockToken = 'cashuBpayment_token_here';

  it('should return success with receipt on 200', async () => {
    const mockReceipt = {
      kind: 30444,
      pubkey: 'abc123',
      created_at: 1700000000,
      content: '',
      tags: [['d', 'track-123']],
      id: 'receipt-id',
      sig: 'signature',
    };

    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, async ({ request }) => {
        const body = await request.json() as { depositId: string; token: string };
        expect(body.depositId).toBe('deposit-uuid');
        expect(body.token).toBe(mockToken);

        return HttpResponse.json({
          success: true,
          data: { receipt: mockReceipt },
        });
      })
    );

    const result = await sendPayment(config, 'track-123', 'deposit-uuid', mockToken);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.receipt).toEqual(mockReceipt);
    }
  });

  it('should return success without receipt if response has no receipt', async () => {
    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, () => {
        return HttpResponse.json({ success: true, data: {} });
      })
    );

    const result = await sendPayment(config, 'track-123', 'deposit-uuid', mockToken);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.receipt).toBeUndefined();
    }
  });

  it('should return INSUFFICIENT_PAYMENT error on 402', async () => {
    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, () => {
        return HttpResponse.json(
          { success: false, error: { code: 'INSUFFICIENT_PAYMENT' } },
          { status: 402 }
        );
      })
    );

    const result = await sendPayment(config, 'track-123', 'deposit-uuid', mockToken);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INSUFFICIENT_PAYMENT');
    }
  });

  it('should return DEPOSIT_NOT_FOUND error on 404', async () => {
    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, () => {
        return new HttpResponse(null, { status: 404 });
      })
    );

    const result = await sendPayment(config, 'track-123', 'deposit-uuid', mockToken);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DEPOSIT_NOT_FOUND');
    }
  });

  it('should return success with alreadyPaid flag on 409', async () => {
    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, () => {
        return new HttpResponse(null, { status: 409 });
      })
    );

    const result = await sendPayment(config, 'track-123', 'deposit-uuid', mockToken);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.alreadyPaid).toBe(true);
    }
  });

  it('should return NETWORK_ERROR on fetch failure', async () => {
    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, () => {
        return HttpResponse.error();
      })
    );

    const result = await sendPayment(config, 'track-123', 'deposit-uuid', mockToken);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('should respect custom timeout', async () => {
    let requestReceived = false;
    
    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, async () => {
        requestReceived = true;
        // Delay longer than timeout
        await new Promise(resolve => setTimeout(resolve, 200));
        return HttpResponse.json({ success: true, data: {} });
      })
    );

    const result = await sendPayment(
      config,
      'track-123',
      'deposit-uuid',
      mockToken,
      { timeout: 50 }
    );

    expect(requestReceived).toBe(true);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NETWORK_ERROR');
    }
  });
});

// =============================================================================
// createParallelStream Tests
// =============================================================================

describe('createParallelStream', () => {
  const config = { apiUrl: API_URL };

  it('should return complete stream config for paywall track', async () => {
    server.use(
      http.head(`${API_URL}/api/v1/audio/track-123`, () => {
        return new HttpResponse(null, {
          status: 200,
          headers: {
            'X-Preview-End-Byte': '1440000',
            'X-Price-Credits': '5',
            'X-Mint-URL': 'https://mint.example.com',
            'X-Duration-Seconds': '180',
          },
        });
      })
    );

    const stream = await createParallelStream(config, 'track-123');

    expect(stream.dtag).toBe('track-123');
    expect(stream.depositId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(stream.streamUrl).toContain('track-123');
    expect(stream.streamUrl).toContain(`d=${stream.depositId}`);
    expect(stream.isFree).toBe(false);
    expect(stream.headers).toEqual({
      previewEndByte: 1440000,
      priceCredits: 5,
      mintUrl: 'https://mint.example.com',
      durationSeconds: 180,
    });
  });

  it('should return isFree=true for free tracks', async () => {
    server.use(
      http.head(`${API_URL}/api/v1/audio/free-track`, () => {
        return new HttpResponse(null, { status: 200 });
      })
    );

    const stream = await createParallelStream(config, 'free-track');

    expect(stream.isFree).toBe(true);
    expect(stream.headers).toBeNull();
  });
});

// =============================================================================
// PaywallClient Integration Tests
// =============================================================================

describe('PaywallClient parallel streaming methods', () => {
  it('createParallelStream should work through client', async () => {
    server.use(
      http.head(`${API_URL}/api/v1/audio/track-123`, () => {
        return new HttpResponse(null, {
          status: 200,
          headers: {
            'X-Preview-End-Byte': '1440000',
            'X-Price-Credits': '3',
          },
        });
      })
    );

    const client = new PaywallClient({ apiUrl: API_URL });
    const stream = await client.createParallelStream('track-123');

    expect(stream.dtag).toBe('track-123');
    expect(stream.headers?.priceCredits).toBe(3);
  });

  it('sendPayment should work through client', async () => {
    server.use(
      http.post(`${API_URL}/api/v1/audio/track-123/pay`, () => {
        return HttpResponse.json({
          success: true,
          data: { receipt: { kind: 30444, id: 'test' } },
        });
      })
    );

    const client = new PaywallClient({ apiUrl: API_URL });
    const result = await client.sendPayment('track-123', 'deposit-id', 'token');

    expect(result.success).toBe(true);
  });

  it('static generateDepositId should be accessible', () => {
    const id = PaywallClient.generateDepositId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
