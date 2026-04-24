import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@uprm/db';
import { AccountService } from './account.service';
import { PostingService } from './posting.service';
import { BalanceService } from './balance.service';
import { LedgerError } from './errors';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

async function wipeLedger(tenantId: string) {
  await prisma.ledgerPosting.deleteMany({
    where: { entry: { tenantId } },
  });
  await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
  await prisma.ledgerAccount.deleteMany({ where: { tenantId } });
}

describe('ledger integration — real Postgres', () => {
  const accounts = new AccountService();
  const postings = new PostingService();
  const balances = new BalanceService();

  beforeAll(async () => {
    await wipeLedger(TENANT_ID);
  });

  afterAll(async () => {
    await wipeLedger(TENANT_ID);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await wipeLedger(TENANT_ID);
  });

  it('provisions tenant accounts idempotently', async () => {
    const first = await accounts.provisionTenantAccounts(TENANT_ID, 'EUR');
    expect(first.length).toBe(3);

    const second = await accounts.provisionTenantAccounts(TENANT_ID, 'EUR');
    expect(second.map((a) => a.id).sort()).toEqual(first.map((a) => a.id).sort());
  });

  it('posts a balanced entry and updates balances correctly', async () => {
    const [cash, revenue] = await accounts.provisionTenantAccounts(TENANT_ID, 'EUR');

    const result = await postings.postEntry({
      tenantId: TENANT_ID,
      currency: 'EUR',
      description: 'Bob pays €29.99',
      idempotencyKey: 'integ-bob-pay-001',
      postings: [
        { accountId: cash.id, amount: 2999n },
        { accountId: revenue.id, amount: -2999n },
      ],
    });
    expect(result.duplicate).toBe(false);

    const cashBalance = await balances.getAccountBalance(cash.id);
    const revBalance = await balances.getAccountBalance(revenue.id);
    expect(cashBalance?.balance).toBe(2999n);
    expect(revBalance?.balance).toBe(-2999n);
  });

  it('refuses to commit an unbalanced entry (server-side guard)', async () => {
    const [cash, revenue] = await accounts.provisionTenantAccounts(TENANT_ID, 'EUR');

    await expect(
      postings.postEntry({
        tenantId: TENANT_ID,
        currency: 'EUR',
        description: 'unbalanced',
        idempotencyKey: 'integ-bad-001',
        postings: [
          { accountId: cash.id, amount: 2999n },
          { accountId: revenue.id, amount: -2500n },
        ],
      }),
    ).rejects.toBeInstanceOf(LedgerError);

    const cashBalance = await balances.getAccountBalance(cash.id);
    expect(cashBalance?.balance).toBe(0n);
  });

  it('is idempotent: same idempotencyKey returns the same entry id', async () => {
    const [cash, revenue] = await accounts.provisionTenantAccounts(TENANT_ID, 'EUR');

    const first = await postings.postEntry({
      tenantId: TENANT_ID,
      currency: 'EUR',
      description: 'idempotent bob',
      idempotencyKey: 'integ-idem-001',
      postings: [
        { accountId: cash.id, amount: 5000n },
        { accountId: revenue.id, amount: -5000n },
      ],
    });
    const second = await postings.postEntry({
      tenantId: TENANT_ID,
      currency: 'EUR',
      description: 'idempotent bob',
      idempotencyKey: 'integ-idem-001',
      postings: [
        { accountId: cash.id, amount: 5000n },
        { accountId: revenue.id, amount: -5000n },
      ],
    });
    expect(second.id).toBe(first.id);
    expect(second.duplicate).toBe(true);

    const cashBalance = await balances.getAccountBalance(cash.id);
    expect(cashBalance?.balance).toBe(5000n);
  });

  it('enforces per-tenant account isolation', async () => {
    await accounts.provisionTenantAccounts(TENANT_ID, 'EUR');
    const otherTenant = '00000000-0000-0000-0000-000000000099';
    await accounts.provisionTenantAccounts(otherTenant, 'EUR');

    const psiCash = (
      await prisma.ledgerAccount.findFirstOrThrow({
        where: { tenantId: TENANT_ID, accountType: 'tenant_cash' },
      })
    ).id;
    const otherRev = (
      await prisma.ledgerAccount.findFirstOrThrow({
        where: { tenantId: otherTenant, accountType: 'tenant_revenue' },
      })
    ).id;

    try {
      await expect(
        postings.postEntry({
          tenantId: TENANT_ID,
          currency: 'EUR',
          description: 'cross tenant attack',
          idempotencyKey: 'integ-xt-001',
          postings: [
            { accountId: psiCash, amount: 1000n },
            { accountId: otherRev, amount: -1000n },
          ],
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_CROSS_TENANT' });
    } finally {
      await prisma.ledgerPosting.deleteMany({ where: { entry: { tenantId: otherTenant } } });
      await prisma.ledgerEntry.deleteMany({ where: { tenantId: otherTenant } });
      await prisma.ledgerAccount.deleteMany({ where: { tenantId: otherTenant } });
    }
  });

  it('handles multi-currency: EUR and USD coexist', async () => {
    await accounts.provisionTenantAccounts(TENANT_ID, 'EUR');
    await accounts.provisionTenantAccounts(TENANT_ID, 'USD');

    const eurCash = (
      await prisma.ledgerAccount.findFirstOrThrow({
        where: { tenantId: TENANT_ID, accountType: 'tenant_cash', currency: 'EUR' },
      })
    ).id;
    const eurRev = (
      await prisma.ledgerAccount.findFirstOrThrow({
        where: { tenantId: TENANT_ID, accountType: 'tenant_revenue', currency: 'EUR' },
      })
    ).id;
    const usdCash = (
      await prisma.ledgerAccount.findFirstOrThrow({
        where: { tenantId: TENANT_ID, accountType: 'tenant_cash', currency: 'USD' },
      })
    ).id;
    const usdRev = (
      await prisma.ledgerAccount.findFirstOrThrow({
        where: { tenantId: TENANT_ID, accountType: 'tenant_revenue', currency: 'USD' },
      })
    ).id;

    await postings.postEntry({
      tenantId: TENANT_ID,
      currency: 'EUR',
      description: 'EUR sale',
      idempotencyKey: 'integ-mc-eur-001',
      postings: [
        { accountId: eurCash, amount: 1000n },
        { accountId: eurRev, amount: -1000n },
      ],
    });

    await postings.postEntry({
      tenantId: TENANT_ID,
      currency: 'USD',
      description: 'USD sale',
      idempotencyKey: 'integ-mc-usd-001',
      postings: [
        { accountId: usdCash, amount: 2500n },
        { accountId: usdRev, amount: -2500n },
      ],
    });

    expect((await balances.getAccountBalance(eurCash))?.balance).toBe(1000n);
    expect((await balances.getAccountBalance(usdCash))?.balance).toBe(2500n);
  });

  it('creates user_balance account on demand (idempotent)', async () => {
    const acc = await accounts.ensureUserBalanceAccount({
      tenantId: TENANT_ID,
      tenantUserId: '22222222-2222-2222-2222-222222222222',
      currency: 'EUR',
    });
    expect(acc.accountType).toBe('user_balance');

    const again = await accounts.ensureUserBalanceAccount({
      tenantId: TENANT_ID,
      tenantUserId: '22222222-2222-2222-2222-222222222222',
      currency: 'EUR',
    });
    expect(again.id).toBe(acc.id);
  });
});
