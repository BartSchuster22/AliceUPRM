import { TenantsController } from './tenants.controller';

describe('TenantsController webhook config', () => {
  const validRewardConfig = {
    enabled: true,
    currency: 'credit',
    settlementWindowDays: 7,
    triggers: ['invoice_paid'],
    tiers: [{ depth: 1, type: 'percent', value: '10' }],
  };

  let controller: TenantsController;

  beforeEach(() => {
    controller = new TenantsController();
  });

  it('lists tenants for the admin shell switcher with active promoter summaries', async () => {
    (controller as any).svc = {
      listTenants: jest.fn().mockResolvedValue([
        {
          id: 'tenant-1',
          slug: 'psi',
          name: 'PSI',
          activePromoters: [
            {
              id: 'profile-1',
              tenantUserId: 'tu-alice',
              promoterStatus: 'promoter_2',
              qualificationSource: 'manual',
              manualOverride: true,
              effectiveFrom: new Date('2026-04-10T00:00:00Z'),
              tenantUser: {
                id: 'tu-alice',
                username: 'alice',
                externalUserId: 'psi-alice',
              },
            },
          ],
        },
      ]),
    };

    await expect(controller.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'tenant-1',
        slug: 'psi',
        active_promoters: [
          expect.objectContaining({
            tenant_user_id: 'tu-alice',
            promoter_status: 'promoter_2',
            username: 'alice',
          }),
        ],
      }),
    ]);
  });

  it('updates generic tenant config and writes an audit row', async () => {
    (controller as any).svc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        config: { rewardConfig: { enabled: false } },
      }),
      updateConfig: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        rewardConfig: validRewardConfig,
        promoterConfig: { minReferrals: 5 },
        fraudConfig: { threshold: 10 },
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const result = await (controller as any).updateConfig(
      'tenant-1',
      {
        rewardConfig: validRewardConfig,
        promoterConfig: { minReferrals: 5 },
        fraudConfig: { threshold: 10 },
      },
      {
        admin: {
          adminUserId: 'admin-1',
          subject: 'local:admin@uprm.local',
          email: 'admin@uprm.local',
          displayName: 'Admin',
          roles: ['super_admin'],
        },
        method: 'POST',
        route: { path: '/admin/tenants/:id/config' },
        headers: {},
      },
    );

    expect((controller as any).svc.updateConfig).toHaveBeenCalled();
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual({
      tenant_id: 'tenant-1',
      reward_config: validRewardConfig,
      promoter_config: { minReferrals: 5 },
      fraud_config: { threshold: 10 },
    });
  });

  it('rejects invalid reward config payloads before persisting them', async () => {
    (controller as any).svc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        config: {},
      }),
      updateConfig: jest.fn(),
    };

    await expect(
      (controller as any).updateConfig(
        'tenant-1',
        {
          rewardConfig: {
            enabled: true,
            currency: 'credit',
            settlementWindowDays: 7,
            triggers: ['invoice_paid'],
            tiers: [],
          },
        },
        {
          method: 'POST',
          route: { path: '/admin/tenants/:id/config' },
          headers: {},
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_CONFIG',
      }),
    });

    expect((controller as any).svc.updateConfig).not.toHaveBeenCalled();
  });

  it('updates Stripe webhook config for a tenant and writes an audit row', async () => {
    (controller as any).svc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        config: { webhookConfig: {} },
      }),
      updateConfig: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        webhookConfig: {
          stripe: {
            enabled: true,
            webhookSecret: 'whsec_test_123',
            mode: 'test',
            defaultCurrency: 'EUR',
          },
        },
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      admin: {
        adminUserId: 'admin-1',
        subject: 'oidc|alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        roles: ['tenant_admin'],
      },
      method: 'POST',
      route: { path: '/admin/tenants/:id/webhook-config' },
      headers: {},
    };

    const result = await (controller as any).updateWebhookConfig(
      'tenant-1',
      {
        stripe: {
          enabled: true,
          webhookSecret: 'whsec_test_123',
          mode: 'test',
          defaultCurrency: 'EUR',
        },
      },
      req,
    );

    expect((controller as any).svc.updateConfig).toHaveBeenCalledWith(
      'tenant-1',
      {
        webhookConfig: {
          stripe: {
            enabled: true,
            webhookSecret: 'whsec_test_123',
            mode: 'test',
            defaultCurrency: 'EUR',
          },
        },
      },
    );
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual({
      tenant_id: 'tenant-1',
      webhook_config: {
        stripe: {
          enabled: true,
          webhookSecret: 'whsec_test_123',
          mode: 'test',
          defaultCurrency: 'EUR',
        },
      },
    });
  });

  it('merges outbound webhook config without clobbering Stripe config', async () => {
    (controller as any).svc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        config: {
          webhookConfig: {
            stripe: {
              enabled: true,
              webhookSecret: 'whsec_existing_123',
              mode: 'live',
              defaultCurrency: 'EUR',
            },
          },
        },
      }),
      updateConfig: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        webhookConfig: {
          stripe: {
            enabled: true,
            webhookSecret: 'whsec_existing_123',
            mode: 'live',
            defaultCurrency: 'EUR',
          },
          outbound: {
            enabled: true,
            endpoints: [
              {
                id: 'psi-primary',
                url: 'https://psi.internal/uprm/webhooks',
                secret: 'supersecret1',
                eventTypes: ['reward.created', 'wallet.balance.changed'],
              },
            ],
          },
        },
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const result = await (controller as any).updateWebhookConfig(
      'tenant-1',
      {
        outbound: {
          enabled: true,
          endpoints: [
            {
              id: 'psi-primary',
              url: 'https://psi.internal/uprm/webhooks',
              secret: 'supersecret1',
              eventTypes: ['reward.created', 'wallet.balance.changed'],
            },
          ],
        },
      },
      {
        admin: {
          adminUserId: 'admin-2',
          subject: 'local:reviewer',
          email: 'reviewer@example.com',
          displayName: 'Reviewer',
          roles: ['tenant_admin'],
        },
        method: 'POST',
        route: { path: '/admin/tenants/:id/webhook-config' },
        headers: {},
      },
    );

    expect((controller as any).svc.updateConfig).toHaveBeenCalledWith(
      'tenant-1',
      {
        webhookConfig: {
          stripe: {
            enabled: true,
            webhookSecret: 'whsec_existing_123',
            mode: 'live',
            defaultCurrency: 'EUR',
          },
          outbound: {
            enabled: true,
            endpoints: [
              {
                id: 'psi-primary',
                url: 'https://psi.internal/uprm/webhooks',
                secret: 'supersecret1',
                eventTypes: ['reward.created', 'wallet.balance.changed'],
              },
            ],
          },
        },
      },
    );
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result.webhook_config.outbound).toEqual({
      enabled: true,
      endpoints: [
        {
          id: 'psi-primary',
          url: 'https://psi.internal/uprm/webhooks',
          secret: 'supersecret1',
          eventTypes: ['reward.created', 'wallet.balance.changed'],
        },
      ],
    });
  });
});
