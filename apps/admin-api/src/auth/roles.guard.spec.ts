import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  it('allows when the admin has at least one required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['tenant_admin']),
    };
    const guard = new RolesGuard(reflector as any);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ admin: { roles: ['tenant_admin'] } }),
      }),
    };

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('rejects when the admin lacks the required role', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['super_admin', 'tenant_admin']),
    };
    const guard = new RolesGuard(reflector as any);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ admin: { roles: ['fraud_reviewer'] } }),
      }),
    };

    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });
});
