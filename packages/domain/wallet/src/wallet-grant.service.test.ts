import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletGrantService } from './wallet-grant.service';

describe('WalletGrantService', () => {
  let db: any;
  let svc: WalletGrantService;

  beforeEach(() => {
    db = {
      walletGrant: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };
    svc = new WalletGrantService(db);
  });

  it('creates a grant with full amountRemaining', async () => {
    db.walletGrant.create.mockResolvedValue({ id: 'wg-1', amountRemaining: 1000n });

    await svc.createGrant({
      walletAccountId: 'wa-1',
      issuerTenantId: 'tenant-1',
      originType: 'reward',
      amountIssued: 1000n,
    });

    expect(db.walletGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletAccountId: 'wa-1',
        issuerTenantId: 'tenant-1',
        originType: 'reward',
        amountIssued: 1000n,
        amountRemaining: 1000n,
      }),
    });
  });

  it('rejects non-positive grant amounts', async () => {
    await expect(
      svc.createGrant({
        walletAccountId: 'wa-1',
        originType: 'reward',
        amountIssued: 0n,
      }),
    ).rejects.toThrow('amountIssued must be positive');
  });
});
