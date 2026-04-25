import { ProductsController } from './products.controller';

describe('ProductsController register', () => {
  let controller: ProductsController;

  beforeEach(() => {
    controller = new ProductsController();
  });

  it('registers a checkout product for the authenticated tenant', async () => {
    (controller as any).tenantSvc = {
      registerCheckoutProduct: jest.fn().mockResolvedValue({
        ref: 'cai-pro-monthly',
        name: 'CAI Pro Monthly',
        plan: 'cai_pro_monthly',
        amountMinor: 4900,
        currency: 'EUR',
        billingInterval: 'month',
        active: true,
      }),
    };

    const result = await (controller as any).register(
      {
        ref: 'cai-pro-monthly',
        name: 'CAI Pro Monthly',
        plan: 'cai_pro_monthly',
        amountMinor: 4900,
        currency: 'EUR',
        billingInterval: 'month',
      },
      { uprm: { tenantId: 'tenant-1' } },
    );

    expect(
      (controller as any).tenantSvc.registerCheckoutProduct,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        ref: 'cai-pro-monthly',
        name: 'CAI Pro Monthly',
        plan: 'cai_pro_monthly',
        amountMinor: 4900,
        currency: 'EUR',
        billingInterval: 'month',
        active: true,
      }),
    );
    expect(result).toEqual({
      product: expect.objectContaining({
        ref: 'cai-pro-monthly',
      }),
    });
  });
});
