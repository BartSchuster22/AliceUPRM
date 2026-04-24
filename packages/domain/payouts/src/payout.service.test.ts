import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayoutError, PayoutService } from './payout.service';

describe('PayoutService', () => {
  let db: any;
  let svc: PayoutService;

  beforeEach(() => {
    db = {
      payoutRequest: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      tenantUser: {
        findFirst: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn(),
      },
    };
    svc = new PayoutService(db);
  });

  it('creates a payout request and reserves balance into payout_payable', async () => {
    db.tenantUser.findFirst.mockResolvedValue({ id: 'tu-1' });
    db.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' });
    db.payoutRequest.create.mockResolvedValue({
      id: 'po-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: 250n,
      baseCurrency: 'EUR',
      destinationCurrency: 'USD',
      payoutMethod: 'bank_transfer',
      destination: { iban: 'DE123' },
      status: 'requested',
    });

    (svc as any).balances = {
      getUserBalance: vi.fn().mockResolvedValue({ balance: -500n }),
    };
    (svc as any).accounts = {
      ensureSystemAccount: vi.fn().mockResolvedValue({ id: 'payable-account' }),
      ensureUserBalanceAccount: vi.fn().mockResolvedValue({ id: 'user-balance-account' }),
    };
    (svc as any).postings = {
      postEntry: vi.fn().mockResolvedValue({ id: 'entry-1', duplicate: false }),
    };

    const result = await svc.requestPayout({
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: 250n,
      payoutMethod: 'bank_transfer',
      destination: { iban: 'DE123' },
      destinationCurrency: 'USD',
    });

    expect((svc as any).postings.postEntry).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      currency: 'EUR',
      description: 'Reserve payout request po-1',
      idempotencyKey: 'payout-request:po-1',
      sourceEventId: undefined,
      postings: [
        { accountId: 'payable-account', amount: -250n },
        { accountId: expect.any(String), amount: 250n },
      ],
    });
    expect(result.status).toBe('requested');
  });

  it('rejects payout requests that exceed available balance', async () => {
    db.tenantUser.findFirst.mockResolvedValue({ id: 'tu-1' });
    db.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' });
    (svc as any).balances = {
      getUserBalance: vi.fn().mockResolvedValue({ balance: -100n }),
    };

    await expect(
      svc.requestPayout({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        amountMinor: 250n,
        payoutMethod: 'bank_transfer',
        destination: { iban: 'DE123' },
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  it('marks an approved payout as sent and moves payable into tenant_cash', async () => {
    db.payoutRequest.findUnique.mockResolvedValue({
      id: 'po-2',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: 250n,
      baseCurrency: 'EUR',
      status: 'approved',
    });
    db.payoutRequest.update.mockResolvedValue({ id: 'po-2', status: 'sent' });
    (svc as any).accounts = {
      ensureSystemAccount: vi.fn().mockImplementation(({ accountType }: any) => {
        if (accountType === 'tenant_cash') return Promise.resolve({ id: 'cash-account' });
        return Promise.resolve({ id: 'payable-account' });
      }),
    };
    (svc as any).postings = {
      postEntry: vi.fn().mockResolvedValue({ id: 'entry-2', duplicate: false }),
    };

    const result = await svc.markSent('po-2');

    expect((svc as any).postings.postEntry).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      currency: 'EUR',
      description: 'Execute payout po-2',
      idempotencyKey: 'payout-sent:po-2',
      sourceEventId: undefined,
      postings: [
        { accountId: 'cash-account', amount: -250n },
        { accountId: 'payable-account', amount: 250n },
      ],
    });
    expect(result.status).toBe('sent');
  });

  it('fails a requested payout and releases funds back to user_balance', async () => {
    db.payoutRequest.findUnique.mockResolvedValue({
      id: 'po-3',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: 250n,
      baseCurrency: 'EUR',
      status: 'requested',
    });
    db.payoutRequest.update.mockResolvedValue({ id: 'po-3', status: 'failed' });
    (svc as any).accounts = {
      ensureSystemAccount: vi.fn().mockResolvedValue({ id: 'payable-account' }),
      ensureUserBalanceAccount: vi.fn().mockResolvedValue({ id: 'user-balance-account' }),
    };
    (svc as any).postings = {
      postEntry: vi.fn().mockResolvedValue({ id: 'entry-3', duplicate: false }),
    };

    const result = await svc.failPayout('po-3', 'bank rejected');

    expect((svc as any).postings.postEntry).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      currency: 'EUR',
      description: 'Release payout po-3',
      idempotencyKey: 'payout-failed:po-3',
      sourceEventId: undefined,
      postings: [
        { accountId: 'payable-account', amount: 250n },
        { accountId: 'user-balance-account', amount: -250n },
      ],
    });
    expect(result.status).toBe('failed');
  });

  it('cancels a requested payout and releases funds back to user_balance', async () => {
    db.payoutRequest.findUnique.mockResolvedValue({
      id: 'po-4',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: 150n,
      baseCurrency: 'EUR',
      status: 'requested',
    });
    db.payoutRequest.update.mockResolvedValue({ id: 'po-4', status: 'cancelled' });
    (svc as any).accounts = {
      ensureSystemAccount: vi.fn().mockResolvedValue({ id: 'payable-account' }),
      ensureUserBalanceAccount: vi.fn().mockResolvedValue({ id: 'user-balance-account' }),
    };
    (svc as any).postings = {
      postEntry: vi.fn().mockResolvedValue({ id: 'entry-4', duplicate: false }),
    };

    const result = await svc.cancelPayout('po-4');

    expect(result.status).toBe('cancelled');
  });

  it('rejects terminal transitions from invalid statuses', async () => {
    db.payoutRequest.findUnique.mockResolvedValue({
      id: 'po-5',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      amountMinor: 100n,
      baseCurrency: 'EUR',
      status: 'sent',
    });

    await expect(svc.cancelPayout('po-5')).rejects.toBeInstanceOf(PayoutError);
  });
});
