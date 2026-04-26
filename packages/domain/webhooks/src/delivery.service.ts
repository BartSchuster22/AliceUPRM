import { prisma, PrismaClient } from '@uprm/db';
import type { OutboundWebhookConfig, OutboundWebhookEndpoint, OutboundWebhookEvent } from './types';

interface DeliveryRecord {
  id: string;
  tenantId: string;
  eventType: string;
  endpointUrl: string;
  signingSecret: string;
  payload: unknown;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  deliveredAt: Date | null;
  lastStatusCode: number | null;
  lastError: string | null;
  sourceTopic: string | null;
  sourceEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const TERMINAL_STATUSES = new Set(['delivered', 'dead_letter']);

export class WebhookDeliveryService {
  async getSubscribedEndpoints(tenantId: string, eventType: OutboundWebhookEvent['eventType']) {
    const config = await this.db.tenantConfig.findUnique({ where: { tenantId } });
    const outbound = parseOutboundWebhookConfig(config?.webhookConfig);
    if (!outbound?.enabled) {
      return [];
    }

    return outbound.endpoints.filter((endpoint) => endpoint.eventTypes.includes(eventType));
  }

  constructor(private readonly db: PrismaClient = prisma) {}

  async enqueueForEndpoints(
    event: OutboundWebhookEvent,
    endpoints: OutboundWebhookEndpoint[],
  ): Promise<number> {
    let created = 0;

    for (const endpoint of endpoints) {
      if (!endpoint.eventTypes.includes(event.eventType)) {
        continue;
      }

      await this.db.webhookDelivery.create({
        data: {
          tenantId: event.tenantId,
          eventType: event.eventType,
          endpointUrl: endpoint.url,
          signingSecret: endpoint.secret,
          payload: event as any,
          sourceEventId: event.sourceEventId ?? null,
          sourceTopic: event.sourceTopic ?? null,
        },
      });
      created += 1;
    }

    return created;
  }

  async listDeliveries(
    input: {
      tenantId?: string;
      status?: string;
      eventType?: string;
      limit?: number;
    } = {},
  ): Promise<DeliveryRecord[]> {
    return this.db.webhookDelivery.findMany({
      where: {
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.eventType ? { eventType: input.eventType } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: input.limit ?? 100,
    });
  }

  async getDelivery(id: string): Promise<DeliveryRecord | null> {
    return this.db.webhookDelivery.findUnique({ where: { id } });
  }

  async markDelivered(id: string, statusCode: number): Promise<DeliveryRecord> {
    return this.db.webhookDelivery.update({
      where: { id },
      data: {
        status: 'delivered',
        attemptCount: { increment: 1 },
        lastStatusCode: statusCode,
        lastAttemptAt: new Date(),
        deliveredAt: new Date(),
        lastError: null,
      },
    });
  }

  async markFailure(
    id: string,
    input: { statusCode?: number; error: string; retryAt: Date; deadLetter?: boolean },
  ): Promise<DeliveryRecord> {
    return this.db.webhookDelivery.update({
      where: { id },
      data: {
        status: input.deadLetter ? 'dead_letter' : 'retrying',
        attemptCount: { increment: 1 },
        lastStatusCode: input.statusCode ?? null,
        lastAttemptAt: new Date(),
        nextAttemptAt: input.retryAt,
        lastError: input.error.slice(0, 1000),
      },
    });
  }

  async claimDueBatch(now = new Date(), limit = 25): Promise<DeliveryRecord[]> {
    const rows = await this.db.webhookDelivery.findMany({
      where: {
        status: { in: ['pending', 'retrying'] },
        nextAttemptAt: { lte: now },
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    const claimed = [] as typeof rows;
    for (const row of rows) {
      const result = await this.db.webhookDelivery.updateMany({
        where: {
          id: row.id,
          status: row.status,
          nextAttemptAt: row.nextAttemptAt,
        },
        data: { status: 'delivering' },
      });
      if (result.count === 1) {
        claimed.push({ ...row, status: 'delivering' });
      }
    }
    return claimed;
  }

  async replayDelivery(id: string): Promise<DeliveryRecord> {
    const existing = await this.db.webhookDelivery.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('webhook delivery not found');
    }
    if (!TERMINAL_STATUSES.has(existing.status) && existing.status !== 'retrying') {
      throw new Error('webhook delivery is not replayable yet');
    }

    return this.db.webhookDelivery.create({
      data: {
        tenantId: existing.tenantId,
        eventType: existing.eventType,
        endpointUrl: existing.endpointUrl,
        signingSecret: existing.signingSecret,
        payload: existing.payload as any,
        status: 'pending',
        nextAttemptAt: new Date(),
        sourceEventId: existing.sourceEventId,
        sourceTopic: existing.sourceTopic,
      },
    });
  }
}

function parseOutboundWebhookConfig(raw: unknown): OutboundWebhookConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const outbound = (raw as { outbound?: unknown }).outbound;
  if (!outbound || typeof outbound !== 'object') return null;

  const enabled = Boolean((outbound as { enabled?: unknown }).enabled);
  const endpointsRaw = Array.isArray((outbound as { endpoints?: unknown[] }).endpoints)
    ? (outbound as { endpoints: unknown[] }).endpoints
    : [];

  const endpoints: OutboundWebhookEndpoint[] = endpointsRaw
    .filter(
      (endpoint): endpoint is Record<string, unknown> =>
        typeof endpoint === 'object' && endpoint !== null,
    )
    .map((endpoint) => ({
      id: String(endpoint.id ?? ''),
      url: String(endpoint.url ?? ''),
      secret: String(endpoint.secret ?? ''),
      eventTypes: Array.isArray(endpoint.eventTypes)
        ? endpoint.eventTypes.filter(
            (value): value is OutboundWebhookEndpoint['eventTypes'][number] =>
              value === 'reward.created' ||
              value === 'reward.approved' ||
              value === 'refund.reversed' ||
              value === 'wallet.balance.changed',
          )
        : [],
    }))
    .filter(
      (endpoint) =>
        endpoint.id && endpoint.url && endpoint.secret && endpoint.eventTypes.length > 0,
    );

  return { enabled, endpoints };
}
