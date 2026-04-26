import type Stripe from 'stripe';
import StripeClient from 'stripe';
import { prisma, type PrismaClient } from '@uprm/db';
import type { EventPayload } from '@uprm/events';

export interface CreateCheckoutSessionInput {
  externalUserId: string;
  plan: string;
  productName: string;
  productDescription?: string;
  amountMinor: number;
  currency: string;
  billingInterval: 'month' | 'year';
  successUrl: string;
  cancelUrl: string;
  referralCodeUsed?: string;
  appliedCredits?: number;
  walletRedemptionId?: string;
  tenantUserId?: string;
  userId?: string;
}

interface StripeChargeLike {
  id?: string;
  invoice?: string | { id?: string | null } | null;
  metadata?: Record<string, string>;
}

interface StripeInvoiceLike {
  id?: string;
  parent?: {
    subscription_details?: {
      metadata?: Record<string, string>;
    };
  };
}

interface StripeClientLike {
  webhooks: {
    constructEvent(rawBody: Buffer, signature: string, webhookSecret: string): Stripe.Event;
  };
  checkout: {
    sessions: {
      create(input: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session>;
    };
  };
  charges: {
    retrieve(chargeId: string): Promise<StripeChargeLike>;
  };
  invoices: {
    retrieve(invoiceId: string): Promise<StripeInvoiceLike>;
  };
}

interface RefundOrChargebackContext {
  externalUserId: string;
  linkedExternalEventId: string;
  invoiceId?: string;
  chargeId?: string;
}

function getStripeApiKey(): string {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }
  return apiKey;
}

function createStripeClient(): StripeClientLike {
  return new StripeClient(getStripeApiKey()) as unknown as StripeClientLike;
}

export function buildStripeCheckoutSessionParams(
  input: CreateCheckoutSessionInput,
): Stripe.Checkout.SessionCreateParams {
  const metadata: Record<string, string> = {
    externalUserId: input.externalUserId,
    plan: input.plan,
  };

  if (input.referralCodeUsed) {
    metadata.referralCodeUsed = input.referralCodeUsed;
  }

  if (input.appliedCredits !== undefined) {
    metadata.appliedCredits = String(input.appliedCredits);
  }

  if (input.walletRedemptionId) {
    metadata.walletRedemptionId = input.walletRedemptionId;
  }

  if (input.tenantUserId) {
    metadata.tenantUserId = input.tenantUserId;
  }

  if (input.userId) {
    metadata.userId = input.userId;
  }

  return {
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountMinor,
          recurring: { interval: input.billingInterval },
          product_data: {
            name: input.productName,
            ...(input.productDescription ? { description: input.productDescription } : {}),
          },
        },
      },
    ],
  };
}

