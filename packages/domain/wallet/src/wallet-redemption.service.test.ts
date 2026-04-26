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

  it('releases a reserved redemption only once and restores grant balance', async () => {
    db.walletRedemption.findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 'wr-1', status: 'reserved' })
      .mockResolvedValueOnce({ id: 'wr-1', status: 'released' });
    db.walletRedemptionAllocation.findMany.mockResolvedValue([
      {
        redemptionId: 'wr-1',
        walletGrantId: 'g1',
        amountCredits: 300n,
      },
    ]);
    db.walletRedemption.update.mockResolvedValue({ id: 'wr-1', status: 'released' });

    await expect(svc.releaseRedemption('wr-1')).resolves.toEqual({
      id: 'wr-1',
      status: 'released',
    });
    await expect(svc.releaseRedemption('wr-1')).resolves.toEqual({
      id: 'wr-1',
      status: 'released',
    });

    expect(db.walletGrant.update).toHaveBeenCalledTimes(1);
    expect(db.walletGrant.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: {
        amountRemaining: { increment: 300n },
      },
    });
    expect(db.walletRedemption.update).toHaveBeenCalledTimes(1);
  });

  it('does not release grant balance for an already posted redemption', async () => {
    db.walletRedemption.findUnique = vi.fn().mockResolvedValue({ id: 'wr-1', status: 'posted' });

    await expect(svc.releaseRedemption('wr-1')).resolves.toEqual({ id: 'wr-1', status: 'posted' });

    expect(db.walletRedemptionAllocation.findMany).not.toHaveBeenCalled();
    expect(db.walletGrant.update).not.toHaveBeenCalled();
    expect(db.walletRedemption.update).not.toHaveBeenCalled();
  });
});
