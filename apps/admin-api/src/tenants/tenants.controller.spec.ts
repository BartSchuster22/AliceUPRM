import { TenantsController } from './tenants.controller';

describe('TenantsController webhook config', () => {
  let controller: TenantsController;

  beforeEach(() => {
    controller = new TenantsController();
  });

  it('lists tenants for the admin shell switcher', async () => {
    (controller as any).svc = {
      listTenants: jest
        .fn()
        .mockResolvedValue([{ id: 'tenant-1', slug: 'psi' }]),
    };

    await expect(controller.list()).resolves.toEqual([
      { id: 'tenant-1', slug: 'psi' },
    ]);
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
});
