import { prisma, PrismaClient } from '@uprm/db';
import { FraudService, parseFraudConfig } from '@uprm/fraud';
import { validateEvent, EventValidationError, type EventPayload } from './schemas';

export interface IngestInput {
  tenantId: string;
  body: unknown;
}

export interface IngestResult {
  eventId: string;
  processingStatus: string;
  duplicate: boolean;
}

export class EventIngestionService {
  private readonly fraud: FraudService;

  constructor(private db: PrismaClient = prisma) {
    this.fraud = new FraudService(db);
  }

  /**
   * Ingest an event:
   *   1. Validate against the Zod schema for its eventType
   *   2. Check idempotency by (tenantId, idempotencyKey) — return existing if found
   *   3. Otherwise, in ONE transaction:
   *        - insert ingested_events row
   *        - insert outbox_messages row
   *        - if linkedExternalEventId present, insert event_links row
   *
   * The outbox pattern guarantees that if we acknowledge the event to the
   * client (HTTP 202), a downstream worker will eventually publish it.
   */
  async ingest(input: IngestInput): Promise<IngestResult> {
    const payload = validateEvent(input.body);

    // Check idempotency first — cheap lookup, avoids hitting the unique constraint.
    const existing = await this.db.ingestedEvent.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: payload.idempotencyKey,
        },
      },
    });
    if (existing) {
      return {
        eventId: existing.id,
        processingStatus: existing.processingStatus,
        duplicate: true,
      };
    }

    const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
    const externalUserId = (payload as any).externalUserId ?? null;
    const linkedExternalEventId = (payload as any).linkedExternalEventId ?? null;

    try {
      const created = await this.db.$transaction(async (tx) => {
        const event = await tx.ingestedEvent.create({
          data: {
            tenantId: input.tenantId,
            eventType: payload.eventType,
            externalEventId: payload.externalEventId,
            externalUserId,
            payload: payload as any,
            occurredAt,
            idempotencyKey: payload.idempotencyKey,
          },
        });

        await tx.outboxMessage.create({
          data: {
            aggregateId: event.id,
            topic: `uprm.events.${payload.eventType}`,
            payload: {
              eventId: event.id,
              tenantId: input.tenantId,
              ...(payload as object),
            } as any,
          },
        });

        // If this event references a prior event (refund -> purchase, chargeback -> payment),
        // we write an event_link. The link is by external ID here — resolving to internal
        // UUIDs happens later during event processing.
        if (linkedExternalEventId) {
          const linkedEvent = await tx.ingestedEvent.findFirst({
            where: {
              tenantId: input.tenantId,
              externalEventId: linkedExternalEventId,
            },
          });
          if (linkedEvent) {
            await tx.eventLink.create({
              data: {
                tenantId: input.tenantId,
                eventId: event.id,
                linkedEventId: linkedEvent.id,
                linkType: deriveLinkType(payload.eventType),
              },
            });
          }
        }

        const waitingEvents = await tx.ingestedEvent.findMany({
          where: {
            tenantId: input.tenantId,
            payload: {
              path: ['linkedExternalEventId'],
              equals: payload.externalEventId,
            },
          },
          select: {
            id: true,
            eventType: true,
          },
        });

        for (const waitingEvent of waitingEvents) {
          await tx.eventLink.create({
            data: {
              tenantId: input.tenantId,
              eventId: waitingEvent.id,
              linkedEventId: event.id,
              linkType: deriveLinkType(waitingEvent.eventType),
            },
          });
        }

        return event;
      });

      await this.emitFraudSignals(input.tenantId, payload, created.id, occurredAt);

      return {
        eventId: created.id,
        processingStatus: created.processingStatus,
        duplicate: false,
      };
    } catch (e: any) {
      // Race: two concurrent calls with the same idempotency key.
      // Treat as idempotent success by re-fetching.
      if (e?.code === 'P2002') {
        const existing = await this.db.ingestedEvent.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: input.tenantId,
              idempotencyKey: payload.idempotencyKey,
            },
          },
        });
        if (existing) {
          return {
            eventId: existing.id,
            processingStatus: existing.processingStatus,
            duplicate: true,
          };
        }
      }
      throw e;
    }
  }

  private async emitFraudSignals(
    tenantId: string,
    payload: EventPayload,
    eventId: string,
    occurredAt: Date,
  ): Promise<void> {
    const tenantConfig = await this.db.tenantConfig.findUnique({ where: { tenantId } });
    const fraudConfig = parseFraudConfig(tenantConfig?.fraudConfig);
    if (!fraudConfig.enabled) {
      return;
    }

    const metadata = this.getMetadata(payload);
    const externalUserId = (payload as any).externalUserId as string | undefined;
    const tenantUserId = externalUserId
      ? await this.lookupTenantUserId(tenantId, externalUserId)
      : null;

    if (payload.eventType === 'user_registered') {
      const referrerExternalUserId = this.pickString(metadata, [
        'referrerExternalUserId',
        'referredByExternalUserId',
      ]);
      if (externalUserId && referrerExternalUserId && referrerExternalUserId === externalUserId) {
        await this.fraud.recordSignal({
          tenantId,
          tenantUserId,
          signalType: 'self_referral_attempt',
          sourceEventId: eventId,
          metadata: { externalUserId },
          dedupeKey: `self:${tenantId}:${externalUserId}`,
          createdAt: occurredAt,
        });
      }

      const signupIp = this.pickString(metadata, ['signupIp', 'ip', 'clientIp']);
      if (signupIp) {
        const recentRegistrations = await this.db.ingestedEvent.findMany({
          where: {
            tenantId,
            eventType: 'user_registered',
            occurredAt: {
              gte: new Date(occurredAt.getTime() - fraudConfig.clusterWindowDays * 86_400_000),
            },
          },
        });
        const distinctUsers = new Set(
          recentRegistrations
            .filter(
              (row: any) =>
                this.pickString(this.asRecord(row.payload?.metadata), [
                  'signupIp',
                  'ip',
                  'clientIp',
                ]) === signupIp,
            )
            .map((row: any) => row.externalUserId)
            .filter(Boolean),
        );
        if (distinctUsers.size >= 2) {
          await this.fraud.recordSignal({
            tenantId,
            tenantUserId,
            signalType: 'same_ip_multiple_signups',
            sourceEventId: eventId,
            metadata: { signupIp, distinctUsers: Array.from(distinctUsers) },
            dedupeKey: `ip:${tenantId}:${externalUserId ?? 'none'}:${signupIp}`,
            createdAt: occurredAt,
          });
        }
      }

      const referralCode = (payload as any).referralCode as string | undefined;
      if (referralCode) {
        const code = await this.db.referralCode.findFirst({
          where: { tenantId, code: referralCode, status: 'active' },
        });
        if (code) {
          const recentRegistrations = await this.db.ingestedEvent.findMany({
            where: {
              tenantId,
              eventType: 'user_registered',
              occurredAt: {
                gte: new Date(occurredAt.getTime() - fraudConfig.velocityWindowMinutes * 60_000),
              },
            },
          });
          const count = recentRegistrations.filter(
            (row: any) => (row.payload as any)?.referralCode === referralCode,
          ).length;
          if (count >= fraudConfig.velocityReferralCountThreshold) {
            await this.fraud.recordSignal({
              tenantId,
              tenantUserId: code.tenantUserId,
              signalType: 'referral_velocity',
              sourceEventId: eventId,
              metadata: { referralCode, recentReferralCount: count },
              dedupeKey: `velocity:${tenantId}:${code.tenantUserId}:${referralCode}:${count}`,
              createdAt: occurredAt,
            });
          }
        }
      }
    }

    const paymentFingerprint = this.pickString(metadata, ['paymentFingerprint', 'fingerprint']);
    if (paymentFingerprint) {
      const recentEvents = await this.db.ingestedEvent.findMany({
        where: {
          tenantId,
          eventType: {
            in: [
              'subscription_started',
              'subscription_paid',
              'invoice_paid',
              'purchase_completed',
              'refund_issued',
            ],
          },
          occurredAt: {
            gte: new Date(occurredAt.getTime() - fraudConfig.clusterWindowDays * 86_400_000),
          },
        },
      });
      const distinctUsers = new Set(
        recentEvents
          .filter(
            (row: any) =>
              this.pickString(this.asRecord(row.payload?.metadata), [
                'paymentFingerprint',
                'fingerprint',
              ]) === paymentFingerprint,
          )
          .map((row: any) => row.externalUserId)
          .filter(Boolean),
      );
      if (distinctUsers.size >= 2) {
        await this.fraud.recordSignal({
          tenantId,
          tenantUserId,
          signalType: 'same_payment_fingerprint',
          sourceEventId: eventId,
          metadata: { paymentFingerprint, distinctUsers: Array.from(distinctUsers) },
          dedupeKey: `fingerprint:${tenantId}:${externalUserId ?? 'none'}:${paymentFingerprint}`,
          createdAt: occurredAt,
        });
      }
    }

    if (payload.eventType === 'refund_issued' && externalUserId && tenantUserId) {
      const recentEvents = await this.db.ingestedEvent.findMany({
        where: {
          tenantId,
          externalUserId,
          eventType: {
            in: ['refund_issued', 'invoice_paid', 'purchase_completed', 'subscription_paid'],
          },
          occurredAt: {
            gte: new Date(occurredAt.getTime() - fraudConfig.refundRatioWindowDays * 86_400_000),
          },
        },
      });
      const refundCount = recentEvents.filter(
        (row: any) => row.eventType === 'refund_issued',
      ).length;
      const purchaseCount = recentEvents.filter(
        (row: any) => row.eventType !== 'refund_issued',
      ).length;
      const ratio = purchaseCount > 0 ? refundCount / purchaseCount : 0;
      if (purchaseCount > 0 && ratio >= fraudConfig.refundRatioThreshold) {
        await this.fraud.recordSignal({
          tenantId,
          tenantUserId,
          signalType: 'high_refund_ratio_cluster',
          sourceEventId: eventId,
          metadata: { refundCount, purchaseCount, ratio },
          dedupeKey: `refund-ratio:${tenantId}:${tenantUserId}:${refundCount}:${purchaseCount}`,
          createdAt: occurredAt,
        });
      }
    }
  }

  private async lookupTenantUserId(
    tenantId: string,
    externalUserId: string,
  ): Promise<string | null> {
    const tenantUser = await this.db.tenantUser.findUnique({
      where: { tenantId_externalUserId: { tenantId, externalUserId } },
    });
    return tenantUser?.id ?? null;
  }

  private getMetadata(payload: EventPayload): Record<string, unknown> {
    return this.asRecord((payload as any).metadata);
  }

  private pickString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return {};
    }
    return value as Record<string, unknown>;
  }
}

function deriveLinkType(eventType: string): string {
  if (eventType === 'refund_issued') return 'refund_of';
  if (eventType === 'chargeback_opened') return 'chargeback_of';
  if (eventType === 'chargeback_won' || eventType === 'chargeback_lost')
    return 'chargeback_resolution_of';
  return 'related';
}

// Re-export for convenience
export { EventValidationError } from './schemas';
export type { EventPayload } from './schemas';
