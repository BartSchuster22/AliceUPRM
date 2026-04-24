import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventIngestionService } from './ingestion.service';

describe('EventIngestionService event links', () => {
  let db: any;
  let svc: EventIngestionService;
  let createdEvent: any;
  let createdLink: any[];

  beforeEach(() => {
    createdLink = [];
    createdEvent = {
      id: 'evt-db-new',
      processingStatus: 'accepted',
    };

    db = {
      ingestedEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      tenantConfig: {
        findUnique: vi.fn().mockResolvedValue({ fraudConfig: { enabled: false } }),
      },
      tenantUser: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      referralCode: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (fn) =>
        fn({
          ingestedEvent: {
            create: vi.fn().mockResolvedValue(createdEvent),
            findFirst: vi.fn().mockResolvedValue({ id: 'evt-db-linked' }),
            findMany: vi.fn().mockResolvedValue([]),
          },
          outboxMessage: {
            create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
          },
          eventLink: {
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              createdLink.push(data);
              return data;
            }),
          },
        }),
      ),
    };

    svc = new EventIngestionService(db);
  });

  it('creates a refund_of event link when refund_issued references an existing prior event', async () => {
    const result = await svc.ingest({
      tenantId: 'tenant-1',
      body: {
        eventType: 'refund_issued',
        idempotencyKey: 'stripe:evt_refund_1',
        externalEventId: 'evt_refund_1',
        externalUserId: 'psi-user-1',
        linkedExternalEventId: 'evt_invoice_1',
        amount: '29.99',
        currency: 'EUR',
        reason: 'requested_by_customer',
      },
    });

    expect(result).toEqual({
      eventId: 'evt-db-new',
      processingStatus: 'accepted',
      duplicate: false,
    });
    expect(createdLink).toEqual([
      {
        tenantId: 'tenant-1',
        eventId: 'evt-db-new',
        linkedEventId: 'evt-db-linked',
        linkType: 'refund_of',
      },
    ]);
  });

  it('creates a chargeback_resolution_of event link for chargeback_won', async () => {
    const result = await svc.ingest({
      tenantId: 'tenant-1',
      body: {
        eventType: 'chargeback_won',
        idempotencyKey: 'stripe:evt_dispute_close_won_1',
        externalEventId: 'evt_dispute_close_won_1',
        externalUserId: 'psi-user-1',
        linkedExternalEventId: 'evt_dispute_open_1',
      },
    });

    expect(result).toEqual({
      eventId: 'evt-db-new',
      processingStatus: 'accepted',
      duplicate: false,
    });
    expect(createdLink).toEqual([
      {
        tenantId: 'tenant-1',
        eventId: 'evt-db-new',
        linkedEventId: 'evt-db-linked',
        linkType: 'chargeback_resolution_of',
      },
    ]);
  });

  it('reconciles out-of-order links when the referenced prior event arrives later', async () => {
    const tx = {
      ingestedEvent: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: 'evt-db-refund', processingStatus: 'accepted' })
          .mockResolvedValueOnce({ id: 'evt-db-invoice', processingStatus: 'accepted' }),
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'evt-db-refund',
              eventType: 'refund_issued',
            },
          ]),
      },
      outboxMessage: {
        create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      eventLink: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          createdLink.push(data);
          return data;
        }),
      },
    };
    db.$transaction = vi.fn(async (fn) => fn(tx));

    await svc.ingest({
      tenantId: 'tenant-1',
      body: {
        eventType: 'refund_issued',
        idempotencyKey: 'stripe:evt_refund_out_of_order',
        externalEventId: 'evt_refund_out_of_order',
        externalUserId: 'psi-user-1',
        linkedExternalEventId: 'evt_invoice_late',
        amount: '29.99',
        currency: 'EUR',
        reason: 'requested_by_customer',
      },
    });

    await svc.ingest({
      tenantId: 'tenant-1',
      body: {
        eventType: 'invoice_paid',
        idempotencyKey: 'stripe:evt_invoice_late',
        externalEventId: 'evt_invoice_late',
        externalUserId: 'psi-user-1',
        invoiceId: 'in_late_1',
        amount: '29.99',
        currency: 'EUR',
      },
    });

    expect(createdLink).toEqual([
      {
        tenantId: 'tenant-1',
        eventId: 'evt-db-refund',
        linkedEventId: 'evt-db-invoice',
        linkType: 'refund_of',
      },
    ]);
  });
});
