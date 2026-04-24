import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('returns a bearer token for valid local credentials', async () => {
    const controller = new AuthController({
      authenticateWithPassword: jest.fn().mockResolvedValue({
        token: 'jwt-token',
        admin: {
          adminUserId: 'admin-1',
          subject: 'local:admin@uprm.local',
          email: 'admin@uprm.local',
          displayName: 'UPRM Admin',
          roles: ['super_admin'],
        },
      }),
    } as any);

    await expect(
      controller.login({
        email: 'admin@uprm.local',
        password: 'secret-pass-123',
      }),
    ).resolves.toEqual({
      access_token: 'jwt-token',
      token_type: 'Bearer',
      expires_in_seconds: 43200,
      admin: {
        id: 'admin-1',
        subject: 'local:admin@uprm.local',
        email: 'admin@uprm.local',
        display_name: 'UPRM Admin',
        roles: ['super_admin'],
      },
    });
  });
});
