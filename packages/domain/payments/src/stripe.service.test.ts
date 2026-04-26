import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { StripeWebhookService } from './stripe.service';

describe('StripeWebhookService', () => {
  it('maps checkout.session.completed into a subscription_started UPRM event', () => {
    const svc = new StripeWebhookService({} as any, vi.fn() as any);
    const event = {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      created: 1_713_960_000,
      data: {
        object: {
          subscription: 'sub_123',
          currency: 'eur',
          amount_total: 2999,
          metadata: {
            externalUserId: 'psi-user-1',
            plan: 'psi-monthly',
          },
        },
      },
    } as unknown as Stripe.Event;

    const result = svc.normalize(event);

    expect(result).toEqual({
      eventType: 'subscription_started',
      idempotencyKey: 'stripe:evt_checkout_1',
      externalEventId: 'evt_checkout_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:00:00.000Z',
      subscriptionId: 'sub_123',
      plan: 'psi-monthly',
      amount: '29.99',
      currency: 'EUR',
    });
  });

  it('forwards wallet redemption metadata from checkout.session.completed into subscription_started', () => {
    const svc = new StripeWebhookService({} as any, vi.fn() as any);
    const event = {
      id: 'evt_checkout_credits_1',
      type: 'checkout.session.completed',
      created: 1_713_960_000,
      data: {
        object: {
          subscription: 'sub_credits_123',
          currency: 'eur',
          amount_total: 3700,
          metadata: {
            externalUserId: 'psi-user-1',
            plan: 'psi-monthly',
            walletRedemptionId: 'wr-1',
            appliedCredits: '1200',
            tenantUserId: 'tenant-user-1',
            userId: 'user-1',
          },
        },
      },
    } as unknown as Stripe.Event;

    const result = svc.normalize(event);

    expect(result).toEqual({
      eventType: 'subscription_started',
      idempotencyKey: 'stripe:evt_checkout_credits_1',
      externalEventId: 'evt_checkout_credits_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:00:00.000Z',
      subscriptionId: 'sub_credits_123',
      plan: 'psi-monthly',
      amount: '37.00',
      currency: 'EUR',
      metadata: {
        walletRedemptionId: 'wr-1',
        appliedCredits: '1200',
        tenantUserId: 'tenant-user-1',
        userId: 'user-1',
      },
    });
  });

  it('maps invoice.paid into an invoice_paid UPRM event', () => {
    const svc = new StripeWebhookService({} as any, vi.fn() as any);
    const event = {
      id: 'evt_invoice_1',
      type: 'invoice.paid',
      created: 1_713_960_120,
      data: {
        object: {
          id: 'in_123',
          currency: 'eur',
          amount_paid: 2999,
          parent: {
            subscription_details: {
              metadata: {
                externalUserId: 'psi-user-1',
              },
            },
          },
        },
      },
    } as unknown as Stripe.Event;

    const result = svc.normalize(event);

    expect(result).toEqual({
      eventType: 'invoice_paid',
      idempotencyKey: 'stripe:evt_invoice_1',
      externalEventId: 'evt_invoice_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:02:00.000Z',
      invoiceId: 'in_123',
      amount: '29.99',
      currency: 'EUR',
    });
  });

  it('maps customer.subscription.deleted into a subscription_cancelled UPRM event', () => {
    const svc = new StripeWebhookService({} as any, vi.fn() as any);
    const event = {
      id: 'evt_cancel_1',
      type: 'customer.subscription.deleted',
      created: 1_713_960_240,
      data: {
        object: {
          id: 'sub_123',
          metadata: {
            externalUserId: 'psi-user-1',
          },
        },
      },
    } as unknown as Stripe.Event;

    expect(svc.normalize(event)).toEqual({
      eventType: 'subscription_cancelled',
      idempotencyKey: 'stripe:evt_cancel_1',
      externalEventId: 'evt_cancel_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:04:00.000Z',
      subscriptionId: 'sub_123',
      reason: 'stripe_subscription_deleted',
    });
  });

  it('maps charge.refunded from direct metadata when present', () => {
    const svc = new StripeWebhookService({} as any, vi.fn() as any);
    const event = {
      id: 'evt_refund_1',
      type: 'charge.refunded',
      created: 1_713_960_360,
      data: {
        object: {
          amount_refunded: 2999,
          currency: 'eur',
          metadata: {
            externalUserId: 'psi-user-1',
            linkedExternalEventId: 'evt_invoice_1',
          },
          refunds: {
            data: [{ reason: 'requested_by_customer' }],
          },
        },
      },
    } as unknown as Stripe.Event;

    expect(svc.normalize(event)).toEqual({
      eventType: 'refund_issued',
      idempotencyKey: 'stripe:evt_refund_1',
      externalEventId: 'evt_refund_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:06:00.000Z',
      linkedExternalEventId: 'evt_invoice_1',
      amount: '29.99',
      currency: 'EUR',
      reason: 'requested_by_customer',
    });
  });

  it('derives refund linkage from prior invoice_paid ingestion when metadata is absent', async () => {
    const db = {
      ingestedEvent: {
        findFirst: vi.fn().mockResolvedValue({
          externalUserId: 'psi-user-1',
          externalEventId: 'evt_invoice_1',
        }),
      },
    } as any;
    const stripe = {
      charges: { retrieve: vi.fn() },
      invoices: { retrieve: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
    } as any;
    const svc = new StripeWebhookService(db, () => stripe);
    const event = {
      id: 'evt_refund_derived_1',
      type: 'charge.refunded',
      created: 1_713_960_360,
      data: {
        object: {
          id: 'ch_123',
          invoice: 'in_123',
          amount_refunded: 2999,
          currency: 'eur',
          refunds: {
            data: [{ reason: 'requested_by_customer' }],
          },
        },
      },
    } as unknown as Stripe.Event;

    await expect(svc.normalizeForTenant(event, 'tenant-1', stripe)).resolves.toEqual({
      eventType: 'refund_issued',
      idempotencyKey: 'stripe:evt_refund_derived_1',
      externalEventId: 'evt_refund_derived_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:06:00.000Z',
      linkedExternalEventId: 'evt_invoice_1',
      amount: '29.99',
      currency: 'EUR',
      reason: 'requested_by_customer',
      metadata: {
        chargeId: 'ch_123',
        invoiceId: 'in_123',
      },
    });
  });

  it('derives chargeback_opened linkage from dispute charge -> invoice -> prior invoice_paid ingestion', async () => {
    const db = {
      ingestedEvent: {
        findFirst: vi.fn().mockResolvedValue({
          externalUserId: 'psi-user-1',
          externalEventId: 'evt_invoice_1',
        }),
      },
    } as any;
    const stripe = {
      charges: {
        retrieve: vi.fn().mockResolvedValue({ id: 'ch_123', invoice: 'in_123' }),
      },
      invoices: { retrieve: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
    } as any;
    const svc = new StripeWebhookService(db, () => stripe);
    const event = {
      id: 'evt_dispute_open_1',
      type: 'charge.dispute.created',
      created: 1_713_960_480,
      data: {
        object: {
          id: 'dp_123',
          charge: 'ch_123',
          amount: 2999,
          currency: 'eur',
        },
      },
    } as unknown as Stripe.Event;

    await expect(svc.normalizeForTenant(event, 'tenant-1', stripe)).resolves.toEqual({
      eventType: 'chargeback_opened',
      idempotencyKey: 'stripe:evt_dispute_open_1',
      externalEventId: 'evt_dispute_open_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:08:00.000Z',
      linkedExternalEventId: 'evt_invoice_1',
      amount: '29.99',
      currency: 'EUR',
      metadata: {
        disputeId: 'dp_123',
        chargeId: 'ch_123',
        invoiceId: 'in_123',
      },
    });
  });

  it('derives chargeback resolution linkage from prior chargeback_opened ingestion', async () => {
    const db = {
      ingestedEvent: {
        findFirst: vi.fn().mockResolvedValue({
          externalUserId: 'psi-user-1',
          externalEventId: 'evt_dispute_open_1',
        }),
      },
    } as any;
    const stripe = {
      charges: { retrieve: vi.fn() },
      invoices: { retrieve: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
    } as any;
    const svc = new StripeWebhookService(db, () => stripe);
    const event = {
      id: 'evt_dispute_close_won_1',
      type: 'charge.dispute.closed',
      created: 1_713_960_600,
      data: {
        object: {
          id: 'dp_123',
          status: 'won',
        },
      },
    } as unknown as Stripe.Event;

    await expect(svc.normalizeForTenant(event, 'tenant-1', stripe)).resolves.toEqual({
      eventType: 'chargeback_won',
      idempotencyKey: 'stripe:evt_dispute_close_won_1',
      externalEventId: 'evt_dispute_close_won_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:10:00.000Z',
      linkedExternalEventId: 'evt_dispute_open_1',
    });
  });

  it('maps dispute closed with lost status from metadata when present', () => {
    const svc = new StripeWebhookService({} as any, vi.fn() as any);
    const event = {
      id: 'evt_dispute_close_lost_1',
      type: 'charge.dispute.closed',
      created: 1_713_960_720,
      data: {
        object: {
          status: 'lost',
          metadata: {
            externalUserId: 'psi-user-1',
            linkedExternalEventId: 'evt_dispute_open_1',
          },
        },
      },
    } as unknown as Stripe.Event;

    expect(svc.normalize(event)).toEqual({
      eventType: 'chargeback_lost',
      idempotencyKey: 'stripe:evt_dispute_close_lost_1',
      externalEventId: 'evt_dispute_close_lost_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:12:00.000Z',
      linkedExternalEventId: 'evt_dispute_open_1',
    });
  });

  it('skips unsupported Stripe events cleanly', () => {
    const svc = new StripeWebhookService({} as any, vi.fn() as any);
    const event = {
      id: 'evt_unknown_1',
      type: 'invoice.payment_failed',
      created: 1_713_960_120,
      data: { object: {} },
    } as unknown as Stripe.Event;

    expect(svc.normalize(event)).toBeNull();
  });
});
