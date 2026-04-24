import jwt from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService', () => {
  const sharedSecret = 'phase8-test-secret';
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'UPRM_ADMIN_JWT_SECRET') return sharedSecret;
      return undefined;
    }),
  };

  it('authenticates a bearer token against an active admin user', async () => {
    const service = new AdminAuthService(config as any);
    (service as any).db = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          subject: 'oidc|alice',
          email: 'alice@example.com',
          displayName: 'Alice',
          roles: ['super_admin'],
          status: 'active',
        }),
      },
    };

    const token = jwt.sign({ email: 'alice@example.com' }, sharedSecret, {
      algorithm: 'HS256',
      subject: 'oidc|alice',
      expiresIn: '10m',
    });

    await expect(
      service.authenticateAuthorizationHeader(`Bearer ${token}`),
    ).resolves.toEqual({
      adminUserId: 'admin-1',
      subject: 'oidc|alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      roles: ['super_admin'],
    });
  });

  it('authenticates valid local email/password credentials', async () => {
    const service = new AdminAuthService(config as any);
    const passwordHash = (service as any).hashPassword('secret-pass-123');
    const update = jest.fn().mockResolvedValue(undefined);
    (service as any).db = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          subject: 'local:admin@uprm.local',
          email: 'admin@uprm.local',
          displayName: 'UPRM Admin',
          passwordHash,
          roles: ['super_admin'],
          status: 'active',
        }),
        update,
      },
    };

    await expect(
      service.authenticateWithPassword('admin@uprm.local', 'secret-pass-123'),
    ).resolves.toEqual(
      expect.objectContaining({
        token: expect.any(String),
        admin: {
          adminUserId: 'admin-1',
          subject: 'local:admin@uprm.local',
          email: 'admin@uprm.local',
          displayName: 'UPRM Admin',
          roles: ['super_admin'],
        },
      }),
    );
    expect(update).toHaveBeenCalled();
  });

  it('rejects invalid local password credentials', async () => {
    const service = new AdminAuthService(config as any);
    const passwordHash = (service as any).hashPassword('secret-pass-123');
    (service as any).db = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          subject: 'local:admin@uprm.local',
          email: 'admin@uprm.local',
          displayName: 'UPRM Admin',
          passwordHash,
          roles: ['super_admin'],
          status: 'active',
        }),
      },
    };

    await expect(
      service.authenticateWithPassword('admin@uprm.local', 'wrong-pass-456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing bearer token', async () => {
    const service = new AdminAuthService(config as any);
    await expect(
      service.authenticateAuthorizationHeader(undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects subjects without an authorized admin user row', async () => {
    const service = new AdminAuthService(config as any);
    (service as any).db = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const token = jwt.sign({}, sharedSecret, {
      algorithm: 'HS256',
      subject: 'oidc|missing',
      expiresIn: '10m',
    });

    await expect(
      service.authenticateAuthorizationHeader(`Bearer ${token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
