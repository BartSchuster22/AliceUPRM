import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettlementService } from './settlement.service';

describe('SettlementService', () => {
  let db: any;
  let svc: SettlementService;

  beforeEach(() => {
    db = {
      tenant: { findUnique: vi.fn() },
      settlementCycle: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      ledgerAccount: { findMany: vi.fn() },
      ledgerPosting: { aggregate: vi.fn() },
      scheduledPosting: { findMany: vi.fn() },
    };
    svc = new SettlementService(db);
  });

  it('opens a settlement cycle with a liability snapshot', async () => {
    db.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' });
    db.settlementCycle.findFirst.mockResolvedValue(null);
    db.ledgerAccount.findMany.mockResolvedValue([{ id: 'acct-user-1' }]);
    db.ledgerPosting.aggregate.mockResolvedValue({ _sum: { amount: '-299' } });
    db.scheduledPosting.findMany.mockResolvedValue([
      { payload: { currency: 'EUR', postings: [{ accountId: 'acct-user-1', amount: '-25' }] } },
    ]);
    db.settlementCycle.create.mockResolvedValue({
      id: 'cycle-1',
      tenantId: 'tenant-1',
      currency: 'EUR',
      status: 'open',
      ledgerLiabilityMinor: 299n,
      pendingLiabilityMinor: 25n,
      totalLiabilityMinor: 324n,
    });

    const result = await svc.openCycle({ tenantId: 'tenant-1', adminUserId: 'admin-1', note: 'open it' });

    expect(db.settlementCycle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        currency: 'EUR',
        status: 'open',
        ledgerLiabilityMinor: 299n,
        pendingLiabilityMinor: 25n,
        totalLiabilityMinor: 324n,
        openedByAdminId: 'admin-1',
      }),
    });
    expect(result.totalLiabilityMinor).toBe(324n);
  });

  it('closes an open settlement cycle with a refreshed snapshot', async () => {
    db.settlementCycle.findUnique.mockResolvedValue({
      id: 'cycle-1',
      tenantId: 'tenant-1',
      currency: 'EUR',
      status: 'open',
      note: null,
    });
    db.ledgerAccount.findMany.mockResolvedValue([{ id: 'acct-user-1' }]);
    db.ledgerPosting.aggregate.mockResolvedValue({ _sum: { amount: '-100' } });
    db.scheduledPosting.findMany.mockResolvedValue([]);
    db.settlementCycle.update.mockResolvedValue({
      id: 'cycle-1',
      tenantId: 'tenant-1',
      currency: 'EUR',
      status: 'closed',
      ledgerLiabilityMinor: 100n,
      pendingLiabilityMinor: 0n,
      totalLiabilityMinor: 100n,
    });

    const result = await svc.closeCycle({ id: 'cycle-1', adminUserId: 'admin-1', note: 'closed' });

    expect(db.settlementCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
      data: expect.objectContaining({
        status: 'closed',
        ledgerLiabilityMinor: 100n,
        pendingLiabilityMinor: 0n,
        totalLiabilityMinor: 100n,
        closedByAdminId: 'admin-1',
      }),
    });
    expect(result.status).toBe('closed');
  });
});