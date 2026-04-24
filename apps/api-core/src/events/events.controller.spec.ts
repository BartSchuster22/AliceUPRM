import { UnprocessableEntityException } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventValidationError } from '@uprm/events';

describe('EventsController currency enforcement', () => {
  let controller: EventsController;

  beforeEach(() => {
    controller = new EventsController();
  });

  it('rejects an event whose currency does not match the tenant base currency', async () => {
    (controller as any).tenantSvc = {
      getTenant: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' }),
    };
    (controller as any).svc = {
      ingest: jest.fn(),
    };

    await expect(
      controller.ingest({
        uprm: { tenantId: 'tenant-1' },
        body: {
          eventType: 'invoice_paid',
          externalEventId: 'evt-1',
          externalUserId: 'user-1',
          idempotencyKey: 'idem-evt-0001',
          invoiceId: 'inv-1',
          amount: '29.99',
          currency: 'USD',
        },
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'CURRENCY_NOT_SUPPORTED',
      },
    });
  });

  it('allows an event whose currency matches the tenant base currency', async () => {
    (controller as any).tenantSvc = {
      getTenant: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' }),
    };
    (controller as any).svc = {
      ingest: jest.fn().mockResolvedValue({
        eventId: 'evt-db-1',
        processingStatus: 'accepted',
        duplicate: false,
      }),
    };

    const result = await controller.ingest({
      uprm: { tenantId: 'tenant-1' },
      body: {
        eventType: 'invoice_paid',
        externalEventId: 'evt-1',
        externalUserId: 'user-1',
        idempotencyKey: 'idem-evt-0001',
        invoiceId: 'inv-1',
        amount: '29.99',
        currency: 'EUR',
      },
    });

    expect(result).toEqual({
      event_id: 'evt-db-1',
      processing_status: 'accepted',
      duplicate: false,
    });
    expect((controller as any).svc.ingest).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      body: {
        eventType: 'invoice_paid',
        externalEventId: 'evt-1',
        externalUserId: 'user-1',
        idempotencyKey: 'idem-evt-0001',
        invoiceId: 'inv-1',
        amount: '29.99',
        currency: 'EUR',
      },
    });
  });

  it('preserves existing validation failure behavior', async () => {
    (controller as any).tenantSvc = {
      getTenant: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' }),
    };
    (controller as any).svc = {
      ingest: jest
        .fn()
        .mockRejectedValue(
          new EventValidationError('payload validation failed', [
            { path: ['eventType'], message: 'bad event' },
          ]),
        ),
    };

    await expect(
      controller.ingest({
        uprm: { tenantId: 'tenant-1' },
        body: { eventType: 'bogus' },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
