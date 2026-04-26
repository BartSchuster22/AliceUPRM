import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletAccountService } from './wallet-account.service';

describe('WalletAccountService', () => {
  let db: any;
  let svc: WalletAccountService;

  beforeEach(() => {
    db = {
      walletAccount: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };
    svc = new WalletAccountService(db);
  });

  it('creates a global credit wallet if none exists', async () => {
    db.walletAccount.findFirst.mockResolvedValue(null);
    db.walletAccount.create.mockResolvedValue({ id: 'wa-1', userId: 'user-1', currency: 'credit' });

    const result = await svc.ensureAccount({ userId: 'user-1' });

    expect(db.walletAccount.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', currency: 'credit', status: 'active' },
    });
    expect(result.id).toBe('wa-1');
  });

  it('returns the existing wallet if already provisioned', async () => {
    db.walletAccount.findFirst.mockResolvedValue({
      id: 'wa-1',
      userId: 'user-1',
      currency: 'credit',
    });

    const result = await svc.ensureAccount({ userId: 'user-1' });

    expect(db.walletAccount.create).not.toHaveBeenCalled();
    expect(result.id).toBe('wa-1');
  });
});
