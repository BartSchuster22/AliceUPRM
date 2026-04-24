import { PayoutsController } from './payouts.controller';

describe('PayoutsController', () => {
  let controller: PayoutsController;

  beforeEach(() => {
    controller = new PayoutsController();
  });

  it('maps approve responses into API shape and writes an audit row', async () => {
    (controller as any).svc = {
      getPayout: jest
        .fn()
        .mockResolvedValue({ id: 'po-1', tenantId: 'tenant-1' }),
      approvePayout: jest.fn().mockResolvedValue({
        id: 'po-1',
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        amountMinor: 250n,
        baseCurrency: 'EUR',
        destinationCurrency: 'USD',
        payoutMethod: 'bank_transfer',
        destination: { iban: 'DE123' },
        status: 'approved',
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const result = await controller.approve('po-1', {
      admin: {
        adminUserId: 'admin-1',
        subject: 'oidc|alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        roles: ['tenant_admin'],
      },
      method: 'POST',
      route: { path: '/admin/payouts/:id/approve' },
      headers: {},
    } as any);

    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 'po-1',
        tenant_id: 'tenant-1',
        tenant_user_id: 'tu-1',
        amount_minor: 250,
        base_currency: 'EUR',
        destination_currency: 'USD',
        payout_method: 'bank_transfer',
        status: 'approved',
      }),
    );
  });
});
