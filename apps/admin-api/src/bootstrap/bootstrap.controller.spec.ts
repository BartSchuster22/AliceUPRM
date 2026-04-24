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

  it('creates a local admin user with password login enabled', async () => {
    const controller = new BootstrapController({
      upsertLocalAdminUser: jest.fn().mockResolvedValue({
        id: 'admin-2',
        subject: 'local:admin@uprm.local',
        email: 'admin@uprm.local',
        displayName: 'UPRM Admin',
        roles: ['super_admin'],
        status: 'active',
      }),
    } as any);

    await expect(
      controller.upsertLocal({
        email: 'admin@uprm.local',
        displayName: 'UPRM Admin',
        password: 'secret-pass-123',
        roles: ['super_admin'],
      }),
    ).resolves.toEqual({
      id: 'admin-2',
      subject: 'local:admin@uprm.local',
      email: 'admin@uprm.local',
      display_name: 'UPRM Admin',
      roles: ['super_admin'],
      status: 'active',
      login_type: 'local_password',
    });
  });
});
