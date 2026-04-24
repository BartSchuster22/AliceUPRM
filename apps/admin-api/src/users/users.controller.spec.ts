import { AdminUsersController } from './users.controller';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;

  beforeEach(() => {
    controller = new AdminUsersController();
  });

  it('lists tenant users for admin search', async () => {
    (controller as any).svc = {
      listUsers: jest.fn().mockResolvedValue([
        {
          id: 'tu-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          externalUserId: 'psi-alice',
          username: 'alice',
          tenantStatus: 'active',
          joinedAt: new Date('2026-04-01T00:00:00Z'),
          metadata: {},
          user: { emailNormalized: 'alice@example.com', emailVerified: true },
        },
      ]),
    };

    await expect(
      controller.list({ tenantId: 'tenant-1', q: 'alice' } as any),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'tu-1',
        external_user_id: 'psi-alice',
        email: 'alice@example.com',
        email_verified: true,
      }),
    ]);
  });

  it('creates a manual adjustment and writes an audit row', async () => {
    (controller as any).svc = {
      createManualAdjustment: jest.fn().mockResolvedValue({
        entryId: 'entry-1',
        duplicate: false,
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        amountMinor: 250n,
        currency: 'EUR',
        reasonCode: 'support_bonus',
        note: 'courtesy',
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      controller.manualAdjustment(
        'tu-1',
        {
          tenantId: 'tenant-1',
          amountMinor: '250',
          currency: 'EUR',
          reasonCode: 'support_bonus',
          note: 'courtesy',
        } as any,
        {
          admin: {
            adminUserId: 'admin-1',
            subject: 'local:admin@uprm.local',
            email: 'admin@uprm.local',
            displayName: 'Admin',
            roles: ['super_admin'],
          },
          method: 'POST',
          route: { path: '/admin/users/:tenantUserId/manual-adjustments' },
          headers: {},
        } as any,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        entry_id: 'entry-1',
        amount_minor: '250',
        reason_code: 'support_bonus',
      }),
    );
    expect((controller as any).audit.write).toHaveBeenCalled();
  });
});
