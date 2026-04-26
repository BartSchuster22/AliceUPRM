import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  it('applies wallet credits before creating the Stripe checkout session', async () => {
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
    (controller as any).billingCredits = {
      prepareCheckout: jest.fn().mockResolvedValue({
        adjustedAmountMinor: 3700,
        appliedCredits: 1200,
        walletRedemptionId: 'wr-1',
        tenantUserId: 'tenant-user-1',
        userId: 'user-1',
      }),
    };
    (controller as any).payments = {
      createCheckoutSession: jest.fn().mockResolvedValue({
        sessionId: 'cs_test_credits',
        url: 'https://checkout.stripe.com/pay/cs_test_credits',
      }),
    };

    const dto = {
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
      applyCredits: true,
      creditsToUse: 1200,
    };

    const result = await (controller as any).createCheckoutSession(dto, {
      uprm: { tenantId: 'tenant-1' },
    });

    expect(
      (controller as any).billingCredits.prepareCheckout,
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      externalUserId: 'psi-user-1',
      amountMinor: 4900,
      applyCredits: true,
      creditsToUse: 1200,
    });
    expect(
      (controller as any).payments.createCheckoutSession,
    ).toHaveBeenCalledWith({
      externalUserId: 'psi-user-1',
      plan: 'product_monthly',
      productName: 'PSI Agent Monthly',
      productDescription: 'Monthly PSI agent access',
      amountMinor: 3700,
      currency: 'EUR',
      billingInterval: 'month',
      successUrl:
        'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://aquiero.com/pricing',
      appliedCredits: 1200,
      walletRedemptionId: 'wr-1',
      tenantUserId: 'tenant-user-1',
      userId: 'user-1',
    });
    expect(result).toEqual({
      sessionId: 'cs_test_credits',
      url: 'https://checkout.stripe.com/pay/cs_test_credits',
      walletRedemptionId: 'wr-1',
      appliedCredits: 1200,
    });
  });

  it('releases a reserved checkout wallet redemption through the billing API', async () => {
    (controller as any).billingCredits = {
      releaseCheckoutReservation: jest
        .fn()
        .mockResolvedValue({ walletRedemptionId: 'wr-1', status: 'released' }),
    };

    await expect(
      (controller as any).releaseCheckoutReservation(
        { walletRedemptionId: 'wr-1' },
        { uprm: { tenantId: 'tenant-1' } },
      ),
    ).resolves.toEqual({
      walletRedemptionId: 'wr-1',
      status: 'released',
    });

    expect(
      (controller as any).billingCredits.releaseCheckoutReservation,
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      walletRedemptionId: 'wr-1',
    });
  });

  it('returns not found when checkout credit spend cannot resolve the tenant user', async () => {
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
    (controller as any).billingCredits = {
      prepareCheckout: jest
        .fn()
        .mockRejectedValue(new NotFoundException('tenant user not found')),
    };
    (controller as any).payments = {
      createCheckoutSession: jest.fn(),
    };

    await expect(
      (controller as any).createCheckoutSession(
        {
          externalUserId: 'psi-missing',
          plan: 'product_monthly',
          productName: 'PSI Agent Monthly',
          amountMinor: 4900,
          currency: 'EUR',
          billingInterval: 'month',
          successUrl:
            'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://aquiero.com/pricing',
          applyCredits: true,
          creditsToUse: 500,
        },
        { uprm: { tenantId: 'tenant-1' } },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (controller as any).payments.createCheckoutSession,
    ).not.toHaveBeenCalled();
  });

  it('returns bad request when requested credits exceed the available spendable balance', async () => {
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
    (controller as any).billingCredits = {
      prepareCheckout: jest
        .fn()
        .mockRejectedValue(
          new BadRequestException('insufficient credit balance'),
        ),
    };
    (controller as any).payments = {
      createCheckoutSession: jest.fn(),
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
          applyCredits: true,
          creditsToUse: 999999,
        },
        { uprm: { tenantId: 'tenant-1' } },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      (controller as any).payments.createCheckoutSession,
    ).not.toHaveBeenCalled();
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
