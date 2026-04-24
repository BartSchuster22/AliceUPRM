import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TenantService, TenantAuthError } from './tenant.service';

function makeFakeDb(apiKey: any = null) {
  return {
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    tenantConfig: { update: vi.fn() },
    tenantApiKey: {
      create: vi.fn(async ({ data }: any) => ({ id: 'ak_test', ...data })),
      findUnique: vi.fn(async () => apiKey),
      update: vi.fn(async ({ data }: any) => ({ id: 'ak_test', ...data })),
    },
  } as any;
}

describe('TenantService.issueApiKey', () => {
  it('returns a plaintext key and never stores it in plaintext', async () => {
    const db = makeFakeDb();
    const svc = new TenantService(db);
    const issued = await svc.issueApiKey('tenant-1');

    expect(issued.plaintextKey).toMatch(/^[a-f0-9]{8}\.[a-f0-9]{64}$/);
    expect(issued.keyPrefix).toHaveLength(8);
    expect(db.tenantApiKey.create).toHaveBeenCalledOnce();

    const storedArg = db.tenantApiKey.create.mock.calls[0][0].data;
    expect(storedArg.keyHash).not.toEqual(issued.plaintextKey);
    expect(storedArg.keyPrefix).toBe(issued.keyPrefix);
  });
});

describe('TenantService.verifySignedRequest', () => {
  const now = 1_700_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
  });

  it('accepts a correctly signed request', async () => {
    const keyHash = 'a'.repeat(64);
    const keyPrefix = 'deadbeef';
    const db = makeFakeDb({
      id: 'ak_1',
      tenantId: 'tenant-1',
      keyHash,
      keyPrefix,
      status: 'active',
    });
    const svc = new TenantService(db);

    const method = 'POST';
    const path = '/v1/events';
    const body = JSON.stringify({ hello: 'world' });
    const { header } = TenantService.signRequest(keyHash, keyPrefix, method, path, body, now);

    const result = await svc.verifySignedRequest({ method, path, body, header });
    expect(result).toEqual({ tenantId: 'tenant-1', apiKeyId: 'ak_1' });
    expect(db.tenantApiKey.update).toHaveBeenCalledOnce();
  });

  it('rejects a tampered body', async () => {
    const keyHash = 'a'.repeat(64);
    const keyPrefix = 'deadbeef';
    const db = makeFakeDb({
      id: 'ak_1',
      tenantId: 'tenant-1',
      keyHash,
      keyPrefix,
      status: 'active',
    });
    const svc = new TenantService(db);

    const { header } = TenantService.signRequest(
      keyHash,
      keyPrefix,
      'POST',
      '/v1/events',
      JSON.stringify({ hello: 'world' }),
      now,
    );

    await expect(
      svc.verifySignedRequest({
        method: 'POST',
        path: '/v1/events',
        body: JSON.stringify({ hello: 'tampered' }),
        header,
      }),
    ).rejects.toBeInstanceOf(TenantAuthError);
  });

  it('rejects a timestamp outside the 5-minute skew window', async () => {
    const keyHash = 'a'.repeat(64);
    const keyPrefix = 'deadbeef';
    const db = makeFakeDb({
      id: 'ak_1',
      tenantId: 'tenant-1',
      keyHash,
      keyPrefix,
      status: 'active',
    });
    const svc = new TenantService(db);

    const stale = now - 301;
    const { header } = TenantService.signRequest(
      keyHash,
      keyPrefix,
      'POST',
      '/v1/events',
      '',
      stale,
    );

    await expect(
      svc.verifySignedRequest({ method: 'POST', path: '/v1/events', body: '', header }),
    ).rejects.toMatchObject({ code: 'SKEW' });
  });

  it('rejects a revoked key', async () => {
    const keyHash = 'a'.repeat(64);
    const keyPrefix = 'deadbeef';
    const db = makeFakeDb({
      id: 'ak_1',
      tenantId: 'tenant-1',
      keyHash,
      keyPrefix,
      status: 'revoked',
    });
    const svc = new TenantService(db);

    const { header } = TenantService.signRequest(keyHash, keyPrefix, 'POST', '/v1/events', '', now);

    await expect(
      svc.verifySignedRequest({ method: 'POST', path: '/v1/events', body: '', header }),
    ).rejects.toMatchObject({ code: 'KEY_INVALID' });
  });

  it('covers the query string in the signature', async () => {
    const keyHash = 'a'.repeat(64);
    const keyPrefix = 'deadbeef';
    const db = makeFakeDb({
      id: 'ak_1',
      tenantId: 'tenant-1',
      keyHash,
      keyPrefix,
      status: 'active',
    });
    const svc = new TenantService(db);

    const method = 'GET';
    const path = '/v1/users/tu-bob/referral-tree?depth=2';
    const { header } = TenantService.signRequest(keyHash, keyPrefix, method, path, '', now);

    await expect(svc.verifySignedRequest({ method, path, body: '', header })).resolves.toEqual({
      tenantId: 'tenant-1',
      apiKeyId: 'ak_1',
    });

    await expect(
      svc.verifySignedRequest({
        method,
        path: '/v1/users/tu-bob/referral-tree?depth=3',
        body: '',
        header,
      }),
    ).rejects.toMatchObject({ code: 'SIG_MISMATCH' });
  });

  it('rejects a malformed Authorization header', async () => {
    const svc = new TenantService(makeFakeDb());
    await expect(
      svc.verifySignedRequest({ method: 'GET', path: '/', body: '', header: 'Basic xyz' }),
    ).rejects.toMatchObject({ code: 'MALFORMED' });
  });
});
