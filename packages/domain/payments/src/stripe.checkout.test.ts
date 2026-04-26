import { describe, expect, it } from 'vitest';

import { buildStripeCheckoutSessionParams } from './stripe.service';

describe('buildStripeCheckoutSessionParams', () => {
  it('builds Stripe checkout params with UPRM-native metadata', () => {
    const params = buildStripeCheckoutSessionParams({
      externalUserId: 'psi-user-1',
      plan: 'product_monthly',
      productName: 'PSI Agent Monthly',
      productDescription: 'Monthly PSI agent access',
      amountMinor: 4900,
      currency: 'EUR',
      billingInterval: 'month',
      successUrl: 'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://aquiero.com/pricing',
      referralCodeUsed: 'REF123',
    });

    expect(params).toMatchObject({
      mode: 'subscription',
      success_url: 'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://aquiero.com/pricing',
      metadata: {
        externalUserId: 'psi-user-1',
        plan: 'product_monthly',
        referralCodeUsed: 'REF123',
      },
    });

    expect(params.line_items).toHaveLength(1);
    expect(params.line_items?.[0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: 'eur',
        recurring: { interval: 'month' },
        unit_amount: 4900,
        product_data: {
          name: 'PSI Agent Monthly',
          description: 'Monthly PSI agent access',
        },
      },
    });
  });

  it('includes wallet redemption metadata and adjusted amount when credits are applied', () => {
    const params = buildStripeCheckoutSessionParams({
      externalUserId: 'psi-user-1',
      plan: 'product_monthly',
      productName: 'PSI Agent Monthly',
      amountMinor: 3700,
      currency: 'EUR',
      billingInterval: 'month',
      successUrl: 'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://aquiero.com/pricing',
      appliedCredits: 1200,
      walletRedemptionId: 'wr-1',
      tenantUserId: 'tenant-user-1',
      userId: 'user-1',
    });

    expect(params.metadata).toEqual({
      externalUserId: 'psi-user-1',
      plan: 'product_monthly',
      appliedCredits: '1200',
      walletRedemptionId: 'wr-1',
      tenantUserId: 'tenant-user-1',
      userId: 'user-1',
    });
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(3700);
  });

  it('omits optional referral code when not provided', () => {
    const params = buildStripeCheckoutSessionParams({
      externalUserId: 'psi-user-2',
      plan: 'product_annual',
      productName: 'PSI Agent Annual',
      amountMinor: 9900,
      currency: 'EUR',
      billingInterval: 'year',
      successUrl: 'https://app.aquiero.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://aquiero.com/pricing',
    });

    expect(params.metadata).toEqual({
      externalUserId: 'psi-user-2',
      plan: 'product_annual',
    });
  });
});
