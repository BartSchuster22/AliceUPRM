import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService.createManualAdjustment', () => {
  let service: AdminUsersService;

  beforeEach(() => {
    service = new AdminUsersService();
    (service as any).db = {
      tenantUser: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
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
