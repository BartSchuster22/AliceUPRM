import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXED_REWARD_CURRENCY } from '@uprm/rewards';
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
      walletPayoutReservation: {
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
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

  it('creates a payout request and reserves funds from the global wallet', async () => {
    db.tenantUser.findFirst.mockResolvedValue({
      id: 'tu-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    db.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' });
    db.payoutRequest.create.mockResolvedValue({
      id: 'po-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      userId: 'user-1',
      walletAccountId: 'wa-1',
      amountMinor: 250n,
      amountCredits: 250n,
      baseCurrency: FIXED_REWARD_CURRENCY,
      destinationCurrency: 'USD',
      payoutMethod: 'bank_transfer',
      destination: { iban: 'DE123' },
      status: 'requested',
    });
    db.payoutRequest.update.mockResolvedValue({
      id: 'po-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      userId: 'user-1',
      walletAccountId: 'wa-1',
      amountMinor: 250n,
      amountCredits: 250n,
      baseCurrency: FIXED_REWARD_CURRENCY,
      destinationCurrency: 'USD',
      payoutMethod: 'bank_transfer',
      destination: { iban: 'DE123' },
      issuerBreakdownJson: [
        { issuerTenantId: 'tenant-1', walletGrantId: 'g1', amountCredits: '250' },
      ],
      status: 'requested',
    });
    db.walletPayoutReservation.update.mockResolvedValue({ id: 'wpr-1' });

    (svc as any).walletAccounts = {
      ensureAccount: vi.fn().mockResolvedValue({ id: 'wa-1', userId: 'user-1' }),
    };
    (svc as any).walletBalances = {
      getWalletBalance: vi.fn().mockResolvedValue({
        walletAccountId: 'wa-1',
        currency: 'credit',
        balanceCredits: 500n,
      }),
    };
    (svc as any).walletPayouts = {
      reservePayout: vi.fn().mockResolvedValue({
        reservation: { id: 'wpr-1', payoutRequestId: 'po-1', status: 'reserved' },
        allocations: [{ walletGrantId: 'g1', issuerTenantId: 'tenant-1', amountCredits: 250n }],
      }),
    };
    (svc as any).accounts = {
      ensureSystemAccount: vi.fn().mockResolvedValue({ id: 'payable-account' }),
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

    expect((svc as any).walletAccounts.ensureAccount).toHaveBeenCalledWith({
      userId: 'user-1',
    });
    expect((svc as any).walletBalances.getWalletBalance).toHaveBeenCalledWith('wa-1');
    expect(db.payoutRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        userId: 'user-1',
        walletAccountId: 'wa-1',
        amountMinor: 250n,
        amountCredits: 250n,
        baseCurrency: FIXED_REWARD_CURRENCY,
      }),
    });
    expect((svc as any).walletPayouts.reservePayout).toHaveBeenCalledWith({
      walletAccountId: 'wa-1',
      payoutRequestId: 'po-1',
      amountCredits: 250n,
    });
    expect(result.status).toBe('requested');
    expect(result.walletAccountId).toBe('wa-1');
  });

  it('rejects payout requests that exceed available wallet balance', async () => {
    db.tenantUser.findFirst.mockResolvedValue({
      id: 'tu-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    db.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' });
    (svc as any).walletAccounts = {
      ensureAccount: vi.fn().mockResolvedValue({ id: 'wa-1', userId: 'user-1' }),
    };
    (svc as any).walletBalances = {
      getWalletBalance: vi.fn().mockResolvedValue({
        walletAccountId: 'wa-1',
        currency: 'credit',
        balanceCredits: 100n,
      }),
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

  it('marks an approved payout as sent and marks the wallet reservation sent', async () => {
    db.payoutRequest.findUnique.mockResolvedValue({
      id: 'po-2',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      walletAccountId: 'wa-1',
      amountMinor: 250n,
      amountCredits: 250n,
      baseCurrency: 'EUR',
      status: 'approved',
    });
    db.walletPayoutReservation = {
      findFirst: vi.fn().mockResolvedValue({ id: 'wpr-2' }),
    };
    db.payoutRequest.update.mockResolvedValue({ id: 'po-2', status: 'sent' });
    (svc as any).walletPayouts = {
      markSent: vi.fn().mockResolvedValue({ id: 'wpr-2', status: 'sent' }),
    };
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

    expect((svc as any).walletPayouts.markSent).toHaveBeenCalledWith('wpr-2');
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

  it('fails a requested payout and releases wallet reservation funds back to grants', async () => {
    db.payoutRequest.findUnique.mockResolvedValue({
      id: 'po-3',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      walletAccountId: 'wa-1',
      amountMinor: 250n,
      amountCredits: 250n,
      baseCurrency: 'EUR',
      status: 'requested',
    });
    db.walletPayoutReservation = {
      findFirst: vi.fn().mockResolvedValue({ id: 'wpr-3' }),
    };
    db.payoutRequest.update.mockResolvedValue({ id: 'po-3', status: 'failed' });
    (svc as any).walletPayouts = {
      releaseReservation: vi.fn().mockResolvedValue({ id: 'wpr-3', status: 'released' }),
    };

    const result = await svc.failPayout('po-3', 'bank rejected');

    expect((svc as any).walletPayouts.releaseReservation).toHaveBeenCalledWith('wpr-3');
    expect(result.status).toBe('failed');
  });

  it('cancels a requested payout and releases wallet reservation funds back to grants', async () => {
    db.payoutRequest.findUnique.mockResolvedValue({
      id: 'po-4',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      walletAccountId: 'wa-1',
      amountMinor: 150n,
      amountCredits: 150n,
      baseCurrency: 'EUR',
      status: 'requested',
    });
    db.walletPayoutReservation = {
      findFirst: vi.fn().mockResolvedValue({ id: 'wpr-4' }),
    };
    db.payoutRequest.update.mockResolvedValue({ id: 'po-4', status: 'cancelled' });
    (svc as any).walletPayouts = {
      releaseReservation: vi.fn().mockResolvedValue({ id: 'wpr-4', status: 'released' }),
    };

    const result = await svc.cancelPayout('po-4');

    expect((svc as any).walletPayouts.releaseReservation).toHaveBeenCalledWith('wpr-4');
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
