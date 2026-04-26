import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletRedemptionService } from './wallet-redemption.service';

describe('WalletRedemptionService', () => {
  let db: any;
  let svc: WalletRedemptionService;

  beforeEach(() => {
    db = {
      walletGrant: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      walletRedemption: {
        create: vi.fn(),
        update: vi.fn(),
      },
      walletRedemptionAllocation: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };
    svc = new WalletRedemptionService(db);
  });

  it('creates a reserved redemption and allocation records', async () => {
    db.walletGrant.findMany.mockResolvedValue([
      {
        id: 'g1',
        issuerTenantId: 'tenant-1',
        amountRemaining: 500n,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      },
    ]);
    db.walletRedemption.create.mockResolvedValue({ id: 'wr-1' });

    const result = await svc.reserveRedemption({
      walletAccountId: 'wa-1',
      spendingTenantId: 'tenant-2',
      amountCredits: 300n,
    });

    expect(db.walletRedemption.create).toHaveBeenCalled();
    expect(db.walletRedemptionAllocation.create).toHaveBeenCalledWith({
      data: {
        redemptionId: 'wr-1',
        walletGrantId: 'g1',
        issuerTenantId: 'tenant-1',
        amountCredits: 300n,
      },
    });
    expect(result.allocations).toEqual([
      { walletGrantId: 'g1', issuerTenantId: 'tenant-1', amountCredits: 300n },
    ]);
  });
});
