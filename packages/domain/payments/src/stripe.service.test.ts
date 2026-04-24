import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { StripeWebhookService } from './stripe.service';

describe('StripeWebhookService', () => {
  it('maps checkout.session.completed into a subscription_started UPRM event', () => {
    const svc = new StripeWebhookService();
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

  it('maps invoice.paid into an invoice_paid UPRM event', () => {
    const svc = new StripeWebhookService();
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
    const svc = new StripeWebhookService();
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

  it('maps charge.refunded into a refund_issued UPRM event', () => {
    const svc = new StripeWebhookService();
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
            data: [
              {
                reason: 'requested_by_customer',
              },
            ],
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

  it('maps dispute created into a chargeback_opened UPRM event', () => {
    const svc = new StripeWebhookService();
    const event = {
      id: 'evt_dispute_open_1',
      type: 'charge.dispute.created',
      created: 1_713_960_480,
      data: {
        object: {
          amount: 2999,
          currency: 'eur',
          metadata: {
            externalUserId: 'psi-user-1',
            linkedExternalEventId: 'evt_invoice_1',
          },
        },
      },
    } as unknown as Stripe.Event;

    expect(svc.normalize(event)).toEqual({
      eventType: 'chargeback_opened',
      idempotencyKey: 'stripe:evt_dispute_open_1',
      externalEventId: 'evt_dispute_open_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:08:00.000Z',
      linkedExternalEventId: 'evt_invoice_1',
      amount: '29.99',
      currency: 'EUR',
    });
  });

  it('maps dispute closed with won status into a chargeback_won UPRM event', () => {
    const svc = new StripeWebhookService();
    const event = {
      id: 'evt_dispute_close_won_1',
      type: 'charge.dispute.closed',
      created: 1_713_960_600,
      data: {
        object: {
          status: 'won',
          metadata: {
            externalUserId: 'psi-user-1',
            linkedExternalEventId: 'evt_dispute_open_1',
          },
        },
      },
    } as unknown as Stripe.Event;

    expect(svc.normalize(event)).toEqual({
      eventType: 'chargeback_won',
      idempotencyKey: 'stripe:evt_dispute_close_won_1',
      externalEventId: 'evt_dispute_close_won_1',
      externalUserId: 'psi-user-1',
      occurredAt: '2024-04-24T12:10:00.000Z',
      linkedExternalEventId: 'evt_dispute_open_1',
    });
  });

  it('maps dispute closed with lost status into a chargeback_lost UPRM event', () => {
    const svc = new StripeWebhookService();
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
    const svc = new StripeWebhookService();
    const event = {
      id: 'evt_unknown_1',
      type: 'invoice.payment_failed',
      created: 1_713_960_120,
      data: { object: {} },
    } as unknown as Stripe.Event;

    expect(svc.normalize(event)).toBeNull();
  });
});
