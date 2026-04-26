import { NotFoundException } from '@nestjs/common';
import { FIXED_REWARD_CURRENCY } from '@uprm/rewards';
import { UsersController } from './users.controller';

describe('UsersController balance, profile, subscriptions, promoter status, and payouts', () => {
  let controller: UsersController;

  beforeEach(() => {
    controller = new UsersController();
  });

  it('returns an upstream profile by external user id', async () => {
    (controller as any).svc = {
      getProfileByExternalUserId: jest.fn().mockResolvedValue({
        userId: 'psi-user-1',
        email: 'alice@example.com',
        fullName: 'Alice',
        referralCode: 'ALICE123',
        emailVerified: true,
        userStatus: 'active',
        profileId: null,
        accountType: null,
        companyName: null,
        taxId: null,
        phone: null,
        country: null,
        onboardingState: null,
      }),
    };

    const result = await (controller as any).profileByExternalUserId(
      'psi-user-1',
      {
        uprm: { tenantId: 'tenant-1' },
      },
    );

    expect(
      (controller as any).svc.getProfileByExternalUserId,
    ).toHaveBeenCalledWith('tenant-1', 'psi-user-1');
    expect(result).toEqual({
      userId: 'psi-user-1',
      email: 'alice@example.com',
      fullName: 'Alice',
      referralCode: 'ALICE123',
      emailVerified: true,
      userStatus: 'active',
      profileId: null,
      accountType: null,
      companyName: null,
      taxId: null,
      phone: null,
      country: null,
      onboardingState: null,
    });
  });

  it('raises not found when upstream profile is missing', async () => {
    (controller as any).svc = {
      getProfileByExternalUserId: jest.fn().mockResolvedValue(null),
    };

    await expect(
      (controller as any).profileByExternalUserId('missing-user', {
        uprm: { tenantId: 'tenant-1' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns subscription summaries by external user id', async () => {
    (controller as any).svc = {
      getSubscriptionSummariesByExternalUserId: jest.fn().mockResolvedValue([
        {
          externalSubscriptionId: 'sub_123',
          status: 'active',
          plan: 'product_monthly',
          amountMinor: 4900,
          currency: 'EUR',
          startedAt: '2026-04-25T00:00:00.000Z',
          cancelledAt: null,
        },
      ]),
    };

    const result = await (controller as any).subscriptionsByExternalUserId(
      'psi-user-1',
      {
        uprm: { tenantId: 'tenant-1' },
      },
    );

    expect(
      (controller as any).svc.getSubscriptionSummariesByExternalUserId,
    ).toHaveBeenCalledWith('tenant-1', 'psi-user-1');
    expect(result).toEqual({
      subscriptions: [
        {
          externalSubscriptionId: 'sub_123',
          status: 'active',
          plan: 'product_monthly',
          amountMinor: 4900,
          currency: 'EUR',
          startedAt: '2026-04-25T00:00:00.000Z',
          cancelledAt: null,
        },
      ],
    });
  });

  it('returns an empty subscription list when no upstream subscription exists yet', async () => {
    (controller as any).svc = {
      getSubscriptionSummariesByExternalUserId: jest.fn().mockResolvedValue([]),
    };

    const result = await (controller as any).subscriptionsByExternalUserId(
      'psi-user-1',
      {
        uprm: { tenantId: 'tenant-1' },
      },
    );

    expect(result).toEqual({ subscriptions: [] });
  });

  it('returns formatted balance using the fixed reward credit currency', async () => {
    const tenantUser = { id: 'tu-alice' };
    const tenant = { id: 'tenant-1', baseCurrency: 'EUR' };
    const balance = { balance: -299n };

    (controller as any).svc = {
      getTenantUser: jest.fn().mockResolvedValue(tenantUser),
    };
    (controller as any).tenantSvc = {
      getTenant: jest.fn().mockResolvedValue(tenant),
    };
    (controller as any).balanceSvc = {
      getUserBalance: jest.fn().mockResolvedValue(balance),
    };

    const result = await (controller as any).balance('tu-alice', {
      uprm: { tenantId: 'tenant-1' },
    });

    expect(result).toEqual({
      tenant_user_id: 'tu-alice',
      base_currency: FIXED_REWARD_CURRENCY,
      balance_credits: 299,
      balance_display: '299 Credits',
      balance_as_money: {
        amount_minor: 299,
        formatted: '299 Credits',
      },
    });
  });

  it('defaults a new user source to the current tenant owner when no explicit source user is supplied', async () => {
    (controller as any).svc = {
      findOrCreateTenantUser: jest.fn().mockResolvedValue({
        id: 'tu-new',
        tenantId: 'tenant-1',
        externalUserId: 'alice',
        sourceTenantId: 'tenant-1',
        sourceTenantUserId: 'tenant-owner-1',
      }),
    };
    (controller as any).tenantSvc = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        ownerTenantUserId: 'tenant-owner-1',
      }),
    };

    const result = await (controller as any).create(
      {
        email: 'alice@example.com',
        externalUserId: 'alice',
        username: 'Alice',
      },
      { uprm: { tenantId: 'tenant-1' } },
    );

    expect((controller as any).svc.findOrCreateTenantUser).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        sourceTenantUserId: 'tenant-owner-1',
      }),
    );
    expect(result).toEqual({
      tenant_user: expect.objectContaining({
        sourceTenantUserId: 'tenant-owner-1',
      }),
    });
  });

  it('returns zero balance when the user exists but has no balance account yet', async () => {
    (controller as any).svc = {
      getTenantUser: jest.fn().mockResolvedValue({ id: 'tu-bob' }),
    };
    (controller as any).tenantSvc = {
      getTenant: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' }),
    };
    (controller as any).balanceSvc = {
      getUserBalance: jest.fn().mockResolvedValue(null),
    };

    const result = await (controller as any).balance('tu-bob', {
      uprm: { tenantId: 'tenant-1' },
    });

    expect(result).toEqual({
      tenant_user_id: 'tu-bob',
      base_currency: FIXED_REWARD_CURRENCY,
      balance_credits: 0,
      balance_display: '0 Credits',
      balance_as_money: {
        amount_minor: 0,
        formatted: '0 Credits',
      },
    });
  });

  it('returns promoter status by tenant user id', async () => {
    (controller as any).promoterSvc = {
      getPromoterStatus: jest.fn().mockResolvedValue({
        promoterStatus: 'promoter',
        qualificationSource: 'manual',
        manualOverride: true,
        effectiveFrom: '2026-04-25T00:00:00.000Z',
        effectiveTo: null,
        source: 'profile',
      }),
    };

    const result = await (controller as any).promoterStatus('tu-promoter', {
      uprm: { tenantId: 'tenant-1' },
    });

    expect(
      (controller as any).promoterSvc.getPromoterStatus,
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantUserId: 'tu-promoter',
    });
    expect(result).toEqual({
      tenant_user_id: 'tu-promoter',
      promoter_status: 'promoter',
      qualification_source: 'manual',
      manual_override: true,
      effective_from: '2026-04-25T00:00:00.000Z',
      effective_to: null,
      source: 'profile',
    });
  });

  it('requests a payout and maps the API response', async () => {
    (controller as any).payoutSvc = {
      requestPayout: jest.fn().mockResolvedValue({
        id: 'po-1',
        tenantId: 'tenant-1',
        tenantUserId: 'tu-alice',
        amountMinor: 250n,
        baseCurrency: 'EUR',
        destinationCurrency: 'USD',
        payoutMethod: 'bank_transfer',
        destination: { iban: 'DE123' },
        status: 'requested',
      }),
    };

    const result = await (controller as any).requestPayout(
      'tu-alice',
      {
        amountMinor: 250,
        payoutMethod: 'bank_transfer',
        destination: { iban: 'DE123' },
        destinationCurrency: 'USD',
      },
      { uprm: { tenantId: 'tenant-1' } },
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'po-1',
        tenant_id: 'tenant-1',
        tenant_user_id: 'tu-alice',
        amount_minor: 250,
        base_currency: 'EUR',
        destination_currency: 'USD',
        payout_method: 'bank_transfer',
        status: 'requested',
      }),
    );
  });

  it('lists payouts for a user', async () => {
    (controller as any).payoutSvc = {
      listUserPayouts: jest.fn().mockResolvedValue([
        {
          id: 'po-1',
          tenantId: 'tenant-1',
          tenantUserId: 'tu-alice',
          amountMinor: 250n,
          baseCurrency: 'EUR',
          destinationCurrency: null,
          payoutMethod: 'paypal',
          destination: { email: 'alice@example.com' },
          status: 'requested',
        },
      ]),
    };

    const result = await (controller as any).listPayouts('tu-alice', {
      uprm: { tenantId: 'tenant-1' },
    });

    expect(result).toEqual({
      payouts: [
        expect.objectContaining({
          id: 'po-1',
          amount_minor: 250,
          payout_method: 'paypal',
          status: 'requested',
        }),
      ],
    });
  });
});
