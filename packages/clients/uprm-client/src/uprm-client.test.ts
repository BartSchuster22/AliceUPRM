import { describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { UprmHttpClient, UprmHttpError } from './http.js';
import { signUprmRequest } from './signing.js';
import { UprmClient } from './uprm-client.js';

describe('@uprm/uprm-client signing', () => {
  it('matches the current UPRM HMAC contract', () => {
    const apiKey = '1234abcd.secret-value';
    const body = JSON.stringify({ hello: 'world' });
    const timestamp = 1_710_000_000;
    const canonical = [
      String(timestamp),
      'POST',
      '/v1/users',
      createHash('sha256').update(body).digest('hex'),
    ].join('\n');
    const expectedSignature = createHmac(
      'sha256',
      createHash('sha256').update(apiKey).digest('hex'),
    )
      .update(canonical)
      .digest('hex');

    const signed = signUprmRequest({
      apiKey,
      method: 'POST',
      path: '/v1/users',
      body,
      now: () => timestamp * 1000,
    });

    expect(signed.authorization).toBe(`UPRM-HMAC 1234abcd:${timestamp}:${expectedSignature}`);
    expect(signed.canonical).toBe(canonical);
  });
});

describe('@uprm/uprm-client http retry behavior', () => {
  it('retries retryable failures and preserves the idempotency key across attempts', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporary outage', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = new UprmHttpClient({
      baseUrl: 'https://uprm.test',
      apiKey: '1234abcd.secret-value',
      fetch: fetchMock,
      now: () => 1_710_000_000_000,
      retryDelayMs: 0,
      maxAttempts: 2,
    });

    const result = await client.requestJson<{ ok: boolean }>({
      method: 'POST',
      path: '/v1/events',
      body: {
        eventType: 'user_registered',
        idempotencyKey: 'evt-12345678',
        externalEventId: 'ext-1',
        externalUserId: 'user-1',
      },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get('Idempotency-Key')).toBe('evt-12345678');
    expect(secondHeaders.get('Idempotency-Key')).toBe('evt-12345678');
    expect(firstHeaders.get('Authorization')).toBe(secondHeaders.get('Authorization'));
  });

  it('does not retry non-idempotent POST requests without an explicit idempotency key', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('temporary outage', { status: 503 }));
    const client = new UprmHttpClient({
      baseUrl: 'https://uprm.test',
      apiKey: '1234abcd.secret-value',
      fetch: fetchMock,
      retryDelayMs: 0,
      maxAttempts: 2,
    });

    await expect(
      client.requestJson({
        method: 'POST',
        path: '/v1/users',
        body: { email: 'user@example.com', externalUserId: 'psi-user-1' },
      }),
    ).rejects.toBeInstanceOf(UprmHttpError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws UprmHttpError when retries are exhausted', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('nope', { status: 503 }));
    const client = new UprmHttpClient({
      baseUrl: 'https://uprm.test',
      apiKey: '1234abcd.secret-value',
      fetch: fetchMock,
      retryDelayMs: 0,
      maxAttempts: 1,
    });

    await expect(
      client.requestJson({ method: 'GET', path: '/v1/users/external/user-1/profile' }),
    ).rejects.toBeInstanceOf(UprmHttpError);
  });

  it('fails with a clear error when a successful response is not valid JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not-json', { status: 200 }));
    const client = new UprmHttpClient({
      baseUrl: 'https://uprm.test',
      apiKey: '1234abcd.secret-value',
      fetch: fetchMock,
      maxAttempts: 1,
    });

    await expect(
      client.requestJson({ method: 'GET', path: '/v1/users/external/user-1/profile' }),
    ).rejects.toThrow(/UPRM returned invalid JSON \(200\)/);
  });
});

describe('@uprm/uprm-client routes', () => {
  it('targets the verified Phase 10 routes', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tenant_user: { id: 'tenant-user-1' } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'cs_123', url: 'https://checkout.test' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ event_id: 'evt-1', processing_status: 'accepted', duplicate: false }),
          {
            status: 202,
          },
        ),
      );

    const client = new UprmClient({
      baseUrl: 'https://uprm.test',
      apiKey: '1234abcd.secret-value',
      fetch: fetchMock,
      now: () => 1_710_000_000_000,
    });

    await client.createUser({
      email: 'user@example.com',
      externalUserId: 'psi-user-1',
      username: 'Example User',
    });
    await client.createCheckoutSession({
      externalUserId: 'psi-user-1',
      plan: 'pro-monthly',
      productName: 'Pro Monthly',
      amountMinor: 1900,
      currency: 'EUR',
      billingInterval: 'month',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    });
    await client.submitEvent({
      eventType: 'invoice_paid',
      idempotencyKey: 'evt-87654321',
      externalEventId: 'stripe_evt_1',
      externalUserId: 'psi-user-1',
      invoiceId: 'in_1',
      amount: '19.00',
      currency: 'EUR',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://uprm.test/v1/users');
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://uprm.test/v1/billing/checkout-sessions',
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe('https://uprm.test/v1/events');

    const eventHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(eventHeaders.get('Idempotency-Key')).toBe('evt-87654321');
  });
});
