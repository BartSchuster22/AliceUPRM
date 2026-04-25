import { z } from 'zod';

// Common fields present on every event envelope
const commonFields = {
  idempotencyKey: z.string().min(8).max(128),
  externalEventId: z.string().min(1).max(128),
  externalUserId: z.string().min(1).max(128).optional(),
  occurredAt: z.string().datetime().optional(),
  linkedExternalEventId: z.string().min(1).max(128).optional(),
};

export const EVENT_SCHEMAS = {
  user_registered: z.object({
    eventType: z.literal('user_registered'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    email: z.string().email().optional(),
    referralCode: z.string().min(1).max(32).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  email_verified: z.object({
    eventType: z.literal('email_verified'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
  }),

  subscription_started: z.object({
    eventType: z.literal('subscription_started'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    subscriptionId: z.string().min(1).max(128),
    plan: z.string().min(1).max(64),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  subscription_paid: z.object({
    eventType: z.literal('subscription_paid'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    subscriptionId: z.string().min(1).max(128),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
    invoiceId: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  invoice_paid: z.object({
    eventType: z.literal('invoice_paid'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    invoiceId: z.string().min(1).max(128),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  purchase_completed: z.object({
    eventType: z.literal('purchase_completed'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    purchaseId: z.string().min(1).max(128),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  refund_issued: z.object({
    eventType: z.literal('refund_issued'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    linkedExternalEventId: z.string().min(1).max(128),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
    reason: z.string().max(256).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  subscription_cancelled: z.object({
    eventType: z.literal('subscription_cancelled'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    subscriptionId: z.string().min(1).max(128),
    reason: z.string().max(256).optional(),
  }),

  chargeback_opened: z.object({
    eventType: z.literal('chargeback_opened'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    linkedExternalEventId: z.string().min(1).max(128),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  chargeback_won: z.object({
    eventType: z.literal('chargeback_won'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    linkedExternalEventId: z.string().min(1).max(128),
  }),

  chargeback_lost: z.object({
    eventType: z.literal('chargeback_lost'),
    ...commonFields,
    externalUserId: z.string().min(1).max(128),
    linkedExternalEventId: z.string().min(1).max(128),
  }),
};

export type EventType = keyof typeof EVENT_SCHEMAS;
export type EventPayload = { [K in EventType]: z.infer<(typeof EVENT_SCHEMAS)[K]> }[EventType];

export const EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as EventType[];

export function isKnownEventType(t: unknown): t is EventType {
  return typeof t === 'string' && t in EVENT_SCHEMAS;
}

export function validateEvent(body: unknown): EventPayload {
  if (typeof body !== 'object' || body === null) {
    throw new EventValidationError('payload must be an object', []);
  }
  const rawType = (body as any).eventType;
  if (!isKnownEventType(rawType)) {
    throw new EventValidationError(`unknown eventType: ${String(rawType)}`, [
      { path: ['eventType'], message: 'unknown event type' },
    ]);
  }
  const schema = EVENT_SCHEMAS[rawType];
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new EventValidationError(
      'payload validation failed',
      result.error.issues.map((i) => ({ path: i.path.map((p) => String(p)), message: i.message })),
    );
  }
  return result.data as EventPayload;
}

export class EventValidationError extends Error {
  constructor(
    message: string,
    public issues: Array<{ path: (string | number)[]; message: string }>,
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}
