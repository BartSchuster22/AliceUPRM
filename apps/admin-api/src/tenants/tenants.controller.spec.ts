import { TenantsController } from './tenants.controller';

describe('TenantsController webhook config', () => {
  let controller: TenantsController;

  beforeEach(() => {
    controller = new TenantsController();
  });

  it('updates Stripe webhook config for a tenant', async () => {
    (controller as any).svc = {
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

    const result = await (controller as any).updateWebhookConfig('tenant-1', {
      stripe: {
        enabled: true,
        webhookSecret: 'whsec_test_123',
        mode: 'test',
        defaultCurrency: 'EUR',
      },
    });

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
