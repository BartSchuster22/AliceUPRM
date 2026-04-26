import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService.createManualAdjustment', () => {
  let service: AdminUsersService;

  beforeEach(() => {
    service = new AdminUsersService();
    (service as any).db = {
      tenantUser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tu-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
        }),
      },
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'tenant-1', baseCurrency: 'credit' }),
      },
    };
    (service as any).accounts = {
      ensureUserBalanceAccount: jest
        .fn()
        .mockResolvedValue({ id: 'user-balance-account' }),
      ensureSystemAccount: jest
        .fn()
        .mockResolvedValue({ id: 'reward-expense-account' }),
    };
    (service as any).postings = {
      postEntry: jest
        .fn()
        .mockResolvedValue({ id: 'entry-1', duplicate: false }),
    };
    (service as any).walletAccounts = {
      ensureAccount: jest.fn().mockResolvedValue({ id: 'wa-1' }),
    };
    (service as any).walletGrants = {
      recordDelta: jest.fn().mockResolvedValue({ id: 'wg-1' }),
    };
  });

  it('dual-writes a positive manual adjustment into the global wallet grants', async () => {
    const result = await service.createManualAdjustment({
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: 250n,
      currency: 'credit',
      reasonCode: 'support_bonus',
      note: 'courtesy',
    });

    expect((service as any).walletAccounts.ensureAccount).toHaveBeenCalledWith({
      userId: 'user-1',
    });
    expect((service as any).walletGrants.recordDelta).toHaveBeenCalledWith({
      walletAccountId: 'wa-1',
      issuerTenantId: 'tenant-1',
      sourceTenantUserId: 'tu-1',
      originType: 'manual_adjustment',
      sourceReferenceType: 'manual_adjustment',
      sourceReferenceId: 'entry-1',
      amountDelta: 250n,
    });
    expect(result.entryId).toBe('entry-1');
  });

  it('dual-writes a negative manual adjustment into the global wallet grants as a negative delta', async () => {
    await service.createManualAdjustment({
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: -125n,
      currency: 'credit',
      reasonCode: 'correction',
    });

    expect((service as any).walletGrants.recordDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        amountDelta: -125n,
        originType: 'manual_adjustment',
      }),
    );
  });
});

describe('AdminUsersService.getUserDetail wallet diagnostics', () => {
  let service: AdminUsersService;

  beforeEach(() => {
    service = new AdminUsersService();
    (service as any).db = {
      tenantUser: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'tu-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            externalUserId: 'alice',
            username: 'Alice',
            tenantStatus: 'active',
            sourceTenantId: null,
            sourceTenantUserId: null,
            joinedAt: new Date('2026-04-01T00:00:00Z'),
            metadata: {},
            user: { emailNormalized: 'alice@example.com', emailVerified: true },
          })
          .mockResolvedValueOnce(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'tenant-1', baseCurrency: 'credit' }),
      },
      promoterProfile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    (service as any).balances = {
      getUserBalance: jest.fn().mockResolvedValue({
        accountId: 'legacy-balance-1',
        accountType: 'user_balance',
        currency: 'credit',
        balance: -299n,
      }),
    };
    (service as any).payouts = {
      listUserPayouts: jest.fn().mockResolvedValue([]),
    };
    (service as any).referrals = {
      getEffectiveReferralChain: jest.fn().mockResolvedValue([]),
    };
    (service as any).walletAccounts = {
      getAccountByUser: jest.fn().mockResolvedValue({
        id: 'wa-1',
        userId: 'user-1',
        currency: 'credit',
        status: 'active',
      }),
    };
    (service as any).walletBalances = {
      getWalletBalance: jest.fn().mockResolvedValue({
        walletAccountId: 'wa-1',
        currency: 'credit',
        balanceCredits: 512n,
      }),
      getIssuerBalanceForWallet: jest.fn().mockResolvedValue({
        walletAccountId: 'wa-1',
        issuerTenantId: 'tenant-1',
        balanceCredits: 299n,
      }),
    };
  });

  it('returns legacy and wallet parity diagnostics together', async () => {
    const result = await service.getUserDetail('tenant-1', 'tu-1');

    expect(
      (service as any).walletAccounts.getAccountByUser,
    ).toHaveBeenCalledWith('user-1');
    expect(
      (service as any).walletBalances.getWalletBalance,
    ).toHaveBeenCalledWith('wa-1');
    expect(
      (service as any).walletBalances.getIssuerBalanceForWallet,
    ).toHaveBeenCalledWith('wa-1', 'tenant-1');
    expect(result.walletDiagnostics).toEqual({
      walletAccount: {
        id: 'wa-1',
        userId: 'user-1',
        currency: 'credit',
        status: 'active',
      },
      globalBalanceCredits: '512',
      issuerBalanceCredits: '299',
      legacyTenantBalanceCredits: '299',
      parityDeltaCredits: '0',
    });
  });
});
