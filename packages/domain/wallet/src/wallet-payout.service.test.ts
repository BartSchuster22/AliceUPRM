import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletPayoutService } from './wallet-payout.service';

describe('WalletPayoutService', () => {
  let db: any;
  let svc: WalletPayoutService;

  beforeEach(() => {
    db = {
      walletGrant: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      walletPayoutReservation: {
        create: vi.fn(),
        update: vi.fn(),
      },
      walletPayoutAllocation: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };
    svc = new WalletPayoutService(db);
  });

  it('creates a payout reservation and allocations', async () => {
    db.walletGrant.findMany.mockResolvedValue([
      {
        id: 'g1',
        issuerTenantId: 'tenant-1',
        amountRemaining: 400n,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      },
    ]);
    db.walletPayoutReservation.create.mockResolvedValue({ id: 'wpr-1' });

    const result = await svc.reservePayout({
      walletAccountId: 'wa-1',
      payoutRequestId: 'po-1',
      amountCredits: 250n,
    });

    expect(db.walletPayoutAllocation.create).toHaveBeenCalledWith({
      data: {
        walletPayoutReservationId: 'wpr-1',
        walletGrantId: 'g1',
        issuerTenantId: 'tenant-1',
        amountCredits: 250n,
      },
    });
    expect(result.reservation.id).toBe('wpr-1');
  });
});
