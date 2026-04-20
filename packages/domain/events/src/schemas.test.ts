import { describe, it, expect } from 'vitest';
import { validateEvent, EventValidationError, EVENT_TYPES } from './schemas';

describe('validateEvent', () => {
  it('accepts a valid user_registered event', () => {
    const out = validateEvent({
      eventType: 'user_registered',
      idempotencyKey: 'idem-12345',
      externalEventId: 'ext-1',
      externalUserId: 'user-1',
      email: 'alice@example.com',
    });
    expect(out.eventType).toBe('user_registered');
  });

  it('rejects unknown event types', () => {
    expect(() =>
      validateEvent({
        eventType: 'magical_unicorn',
        idempotencyKey: 'idem-1',
        externalEventId: 'e-1',
      }),
    ).toThrow(EventValidationError);
  });

  it('rejects an invoice_paid with malformed amount', () => {
    expect(() =>
      validateEvent({
        eventType: 'invoice_paid',
        idempotencyKey: 'idem-x',
        externalEventId: 'inv-1',
        externalUserId: 'user-1',
        invoiceId: 'inv-1',
        amount: '12,34', // comma is invalid — must be "12.34"
        currency: 'EUR',
      }),
    ).toThrow(EventValidationError);
  });

  it('accepts a valid invoice_paid', () => {
    const out = validateEvent({
      eventType: 'invoice_paid',
      idempotencyKey: 'idem-inv',
      externalEventId: 'inv-2',
      externalUserId: 'user-1',
      invoiceId: 'inv-2',
      amount: '49.99',
      currency: 'EUR',
    });
    expect((out as any).amount).toBe('49.99');
  });

  it('rejects a refund_issued without linkedExternalEventId', () => {
    expect(() =>
      validateEvent({
        eventType: 'refund_issued',
        idempotencyKey: 'idem-ref',
        externalEventId: 'ref-1',
        externalUserId: 'user-1',
        amount: '10.00',
        currency: 'EUR',
      }),
    ).toThrow(EventValidationError);
  });

  it('registers the expected 11 event types', () => {
    expect(EVENT_TYPES).toEqual([
      'user_registered',
      'email_verified',
      'subscription_started',
      'subscription_paid',
      'invoice_paid',
      'purchase_completed',
      'refund_issued',
      'subscription_cancelled',
      'chargeback_opened',
      'chargeback_won',
      'chargeback_lost',
    ]);
  });

  it('attaches issue paths to validation errors', () => {
    try {
      validateEvent({
        eventType: 'subscription_paid',
        idempotencyKey: 'idem-sub',
        externalEventId: 'sub-1',
        externalUserId: 'user-1',
        subscriptionId: 'sub-1',
        amount: '10.00',
        currency: 'E', // must be length 3
      });
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(EventValidationError);
      expect(Array.isArray(e.issues)).toBe(true);
      expect(e.issues.length).toBeGreaterThan(0);
    }
  });
});
