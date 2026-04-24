import type Stripe from 'stripe';
import StripeClient from 'stripe';
import type { EventPayload } from '@uprm/events';

export class StripeWebhookService {
  async constructAndNormalize(input: {
    rawBody: Buffer;
    signature: string;
    webhookSecret: string;
  }): Promise<EventPayload | null> {
    const stripe = new StripeClient(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder');
    const event = stripe.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      input.webhookSecret,
    );

    return this.normalize(event);
  }

  normalize(event: Stripe.Event): EventPayload | null {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.normalizeCheckoutCompleted(event);
      case 'invoice.paid':
        return this.normalizeInvoicePaid(event);
      case 'customer.subscription.deleted':
        return this.normalizeSubscriptionDeleted(event);
      case 'charge.refunded':
        return this.normalizeChargeRefunded(event);
      case 'charge.dispute.created':
        return this.normalizeDisputeCreated(event);
      case 'charge.dispute.closed':
        return this.normalizeDisputeClosed(event);
      default:
        return null;
    }
  }

  private normalizeCheckoutCompleted(event: Stripe.Event): EventPayload | null {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const externalUserId = session.metadata?.externalUserId;
    const plan = session.metadata?.plan;
    const amountTotal = session.amount_total;
    const currency = session.currency;

    if (!subscriptionId || !externalUserId || !plan || amountTotal == null || !currency) {
      return null;
    }

    return {
      eventType: 'subscription_started',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      subscriptionId,
      plan,
      amount: formatMinorUnits(amountTotal),
      currency: currency.toUpperCase(),
    };
  }

  private normalizeInvoicePaid(event: Stripe.Event): EventPayload | null {
    const invoice = event.data.object as Stripe.Invoice & {
      parent?: {
        subscription_details?: {
          metadata?: Record<string, string>;
        };
      };
    };
    const externalUserId = invoice.parent?.subscription_details?.metadata?.externalUserId;
    const invoiceId = invoice.id;
    const amountPaid = invoice.amount_paid;
    const currency = invoice.currency;

    if (!externalUserId || !invoiceId || amountPaid == null || !currency) {
      return null;
    }

    return {
      eventType: 'invoice_paid',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      invoiceId,
      amount: formatMinorUnits(amountPaid),
      currency: currency.toUpperCase(),
    };
  }

  private normalizeSubscriptionDeleted(event: Stripe.Event): EventPayload | null {
    const subscription = event.data.object as Stripe.Subscription;
    const externalUserId = subscription.metadata?.externalUserId;

    if (!subscription.id || !externalUserId) {
      return null;
    }

    return {
      eventType: 'subscription_cancelled',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      subscriptionId: subscription.id,
      reason: 'stripe_subscription_deleted',
    };
  }

  private normalizeChargeRefunded(event: Stripe.Event): EventPayload | null {
    const charge = event.data.object as Stripe.Charge;
    const externalUserId = charge.metadata?.externalUserId;
    const linkedExternalEventId = charge.metadata?.linkedExternalEventId;
    const amountRefunded = charge.amount_refunded;
    const currency = charge.currency;
    const reason = charge.refunds?.data?.[0]?.reason ?? undefined;

    if (!externalUserId || !linkedExternalEventId || amountRefunded == null || !currency) {
      return null;
    }

    return {
      eventType: 'refund_issued',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      linkedExternalEventId,
      amount: formatMinorUnits(amountRefunded),
      currency: currency.toUpperCase(),
      ...(reason ? { reason } : {}),
    };
  }

  private normalizeDisputeCreated(event: Stripe.Event): EventPayload | null {
    const dispute = event.data.object as Stripe.Dispute;
    const externalUserId = dispute.metadata?.externalUserId;
    const linkedExternalEventId = dispute.metadata?.linkedExternalEventId;
    const amount = dispute.amount;
    const currency = dispute.currency;

    if (!externalUserId || !linkedExternalEventId || amount == null || !currency) {
      return null;
    }

    return {
      eventType: 'chargeback_opened',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      linkedExternalEventId,
      amount: formatMinorUnits(amount),
      currency: currency.toUpperCase(),
    };
  }

  private normalizeDisputeClosed(event: Stripe.Event): EventPayload | null {
    const dispute = event.data.object as Stripe.Dispute;
    const externalUserId = dispute.metadata?.externalUserId;
    const linkedExternalEventId = dispute.metadata?.linkedExternalEventId;

    if (!externalUserId || !linkedExternalEventId) {
      return null;
    }

    if (dispute.status === 'won') {
      return {
        eventType: 'chargeback_won',
        idempotencyKey: `stripe:${event.id}`,
        externalEventId: event.id,
        externalUserId,
        occurredAt: new Date(event.created * 1000).toISOString(),
        linkedExternalEventId,
      };
    }

    if (dispute.status === 'lost') {
      return {
        eventType: 'chargeback_lost',
        idempotencyKey: `stripe:${event.id}`,
        externalEventId: event.id,
        externalUserId,
        occurredAt: new Date(event.created * 1000).toISOString(),
        linkedExternalEventId,
      };
    }

    return null;
  }
}

function formatMinorUnits(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
