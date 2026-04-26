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

  it('returns memberships and effective referral chain in user detail', async () => {
    (controller as any).svc = {
      getUserDetail: jest.fn().mockResolvedValue({
        tenantUser: {
          id: 'tu-psi-alice',
          tenantId: 'tenant-psi',
          userId: 'user-1',
          externalUserId: 'alice-psi',
          username: 'Alice',
          tenantStatus: 'active',
          entityType: 'person',
          sourceTenantId: 'tenant-psi',
          sourceTenantUserId: 'tu-psi-owner',
          joinedAt: new Date('2026-04-01T00:00:00Z'),
          metadata: {},
          user: { emailNormalized: 'alice@example.com', emailVerified: true },
        },
        sourceTenant: {
          id: 'tenant-psi',
          name: 'PSI',
          slug: 'psi',
          status: 'active',
        },
        sourceTenantUser: {
          id: 'tu-psi-owner',
          tenantId: 'tenant-psi',
          userId: 'tenant-user-psi',
          externalUserId: 'tenant:psi',
          username: 'PSI',
          entityType: 'tenant',
          user: { emailNormalized: 'psi@tenant.uprm.local' },
        },
        memberships: [
          {
            id: 'tu-psi-alice',
            tenantId: 'tenant-psi',
            externalUserId: 'alice-psi',
            username: 'Alice',
            entityType: 'person',
            tenantStatus: 'active',
            joinedAt: new Date('2026-04-01T00:00:00Z'),
            sourceTenantId: 'tenant-psi',
            sourceTenantUserId: 'tu-psi-owner',
            metadata: {},
            tenant: {
              id: 'tenant-psi',
              name: 'PSI',
              slug: 'psi',
              status: 'active',
            },
          },
          {
            id: 'tu-omega-alice',
            tenantId: 'tenant-omega',
            externalUserId: 'alice-omega',
            username: 'Alice',
            entityType: 'person',
            tenantStatus: 'active',
            joinedAt: new Date('2026-05-01T00:00:00Z'),
            sourceTenantId: 'tenant-psi',
            sourceTenantUserId: 'tu-psi-alice',
            metadata: {},
            tenant: {
              id: 'tenant-omega',
              name: 'Omega',
              slug: 'omega',
              status: 'active',
            },
          },
        ],
        effectiveReferralChain: [
          {
            tenantId: 'tenant-psi',
            ancestorTenantId: 'tenant-psi',
            ancestorTenantUserId: 'tu-psi-owner',
            descendantTenantUserId: 'tu-psi-alice',
            depth: 1,
            relationType: 'source_provenance',
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
          {
            tenantId: 'tenant-psi',
            ancestorTenantId: 'tenant-uprm',
            ancestorTenantUserId: 'tu-user0',
            descendantTenantUserId: 'tu-psi-alice',
            depth: 2,
            relationType: 'source_provenance',
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ],
        balance: null,
        payouts: [],
      }),
    };

    await expect(
      controller.detail('tu-psi-alice', { tenantId: 'tenant-psi' } as any),
    ).resolves.toEqual(
      expect.objectContaining({
        memberships: [
          expect.objectContaining({
            tenant: expect.objectContaining({ slug: 'psi' }),
          }),
          expect.objectContaining({
            tenant: expect.objectContaining({ slug: 'omega' }),
          }),
        ],
        effective_referral_chain: [
          expect.objectContaining({
            ancestor_tenant_user_id: 'tu-psi-owner',
            relation_type: 'source_provenance',
            depth: 1,
          }),
          expect.objectContaining({
            ancestor_tenant_user_id: 'tu-user0',
            ancestor_tenant_id: 'tenant-uprm',
            depth: 2,
          }),
        ],
      }),
    );
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
