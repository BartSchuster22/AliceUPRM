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
      scheduledPosting: {
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
      ledgerEntry: {
        findUnique: vi.fn(),
      },
      ledgerPosting: {
        findMany: vi.fn(),
      },
    };
    svc = new ScheduledPostingService(db);
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
    db.eventLink.findFirst.mockResolvedValue({ linkedEventId: 'source-evt-2' });
    db.scheduledPosting.updateMany.mockResolvedValue({ count: 0 });
    db.scheduledPosting.findMany.mockResolvedValue([
      {
        id: 'sp-1',
        tenantId: 'tenant-1',
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

    const postEntry = vi.fn().mockResolvedValue({ id: 'reversal-1', duplicate: false });
    (svc as any).postings = { postEntry };

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
