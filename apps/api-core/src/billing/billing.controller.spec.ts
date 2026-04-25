import { BillingController } from './billing.controller';

describe('BillingController checkout sessions', () => {
  let controller: BillingController;

  beforeEach(() => {
    controller = new BillingController();
  });

  it('creates a checkout session for the authenticated tenant with raw pricing fields', async () => {
    (controller as any).tenantSvc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        baseCurrency: 'EUR',
        config: {
          webhookConfig: { stripe: { enabled: true, defaultCurrency: 'EUR' } },
        },
      }),
      getCheckoutProduct: jest.fn(),
    };
    (controller as any).payments = {
      createCheckoutSession: jest.fn().mockResolvedValue({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      }),
    };

    const result = await (controller as any).createCheckoutSession(
      {
        externalUserId: 'psi-user-1',
        plan: 'product_monthly',
        productName: 'PSI Agent Monthly',
        productDescription: 'Monthly PSI agent access',
        amountMinor: 4900,
        currency: 'EUR',
        billingInterval: 'month',
        successUrl:
          'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://aquiero.com/pricing',
      },
      { uprm: { tenantId: 'tenant-1' } },
    );

    expect(
      (controller as any).payments.createCheckoutSession,
    ).toHaveBeenCalledWith({
      externalUserId: 'psi-user-1',
      plan: 'product_monthly',
      productName: 'PSI Agent Monthly',
      productDescription: 'Monthly PSI agent access',
      amountMinor: 4900,
      currency: 'EUR',
      billingInterval: 'month',
      successUrl:
        'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://aquiero.com/pricing',
    });
    expect(result).toEqual({
      sessionId: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    });
  });

  it('creates a checkout session from a registered productRef', async () => {
    (controller as any).tenantSvc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        baseCurrency: 'EUR',
        config: {
          webhookConfig: { stripe: { enabled: true, defaultCurrency: 'EUR' } },
        },
      }),
      getCheckoutProduct: jest.fn().mockResolvedValue({
        ref: 'cai-pro-monthly',
        name: 'CAI Pro Monthly',
        plan: 'cai_pro_monthly',
        productDescription: 'Hosted CAI Pro plan',
        amountMinor: 4900,
        currency: 'EUR',
        billingInterval: 'month',
        active: true,
      }),
    };
    (controller as any).payments = {
      createCheckoutSession: jest.fn().mockResolvedValue({
        sessionId: 'cs_test_456',
        url: 'https://checkout.stripe.com/pay/cs_test_456',
      }),
    };

    const result = await (controller as any).createCheckoutSession(
      {
        externalUserId: 'psi-user-1',
        productRef: 'cai-pro-monthly',
        successUrl:
          'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://aquiero.com/pricing',
      },
      { uprm: { tenantId: 'tenant-1' } },
    );

    expect(
      (controller as any).tenantSvc.getCheckoutProduct,
    ).toHaveBeenCalledWith('tenant-1', 'cai-pro-monthly');
    expect(
      (controller as any).payments.createCheckoutSession,
    ).toHaveBeenCalledWith({
      externalUserId: 'psi-user-1',
      plan: 'cai_pro_monthly',
      productName: 'CAI Pro Monthly',
      productDescription: 'Hosted CAI Pro plan',
      amountMinor: 4900,
      currency: 'EUR',
      billingInterval: 'month',
      successUrl:
        'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://aquiero.com/pricing',
    });
    expect(result).toEqual({
      sessionId: 'cs_test_456',
      url: 'https://checkout.stripe.com/pay/cs_test_456',
    });
  });

  it('returns a conflict when stripe checkout provider is not configured', async () => {
    (controller as any).tenantSvc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        baseCurrency: 'EUR',
        config: {
          webhookConfig: { stripe: { enabled: true, defaultCurrency: 'EUR' } },
        },
      }),
      getCheckoutProduct: jest.fn(),
    };
    (controller as any).payments = {
      createCheckoutSession: jest
        .fn()
        .mockRejectedValue(new Error('STRIPE_SECRET_KEY is required')),
    };

    await expect(
      (controller as any).createCheckoutSession(
        {
          externalUserId: 'psi-user-1',
          plan: 'product_monthly',
          productName: 'PSI Agent Monthly',
          amountMinor: 4900,
          currency: 'EUR',
          billingInterval: 'month',
          successUrl:
            'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://aquiero.com/pricing',
        },
        { uprm: { tenantId: 'tenant-1' } },
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'stripe checkout provider is not configured',
      },
    });
  });
});