export class StripeCheckoutService {
  constructor(private readonly stripeFactory: () => StripeClientLike = createStripeClient) {}

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<{ sessionId: string; url: string }> {
    const stripe = this.stripeFactory();
    const session = await stripe.checkout.sessions.create(buildStripeCheckoutSessionParams(input));

    if (!session.url) {
      throw new Error('Stripe checkout session did not return a URL');
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  }
}

export type WalletRedemptionLifecycleAction = 'mark_posted' | 'release';

export interface WalletRedemptionLifecycle {
  walletRedemptionId: string;
  action: WalletRedemptionLifecycleAction;
}

export class StripeWebhookService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly stripeFactory: () => StripeClientLike = createStripeClient,
  ) {}

  async constructAndNormalize(input: {
    rawBody: Buffer;
    signature: string;
    webhookSecret: string;
    tenantId: string;
  }): Promise<EventPayload | null> {
    const { normalized } = await this.constructAndNormalizeWithEvent(input);
    return normalized;
  }

  async constructAndNormalizeWithEvent(input: {
    rawBody: Buffer;
    signature: string;
    webhookSecret: string;
    tenantId: string;
  }): Promise<{ event: Stripe.Event; normalized: EventPayload | null }> {
    const stripe = this.stripeFactory();
    const event = stripe.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      input.webhookSecret,
    );

    const normalized = await this.normalizeForTenant(event, input.tenantId, stripe);
    return { event, normalized };
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
        return this.normalizeChargeRefundedFromMetadata(event);
      case 'charge.dispute.created':
        return this.normalizeDisputeCreatedFromMetadata(event);
      case 'charge.dispute.closed':
        return this.normalizeDisputeClosedFromMetadata(event);
      default:
        return null;
    }
  }

  async normalizeForTenant(
    event: Stripe.Event,
    tenantId: string,
    stripe: StripeClientLike = this.stripeFactory(),
  ): Promise<EventPayload | null> {
    switch (event.type) {
      case 'charge.refunded':
        return this.normalizeChargeRefundedResolved(event, tenantId, stripe);
      case 'charge.dispute.created':
        return this.normalizeDisputeCreatedResolved(event, tenantId, stripe);
      case 'charge.dispute.closed':
        return this.normalizeDisputeClosedResolved(event, tenantId, stripe);
      default:
        return this.normalize(event);
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
      ...(buildWalletCheckoutMetadata(session.metadata)
        ? { metadata: buildWalletCheckoutMetadata(session.metadata)! }
        : {}),
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

  private normalizeChargeRefundedFromMetadata(event: Stripe.Event): EventPayload | null {
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

  private normalizeDisputeCreatedFromMetadata(event: Stripe.Event): EventPayload | null {
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
      metadata: {
        disputeId: dispute.id,
      },
    };
  }

  private normalizeDisputeClosedFromMetadata(event: Stripe.Event): EventPayload | null {
    const dispute = event.data.object as Stripe.Dispute;
    const externalUserId = dispute.metadata?.externalUserId;
    const linkedExternalEventId = dispute.metadata?.linkedExternalEventId;

    if (!externalUserId || !linkedExternalEventId) {
      return null;
    }

    return buildDisputeClosedPayload(event, dispute.status, externalUserId, linkedExternalEventId);
  }

  private async normalizeChargeRefundedResolved(
    event: Stripe.Event,
    tenantId: string,
    stripe: StripeClientLike,
  ): Promise<EventPayload | null> {
    const charge = event.data.object as Stripe.Charge;
    const reason = charge.refunds?.data?.[0]?.reason ?? undefined;
    const context = await this.resolveRefundOrChargebackContext(
      tenantId,
      charge as StripeChargeLike,
      stripe,
    );
    if (!context || charge.amount_refunded == null || !charge.currency) {
      return this.normalizeChargeRefundedFromMetadata(event);
    }

    return {
      eventType: 'refund_issued',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId: context.externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      linkedExternalEventId: context.linkedExternalEventId,
      amount: formatMinorUnits(charge.amount_refunded),
      currency: charge.currency.toUpperCase(),
      ...(reason ? { reason } : {}),
      metadata: {
        ...(context.chargeId ? { chargeId: context.chargeId } : {}),
        ...(context.invoiceId ? { invoiceId: context.invoiceId } : {}),
      },
    };
  }

  private async normalizeDisputeCreatedResolved(
    event: Stripe.Event,
    tenantId: string,
    stripe: StripeClientLike,
  ): Promise<EventPayload | null> {
    const dispute = event.data.object as Stripe.Dispute & {
      charge?: string | StripeChargeLike | null;
    };
    const charge = await this.resolveChargeFromDispute(dispute, stripe);
    const context = charge
      ? await this.resolveRefundOrChargebackContext(tenantId, charge, stripe)
      : null;

    if (!context || dispute.amount == null || !dispute.currency) {
      return this.normalizeDisputeCreatedFromMetadata(event);
    }

    return {
      eventType: 'chargeback_opened',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId: context.externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      linkedExternalEventId: context.linkedExternalEventId,
      amount: formatMinorUnits(dispute.amount),
      currency: dispute.currency.toUpperCase(),
      metadata: {
        disputeId: dispute.id,
        ...(context.chargeId ? { chargeId: context.chargeId } : {}),
        ...(context.invoiceId ? { invoiceId: context.invoiceId } : {}),
      },
    };
  }

  private async normalizeDisputeClosedResolved(
    event: Stripe.Event,
    tenantId: string,
    _stripe: StripeClientLike,
  ): Promise<EventPayload | null> {
    const dispute = event.data.object as Stripe.Dispute;
    const context = await this.resolveDisputeResolutionContext(tenantId, dispute.id);
    if (!context) {
      return this.normalizeDisputeClosedFromMetadata(event);
    }

    return buildDisputeClosedPayload(
      event,
      dispute.status,
      context.externalUserId,
      context.linkedExternalEventId,
    );
  }

  private async resolveRefundOrChargebackContext(
    tenantId: string,
    charge: StripeChargeLike,
    stripe: StripeClientLike,
  ): Promise<RefundOrChargebackContext | null> {
    const chargeId = charge.id;
    const metadataExternalUserId = charge.metadata?.externalUserId;
    const metadataLinkedExternalEventId = charge.metadata?.linkedExternalEventId;

    let invoiceId = toId(charge.invoice);
    if (!invoiceId && chargeId) {
      const fetchedCharge = await stripe.charges.retrieve(chargeId);
      invoiceId = toId(fetchedCharge.invoice);
    }

    let linkedEvent = null;
    if (invoiceId) {
      linkedEvent = await this.db.ingestedEvent.findFirst({
        where: {
          tenantId,
          eventType: 'invoice_paid',
          payload: {
            path: ['invoiceId'],
            equals: invoiceId,
          },
        },
        orderBy: { receivedAt: 'desc' },
      });
    }

    let externalUserId = metadataExternalUserId ?? linkedEvent?.externalUserId ?? null;
    const linkedExternalEventId =
      metadataLinkedExternalEventId ?? linkedEvent?.externalEventId ?? null;

    if (!externalUserId && invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      externalUserId = invoice.parent?.subscription_details?.metadata?.externalUserId ?? null;
    }

    if (!externalUserId || !linkedExternalEventId) {
      return null;
    }

    return {
      externalUserId,
      linkedExternalEventId,
      ...(invoiceId ? { invoiceId } : {}),
      ...(chargeId ? { chargeId } : {}),
    };
  }

  private async resolveDisputeResolutionContext(
    tenantId: string,
    disputeId?: string | null,
  ): Promise<RefundOrChargebackContext | null> {
    if (!disputeId) {
      return null;
    }

    const openedEvent = await this.db.ingestedEvent.findFirst({
      where: {
        tenantId,
        eventType: 'chargeback_opened',
        payload: {
          path: ['metadata', 'disputeId'],
          equals: disputeId,
        },
      },
      orderBy: { receivedAt: 'desc' },
    });

    if (!openedEvent?.externalUserId || !openedEvent.externalEventId) {
      return null;
    }

    return {
      externalUserId: openedEvent.externalUserId,
      linkedExternalEventId: openedEvent.externalEventId,
    };
  }

  private async resolveChargeFromDispute(
    dispute: Stripe.Dispute & { charge?: string | StripeChargeLike | null },
    stripe: StripeClientLike,
  ): Promise<StripeChargeLike | null> {
    if (!dispute.charge) {
      return null;
    }

    if (typeof dispute.charge === 'string') {
      return stripe.charges.retrieve(dispute.charge);
    }

    return dispute.charge;
  }
}

function buildDisputeClosedPayload(
  event: Stripe.Event,
  status: string | undefined,
  externalUserId: string,
  linkedExternalEventId: string,
): EventPayload | null {
  if (status === 'won') {
    return {
      eventType: 'chargeback_won',
      idempotencyKey: `stripe:${event.id}`,
      externalEventId: event.id,
      externalUserId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      linkedExternalEventId,
    };
  }

  if (status === 'lost') {
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

function toId(value: string | { id?: string | null } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.id ?? null;
}

function buildWalletCheckoutMetadata(metadata?: Record<string, string> | null) {
  if (!metadata) {
    return null;
  }

  const walletRedemptionId = metadata.walletRedemptionId;
  const appliedCredits = metadata.appliedCredits;
  const tenantUserId = metadata.tenantUserId;
  const userId = metadata.userId;

  if (!walletRedemptionId && !appliedCredits && !tenantUserId && !userId) {
    return null;
  }

  return {
    ...(walletRedemptionId ? { walletRedemptionId } : {}),
    ...(appliedCredits ? { appliedCredits } : {}),
    ...(tenantUserId ? { tenantUserId } : {}),
    ...(userId ? { userId } : {}),
  };
}

export function extractWalletRedemptionLifecycle(
  event: Stripe.Event,
): WalletRedemptionLifecycle | null {
  const object = event.data.object as { metadata?: Record<string, string> | null };
  const walletRedemptionId = object?.metadata?.walletRedemptionId;

  if (!walletRedemptionId) {
    return null;
  }

  if (event.type === 'checkout.session.completed') {
    return { walletRedemptionId, action: 'mark_posted' };
  }

  if (event.type === 'checkout.session.expired') {
    return { walletRedemptionId, action: 'release' };
  }

  return null;
}

function formatMinorUnits(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
