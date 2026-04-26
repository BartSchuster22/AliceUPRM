import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ScheduledPostingService } from './scheduled-posting.service';

describe('ScheduledPostingService compensating events', () => {
  let db: any;
  let svc: ScheduledPostingService;

  beforeEach(() => {
    db = {
      eventLink: {
        findFirst: vi.fn(),
      },
      tenantConfig: {
        findUnique: vi.fn().mockResolvedValue({ webhookConfig: {} }),
      },
      scheduledPosting: {
        updateMany: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      ledgerEntry: {
        findUnique: vi.fn(),
      },
      ledgerPosting: {
        findMany: vi.fn(),
      },
      ledgerAccount: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      webhookDelivery: {
        create: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      rewardHold: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tenantUser: {
        findFirst: vi.fn(),
      },
      walletAccount: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      walletGrant: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    svc = new ScheduledPostingService(db);
  });

  it('enqueues reward.created deliveries when subscribed endpoints exist', async () => {
    db.tenantConfig.findUnique.mockResolvedValue({
      webhookConfig: {
        outbound: {
          enabled: true,
          endpoints: [
            {
              id: 'psi-primary',
              url: 'https://psi.internal/uprm/webhooks',
              secret: 'supersecret1',
              eventTypes: ['reward.created'],
            },
          ],
        },
      },
    });
    db.scheduledPosting.findUnique.mockResolvedValue(null);
    db.scheduledPosting.create.mockResolvedValue({ id: 'sp-1' });

    (svc as any).accounts = {
      ensureUserBalanceAccount: vi.fn().mockResolvedValue({ id: 'user-balance-1' }),
      ensureSystemAccount: vi.fn().mockResolvedValue({ id: 'reward-expense-1' }),
    };

    const result = await svc.scheduleRewards({
      event: {
        tenantId: 'tenant-1',
        eventId: 'evt-1',
        eventType: 'subscription_paid',
        occurredAt: new Date('2026-04-24T18:00:00.000Z'),
        referredTenantUserId: 'buyer-1',
        amountMinor: 1000n,
        currency: 'EUR',
      },
      rewards: [
        {
          referrerTenantUserId: 'referrer-1',
          depth: 1,
          amountMinor: 250n,
          currency: 'EUR',
        },
      ],
      postAt: new Date('2026-05-08T18:00:00.000Z'),
    });

    expect(result).toEqual({ scheduled: 1, skipped: 0 });
    expect(db.webhookDelivery.create).toHaveBeenCalledTimes(1);
    expect(db.webhookDelivery.create.mock.calls[0][0].data.eventType).toBe('reward.created');
  });

  it('enqueues reward.approved and wallet.balance.changed when posting due rewards', async () => {
    db.tenantConfig.findUnique.mockResolvedValue({
      webhookConfig: {
        outbound: {
          enabled: true,
          endpoints: [
            {
              id: 'psi-primary',
              url: 'https://psi.internal/uprm/webhooks',
              secret: 'supersecret1',
              eventTypes: ['reward.approved', 'wallet.balance.changed'],
            },
          ],
        },
      },
    });
    db.scheduledPosting.findMany = vi.fn().mockResolvedValue([
      {
        id: 'sp-due-3',
        tenantId: 'tenant-1',
        beneficiaryTenantUserId: 'referrer-1',
        sourceEventId: 'source-evt-3',
        payload: {
          currency: 'EUR',
          description: 'scheduled reward',
          postings: [
            { accountId: 'expense', amount: '299' },
            { accountId: 'balance', amount: '-299' },
          ],
        },
      },
    ]);
    db.scheduledPosting.updateMany = vi.fn().mockResolvedValue({ count: 1 });
    db.scheduledPosting.update = vi.fn().mockResolvedValue({ id: 'sp-due-3', status: 'posted' });
    db.ledgerAccount.findMany.mockResolvedValue([
      {
        id: 'balance',
        tenantId: 'tenant-1',
        tenantUserId: 'referrer-1',
        accountType: 'user_balance',
        currency: 'EUR',
      },
    ]);

    const postEntry = vi.fn().mockResolvedValue({ id: 'entry-3', duplicate: false });
    (svc as any).postings = { postEntry };
    db.tenantUser.findFirst.mockResolvedValue({ id: 'referrer-1', userId: 'user-1' });
    (svc as any).walletAccounts = { ensureAccount: vi.fn().mockResolvedValue({ id: 'wa-1' }) };
    (svc as any).walletGrants = { createGrant: vi.fn() };

    const result = await svc.postDueRewards(new Date('2026-04-24T15:00:00.000Z'));

    expect(result).toEqual({ posted: 1, held: 0 });
    expect((svc as any).walletAccounts.ensureAccount).toHaveBeenCalledWith({ userId: 'user-1' });
    expect((svc as any).walletGrants.createGrant).toHaveBeenCalledWith({
      walletAccountId: 'wa-1',
      issuerTenantId: 'tenant-1',
      sourceTenantUserId: 'referrer-1',
      originType: 'reward',
      sourceEventId: 'source-evt-3',
      sourceReferenceType: 'scheduled_posting',
      sourceReferenceId: 'sp-due-3',
      amountIssued: 299n,
    });
    expect(db.webhookDelivery.create).toHaveBeenCalledTimes(2);
    const eventTypes = db.webhookDelivery.create.mock.calls
      .map((call: any[]) => call[0].data.eventType)
      .sort();
    expect(eventTypes).toEqual(['reward.approved', 'wallet.balance.changed']);
  });

  it('cancels pending scheduled rewards for a linked refund event', async () => {
    db.eventLink.findFirst.mockResolvedValue({ linkedEventId: 'source-evt-1' });
    db.scheduledPosting.updateMany.mockResolvedValue({ count: 2 });
    db.scheduledPosting.findMany.mockResolvedValue([]);

    const result = await (svc as any).compensateForLinkedEvent({
      tenantId: 'tenant-1',
      compensatingEventId: 'refund-evt-1',
      compensatingEventType: 'refund_issued',
    });

    expect(db.scheduledPosting.updateMany).toHaveBeenCalledWith({
      where: { sourceEventId: 'source-evt-1', status: 'pending' },
      data: { status: 'cancelled', cancelReason: 'refund_issued:refund-evt-1' },
    });
    expect(result).toEqual({
      linked: true,
      cancelled: 2,
      reversed: 0,
      skipped: 0,
    });
  });

  it('reverses posted reward entries for a linked chargeback event', async () => {
    db.tenantConfig.findUnique.mockResolvedValue({
      webhookConfig: {
        outbound: {
          enabled: true,
          endpoints: [
            {
              id: 'psi-primary',
              url: 'https://psi.internal/uprm/webhooks',
              secret: 'supersecret1',
              eventTypes: ['refund.reversed', 'wallet.balance.changed'],
            },
          ],
        },
      },
    });
    db.eventLink.findFirst.mockResolvedValue({ linkedEventId: 'source-evt-2' });
    db.scheduledPosting.updateMany.mockResolvedValue({ count: 0 });
    db.scheduledPosting.findMany.mockResolvedValue([
      {
        id: 'sp-1',
        tenantId: 'tenant-1',
        beneficiaryTenantUserId: 'referrer-1',
        sourceEventId: 'source-evt-2',
        resultEntryId: 'entry-1',
        status: 'posted',
      },
    ]);
    db.ledgerEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      tenantId: 'tenant-1',
      currency: 'EUR',
      description: 'reward entry',
    });
    db.ledgerPosting.findMany.mockResolvedValue([
      { accountId: 'expense', amount: 299n },
      { accountId: 'balance', amount: -299n },
    ]);
    db.ledgerAccount.findMany.mockResolvedValue([
      {
        id: 'balance',
        tenantId: 'tenant-1',
        tenantUserId: 'referrer-1',
        accountType: 'user_balance',
        currency: 'EUR',
      },
    ]);

    const postEntry = vi.fn().mockResolvedValue({ id: 'reversal-1', duplicate: false });
    (svc as any).postings = { postEntry };
    db.tenantUser.findFirst.mockResolvedValue({ id: 'referrer-1', userId: 'user-1' });
    (svc as any).walletAccounts = { ensureAccount: vi.fn().mockResolvedValue({ id: 'wa-1' }) };
    (svc as any).walletGrants = { recordDelta: vi.fn() };

    const result = await (svc as any).compensateForLinkedEvent({
      tenantId: 'tenant-1',
      compensatingEventId: 'cb-open-1',
      compensatingEventType: 'chargeback_opened',
    });

    expect(postEntry).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      currency: 'EUR',
      description: 'Reversal for reward entry due to chargeback_opened',
      idempotencyKey: 'reversal:chargeback_opened:cb-open-1:sp-1',
      sourceEventId: 'cb-open-1',
      postings: [
        { accountId: 'expense', amount: -299n },
        { accountId: 'balance', amount: 299n },
      ],
    });
    expect(db.webhookDelivery.create).toHaveBeenCalledTimes(2);
    expect((svc as any).walletAccounts.ensureAccount).toHaveBeenCalledWith({ userId: 'user-1' });
    expect((svc as any).walletGrants.recordDelta).toHaveBeenCalledWith({
      walletAccountId: 'wa-1',
      issuerTenantId: 'tenant-1',
      sourceTenantUserId: 'referrer-1',
      originType: 'reward_reversal',
      sourceEventId: 'source-evt-2',
      sourceReferenceType: 'scheduled_posting_reversal',
      sourceReferenceId: 'sp-1',
      amountDelta: -299n,
    });
    expect(result).toEqual({
      linked: true,
      cancelled: 0,
      reversed: 1,
      skipped: 0,
    });
  });

  it('treats duplicate reversal attempts as skipped, not new reversals', async () => {
    db.eventLink.findFirst.mockResolvedValue({ linkedEventId: 'source-evt-3' });
    db.scheduledPosting.updateMany.mockResolvedValue({ count: 0 });
    db.scheduledPosting.findMany.mockResolvedValue([
      {
        id: 'sp-2',
        tenantId: 'tenant-1',
        sourceEventId: 'source-evt-3',
        resultEntryId: 'entry-2',
        status: 'posted',
      },
    ]);
    db.ledgerEntry.findUnique.mockResolvedValue({
      id: 'entry-2',
      tenantId: 'tenant-1',
      currency: 'EUR',
      description: 'reward entry',
    });
    db.ledgerPosting.findMany.mockResolvedValue([
      { accountId: 'expense', amount: 500n },
      { accountId: 'balance', amount: -500n },
    ]);

    const postEntry = vi.fn().mockResolvedValue({ id: 'reversal-existing', duplicate: true });
    (svc as any).postings = { postEntry };

    const result = await (svc as any).compensateForLinkedEvent({
      tenantId: 'tenant-1',
      compensatingEventId: 'refund-evt-dup',
      compensatingEventType: 'refund_issued',
    });

    expect(result).toEqual({
      linked: true,
      cancelled: 0,
      reversed: 0,
      skipped: 1,
    });
  });

  it('skips rows already claimed by another scheduler runner', async () => {
    const row = {
      id: 'sp-due-1',
      tenantId: 'tenant-1',
      sourceEventId: 'source-evt-1',
      payload: {
        currency: 'EUR',
        description: 'scheduled reward',
        postings: [
          { accountId: 'expense', amount: '299' },
          { accountId: 'balance', amount: '-299' },
        ],
      },
    };

    db.scheduledPosting.findMany = vi.fn().mockResolvedValue([row]);
    db.scheduledPosting.updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    db.scheduledPosting.update = vi.fn().mockResolvedValue({ id: 'sp-due-1', status: 'posted' });

    const postEntry = vi.fn().mockResolvedValue({ id: 'entry-1', duplicate: false });
    (svc as any).postings = { postEntry };

    const [first, second] = await Promise.all([
      svc.postDueRewards(new Date('2026-04-24T15:00:00.000Z')),
      svc.postDueRewards(new Date('2026-04-24T15:00:00.000Z')),
    ]);

    expect(postEntry).toHaveBeenCalledTimes(1);
    expect(first.posted + second.posted).toBe(1);
    expect(first.held + second.held).toBe(0);
  });

  it('does not count duplicate ledger postings as newly posted rewards', async () => {
    db.scheduledPosting.findMany = vi.fn().mockResolvedValue([
      {
        id: 'sp-due-2',
        tenantId: 'tenant-1',
        sourceEventId: 'source-evt-2',
        payload: {
          currency: 'EUR',
          description: 'scheduled reward',
          postings: [
            { accountId: 'expense', amount: '500' },
            { accountId: 'balance', amount: '-500' },
          ],
        },
      },
    ]);
    db.scheduledPosting.updateMany = vi.fn().mockResolvedValue({ count: 1 });
    db.scheduledPosting.update = vi.fn().mockResolvedValue({ id: 'sp-due-2', status: 'posted' });

    const postEntry = vi.fn().mockResolvedValue({ id: 'entry-existing', duplicate: true });
    (svc as any).postings = { postEntry };

    const result = await svc.postDueRewards(new Date('2026-04-24T15:00:00.000Z'));

    expect(result).toEqual({ posted: 0, held: 0 });
    expect(db.scheduledPosting.update).toHaveBeenCalledWith({
      where: { id: 'sp-due-2' },
      data: { status: 'posted', resultEntryId: 'entry-existing' },
    });
  });

  it('skips cleanly when no event link exists', async () => {
    db.eventLink.findFirst.mockResolvedValue(null);

    const result = await (svc as any).compensateForLinkedEvent({
      tenantId: 'tenant-1',
      compensatingEventId: 'refund-evt-missing-link',
      compensatingEventType: 'refund_issued',
    });

    expect(result).toEqual({
      linked: false,
      cancelled: 0,
      reversed: 0,
      skipped: 1,
    });
  });
});
