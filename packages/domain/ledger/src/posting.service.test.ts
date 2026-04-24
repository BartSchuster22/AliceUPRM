import { describe, it, expect, vi } from 'vitest';
import { PostingService } from './posting.service';
import { LedgerError } from './errors';

// We use vi.mocked to stub only the bits we need. The validation logic
// runs before any DB call, so most tests never touch the fake DB.
function makeFakeDb() {
  return {
    ledgerEntry: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: 'entry-new', ...data })),
    },
    ledgerAccount: {
      findMany: vi.fn(async () => []),
    },
    ledgerPosting: {
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn: any) =>
      fn({
        ledgerEntry: { create: vi.fn(async ({ data }: any) => ({ id: 'entry-new', ...data })) },
        ledgerPosting: { createMany: vi.fn(async () => ({ count: 0 })) },
      }),
    ),
  } as any;
}

describe('PostingService.postEntry — validation', () => {
  it('rejects unbalanced entries', async () => {
    const svc = new PostingService(makeFakeDb());
    await expect(
      svc.postEntry({
        tenantId: 't1',
        currency: 'EUR',
        description: 'bad',
        idempotencyKey: 'idem-1234',
        postings: [
          { accountId: 'a', amount: 1000n },
          { accountId: 'b', amount: 500n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'UNBALANCED_ENTRY' });
  });

  it('rejects entries with fewer than 2 postings', async () => {
    const svc = new PostingService(makeFakeDb());
    await expect(
      svc.postEntry({
        tenantId: 't1',
        currency: 'EUR',
        description: 'only one',
        idempotencyKey: 'idem-1234',
        postings: [{ accountId: 'a', amount: 0n }],
      }),
    ).rejects.toMatchObject({ code: 'TOO_FEW_POSTINGS' });
  });

  it('rejects non-bigint amounts', async () => {
    const svc = new PostingService(makeFakeDb());
    await expect(
      svc.postEntry({
        tenantId: 't1',
        currency: 'EUR',
        description: 'bad type',
        idempotencyKey: 'idem-1234',
        postings: [
          { accountId: 'a', amount: 1000 as any }, // number instead of bigint
          { accountId: 'b', amount: -1000n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_AMOUNT_TYPE' });
  });

  it('rejects invalid currency codes', async () => {
    const svc = new PostingService(makeFakeDb());
    await expect(
      svc.postEntry({
        tenantId: 't1',
        currency: 'eur',
        description: 'bad currency',
        idempotencyKey: 'idem-1234',
        postings: [
          { accountId: 'a', amount: 1000n },
          { accountId: 'b', amount: -1000n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_CURRENCY' });
  });

  it('rejects short idempotency keys', async () => {
    const svc = new PostingService(makeFakeDb());
    await expect(
      svc.postEntry({
        tenantId: 't1',
        currency: 'EUR',
        description: 'short key',
        idempotencyKey: 'short',
        postings: [
          { accountId: 'a', amount: 1000n },
          { accountId: 'b', amount: -1000n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_IDEMPOTENCY_KEY' });
  });

  it('returns duplicate: true when idempotency key already exists', async () => {
    const db = makeFakeDb();
    db.ledgerEntry.findUnique = vi.fn(async () => ({ id: 'existing-entry-id' }));

    const svc = new PostingService(db);
    const result = await svc.postEntry({
      tenantId: 't1',
      currency: 'EUR',
      description: 'dupe',
      idempotencyKey: 'idem-already-used',
      postings: [
        { accountId: 'a', amount: 1000n },
        { accountId: 'b', amount: -1000n },
      ],
    });
    expect(result).toEqual({ id: 'existing-entry-id', duplicate: true });
  });

  it('rejects accounts from the wrong tenant', async () => {
    const db = makeFakeDb();
    db.ledgerAccount.findMany = vi.fn(async () => [
      { id: 'a', tenantId: 't2', currency: 'EUR', status: 'active' },
      { id: 'b', tenantId: 't1', currency: 'EUR', status: 'active' },
    ]);

    const svc = new PostingService(db);
    await expect(
      svc.postEntry({
        tenantId: 't1',
        currency: 'EUR',
        description: 'cross tenant',
        idempotencyKey: 'idem-xt-0001',
        postings: [
          { accountId: 'a', amount: 1000n },
          { accountId: 'b', amount: -1000n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CROSS_TENANT' });
  });

  it('rejects entries where account currency does not match', async () => {
    const db = makeFakeDb();
    db.ledgerAccount.findMany = vi.fn(async () => [
      { id: 'a', tenantId: 't1', currency: 'USD', status: 'active' },
      { id: 'b', tenantId: 't1', currency: 'EUR', status: 'active' },
    ]);

    const svc = new PostingService(db);
    await expect(
      svc.postEntry({
        tenantId: 't1',
        currency: 'EUR',
        description: 'mixed currencies',
        idempotencyKey: 'idem-mix-0001',
        postings: [
          { accountId: 'a', amount: 1000n },
          { accountId: 'b', amount: -1000n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CURRENCY_MISMATCH' });
  });
});
