import { BootstrapController } from './bootstrap.controller';

describe('BootstrapController', () => {
  it('upserts an admin user via the bootstrap path', async () => {
    const controller = new BootstrapController({
      upsertAdminUser: jest.fn().mockResolvedValue({
        id: 'admin-1',
        subject: 'oidc|alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        roles: ['super_admin'],
        status: 'active',
      }),
    } as any);

    await expect(
      controller.upsert({
        subject: 'oidc|alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        roles: ['super_admin'],
      }),
    ).resolves.toEqual({
      id: 'admin-1',
      subject: 'oidc|alice',
      email: 'alice@example.com',
      display_name: 'Alice',
      roles: ['super_admin'],
      status: 'active',
    });
  });
});
