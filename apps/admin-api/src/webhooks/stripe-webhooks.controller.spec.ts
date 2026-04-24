import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StripeWebhooksController } from './stripe-webhooks.controller';

describe('StripeWebhooksController', () => {
  let controller: StripeWebhooksController;

  beforeEach(() => {
    controller = new StripeWebhooksController();
  });

  it('rejects requests without a stripe-signature header', async () => {
    await expect(
      controller.handle('tenant-1', {
        headers: {},
        rawBody: Buffer.from('{}'),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects requests for unknown tenants', async () => {
    (controller as any).tenants = {
      getTenant: jest.fn().mockResolvedValue(null),
    };

    await expect(
      controller.handle('tenant-missing', {
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: Buffer.from('{}'),
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when Stripe webhook config is disabled for the tenant', async () => {
    (controller as any).tenants = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        config: {
          webhookConfig: {
            stripe: { enabled: false, webhookSecret: 'whsec_test' },
          },
        },
      }),
    };

    await expect(
      controller.handle('tenant-1', {
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: Buffer.from('{}'),
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ingests a normalized Stripe event through EventIngestionService', async () => {
    (controller as any).tenants = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        config: {
          webhookConfig: {
            stripe: { enabled: true, webhookSecret: 'whsec_test' },
          },
        },
      }),
    };
    (controller as any).payments = {
      constructAndNormalize: jest.fn().mockResolvedValue({
        eventType: 'invoice_paid',
        idempotencyKey: 'stripe:evt_1',
        externalEventId: 'evt_1',
        externalUserId: 'psi-user-1',
        occurredAt: '2024-04-24T12:02:00.000Z',
        invoiceId: 'in_123',
        amount: '29.99',
        currency: 'EUR',
      }),
    };
    (controller as any).events = {
      ingest: jest.fn().mockResolvedValue({
        eventId: 'db-evt-1',
        processingStatus: 'accepted',
        duplicate: false,
      }),
    };

    const result = await controller.handle('tenant-1', {
      headers: { 'stripe-signature': 'sig_test' },
      rawBody: Buffer.from('{}'),
    } as any);

    expect(
      (controller as any).payments.constructAndNormalize,
    ).toHaveBeenCalledWith({
      rawBody: Buffer.from('{}'),
      signature: 'sig_test',
      webhookSecret: 'whsec_test',
    });
    expect((controller as any).events.ingest).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      body: expect.objectContaining({ eventType: 'invoice_paid' }),
    });
    expect(result).toEqual({
      event_id: 'db-evt-1',
      processing_status: 'accepted',
      duplicate: false,
      ignored: false,
    });
  });

  it('returns ignored=true for valid but unmappable Stripe events', async () => {
    (controller as any).tenants = {
      getTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        config: {
          webhookConfig: {
            stripe: { enabled: true, webhookSecret: 'whsec_test' },
          },
        },
      }),
    };
    (controller as any).payments = {
      constructAndNormalize: jest.fn().mockResolvedValue(null),
    };
    (controller as any).events = {
      ingest: jest.fn(),
    };

    const result = await controller.handle('tenant-1', {
      headers: { 'stripe-signature': 'sig_test' },
      rawBody: Buffer.from('{}'),
    } as any);

    expect((controller as any).events.ingest).not.toHaveBeenCalled();
    expect(result).toEqual({ ignored: true });
  });
});
