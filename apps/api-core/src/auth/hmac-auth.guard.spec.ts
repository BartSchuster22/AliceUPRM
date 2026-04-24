import { UnauthorizedException } from '@nestjs/common';
import { TenantAuthError } from '@uprm/tenants';
import { HmacAuthGuard } from './hmac-auth.guard';

describe('HmacAuthGuard', () => {
  let guard: HmacAuthGuard;

  beforeEach(() => {
    guard = new HmacAuthGuard();
  });

  function makeContext(req: any): any {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    };
  }

  it('passes the full URL including query string into signature verification', async () => {
    const verifySignedRequest = jest.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      apiKeyId: 'ak_1',
    });
    (guard as any).svc = { verifySignedRequest };

    const req: any = {
      method: 'GET',
      url: '/v1/users/tu-bob/referral-tree?depth=2',
      headers: { authorization: 'UPRM-HMAC deadbeef:1:abc' },
      body: undefined,
    };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(verifySignedRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/users/tu-bob/referral-tree?depth=2',
      body: '',
      header: 'UPRM-HMAC deadbeef:1:abc',
    });
    expect(req.uprm).toEqual({ tenantId: 'tenant-1', apiKeyId: 'ak_1' });
  });

  it('maps tenant auth errors to UnauthorizedException', async () => {
    (guard as any).svc = {
      verifySignedRequest: jest
        .fn()
        .mockRejectedValue(
          new TenantAuthError('signature mismatch', 'SIG_MISMATCH'),
        ),
    };

    await expect(
      guard.canActivate(
        makeContext({
          method: 'GET',
          url: '/v1/users/tu-bob/referral-tree?depth=3',
          headers: { authorization: 'UPRM-HMAC deadbeef:1:abc' },
          body: undefined,
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
