import { describe, expect, it, vi } from 'vitest';
import { AccountService } from './account.service';

describe('AccountService currency validation', () => {
  function makeDb() {
    return {
      ledgerAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: any) => ({ id: 'acc-1', ...data })),
      },
    } as any;
  }

  it('accepts fixed credit currency for system accounts', async () => {
    const db = makeDb();
    const svc = new AccountService(db);

    await expect(
      svc.ensureSystemAccount({
        tenantId: 'tenant-1',
        accountType: 'tenant_reward_expense',
        currency: 'credit',
      }),
    ).resolves.toMatchObject({ currency: 'credit' });
  });

  it('accepts fixed credit currency for user balance accounts', async () => {
    const db = makeDb();
    const svc = new AccountService(db);

    await expect(
      svc.ensureUserBalanceAccount({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        currency: 'credit',
      }),
    ).resolves.toMatchObject({ currency: 'credit' });
  });

  it('still rejects invalid non-ISO/non-credit currency strings', async () => {
    const svc = new AccountService(makeDb());

    await expect(
      svc.ensureUserBalanceAccount({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        currency: 'credits',
      }),
    ).rejects.toMatchObject({ code: 'BAD_CURRENCY' });
  });
});
