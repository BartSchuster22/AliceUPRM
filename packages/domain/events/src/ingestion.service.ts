import { prisma, PrismaClient } from '@uprm/db';
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
  constructor(private db: PrismaClient = prisma) {}

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
          // If the linked event doesn't exist yet, we don't fail — the event processor
          // will handle the relationship later. Out-of-order arrival is normal.
        }

        return event;
      });

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
