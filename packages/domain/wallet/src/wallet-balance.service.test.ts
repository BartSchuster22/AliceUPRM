import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletBalanceService } from './wallet-balance.service';

describe('WalletBalanceService', () => {
  let db: any;
  let svc: WalletBalanceService;

  beforeEach(() => {
    db = {
      walletGrant: {
        aggregate: vi.fn(),
      },
      walletAccount: {
        findFirst: vi.fn(),
      },
    };
    svc = new WalletBalanceService(db);
  });

  it('returns the summed wallet balance for an account', async () => {
    db.walletGrant.aggregate.mockResolvedValue({
      _sum: { amountRemaining: 512n },
    });

    const result = await svc.getWalletBalance('wa-1');

    expect(db.walletGrant.aggregate).toHaveBeenCalledWith({
      where: { walletAccountId: 'wa-1' },
      _sum: { amountRemaining: true },
    });
    expect(result).toEqual({
      walletAccountId: 'wa-1',
      currency: 'credit',
      balanceCredits: 512n,
    });
  });

  it('returns zero when a user has no wallet account yet', async () => {
    db.walletAccount.findFirst.mockResolvedValue(null);

    const result = await svc.getUserWalletBalance('user-1');

    expect(result).toEqual({
      walletAccountId: null,
      currency: 'credit',
      balanceCredits: 0n,
    });
  });

  it('returns issuer-scoped residual balance for parity diagnostics', async () => {
    db.walletGrant.aggregate.mockResolvedValue({
      _sum: { amountRemaining: 299n },
    });

    const result = await svc.getIssuerBalanceForWallet('wa-1', 'tenant-1');

    expect(db.walletGrant.aggregate).toHaveBeenCalledWith({
      where: { walletAccountId: 'wa-1', issuerTenantId: 'tenant-1' },
      _sum: { amountRemaining: true },
    });
    expect(result).toEqual({
      walletAccountId: 'wa-1',
      issuerTenantId: 'tenant-1',
      balanceCredits: 299n,
    });
  });
});
