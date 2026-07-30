import * as amqplib from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { prisma } from '@uprm/db';
import {
  RewardService,
  ScheduledPostingService,
  parseRewardConfig,
  type TriggerEvent,
  type Ancestor,
} from '@uprm/rewards';
import { ReferralService } from '@uprm/referrals';

const QUEUE = 'uprm.worker.rewards';
const EXCHANGE = 'uprm.events';

type RewardSchedulerService = Pick<
  ScheduledPostingService,
  'compensateForLinkedEvent' | 'scheduleRewards'
>;
type RewardCalculator = Pick<RewardService, 'computeRewards'>;
type ReferralChainService = Pick<ReferralService, 'getEffectiveReferralChain'>;

interface EffectiveReferralRow {
  ancestorTenantId: string;
  ancestorTenantUserId: string;
  depth: number;
}

interface RewardEventPayload {
  eventId: string;
  tenantId: string;
  eventType: string;
  externalUserId?: string;
  amount?: string | number;
  currency?: string;
  occurredAt?: string | number;
}

export class RewardConsumer {
  private conn: ChannelModel | null = null;
  private channel: Channel | null = null;
  private running = false;

  private readonly rewards: RewardCalculator;
  private readonly scheduler: RewardSchedulerService;
  private readonly referrals: ReferralChainService;

  public metrics = {
    consumed: 0,
    scheduled: 0,
    skipped: 0,
    errored: 0,
  };

  constructor(
    private readonly amqpUrl: string,
    dependencies: {
      rewards?: RewardCalculator;
      scheduler?: RewardSchedulerService;
      referrals?: ReferralChainService;
    } = {},
  ) {
    this.rewards = dependencies.rewards ?? new RewardService();
    this.scheduler =
      dependencies.scheduler ?? new ScheduledPostingService(prisma);
    this.referrals = dependencies.referrals ?? new ReferralService(prisma);
  }

  async start(): Promise<void> {
    this.conn = await amqplib.connect(this.amqpUrl);
    this.channel = await this.conn.createChannel();
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await this.channel.assertQueue(QUEUE, { durable: true });
    await this.channel.bindQueue(QUEUE, EXCHANGE, 'uprm.events.*');
    await this.channel.prefetch(10);

    this.running = true;
    await this.channel.consume(
      QUEUE,
      (msg) => {
        void this.handle(msg);
      },
      { noAck: false },
    );
    console.log(`[rewards] consumer started, queue=${QUEUE}`);
  }

  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.channel?.close();
    } catch {
      // The channel may already be closed after a connection failure.
    }
    try {
      await this.conn?.close();
    } catch {
      // The connection may already be closed after a broker failure.
    }
    this.channel = null;
    this.conn = null;
  }

  private async handle(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel || !this.running) return;
    let payload: unknown;
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as unknown;
    } catch (error: unknown) {
      console.error('[rewards] bad payload, dropping', error);
      this.channel.nack(msg, false, false);
      this.metrics.errored++;
      return;
    }

    try {
      await this.processEvent(payload);
      this.channel.ack(msg);
      this.metrics.consumed++;
    } catch (error: unknown) {
      console.error(
        '[rewards] processing failed:',
        error instanceof Error ? error.message : error,
      );
      this.channel.nack(msg, false, true);
      this.metrics.errored++;
    }
  }

  private async processEvent(rawPayload: unknown): Promise<void> {
    const payload = parseEventPayload(rawPayload);
    const {
      eventId,
      tenantId,
      eventType,
      externalUserId,
      amount,
      currency,
      occurredAt,
    } = payload;

    if (eventType === 'refund_issued' || eventType === 'chargeback_opened') {
      const result = await this.scheduler.compensateForLinkedEvent({
        tenantId,
        compensatingEventId: eventId,
        compensatingEventType: eventType,
      });
      this.metrics.skipped += result.skipped;
      return;
    }

    if (!amount || !currency) {
      this.metrics.skipped++;
      return;
    }

    const config = await this.loadRewardConfig(tenantId);
    if (!config) {
      this.metrics.skipped++;
      return;
    }

    if (!externalUserId) {
      this.metrics.skipped++;
      return;
    }
    const tenantUser = await prisma.tenantUser.findUnique({
      where: { tenantId_externalUserId: { tenantId, externalUserId } },
    });
    if (!tenantUser) {
      console.warn(
        `[rewards] event ${eventId} references unknown externalUserId ${externalUserId}`,
      );
      this.metrics.skipped++;
      return;
    }

    const effectiveChain = (await this.referrals.getEffectiveReferralChain(
      tenantId,
      tenantUser.id,
      Math.max(config.tiers.length, 3),
    )) as unknown as EffectiveReferralRow[];
    const ancestors: Ancestor[] = effectiveChain
      .filter((row) => row.ancestorTenantId === tenantId)
      .map((row) => ({
        tenantUserId: row.ancestorTenantUserId,
        depth: row.depth,
      }));

    const amountMinor = this.parseMoneyToMinor(String(amount));
    const event: TriggerEvent = {
      tenantId,
      eventId,
      eventType,
      occurredAt: occurredAt !== undefined ? new Date(occurredAt) : new Date(),
      referredTenantUserId: tenantUser.id,
      amountMinor,
      currency,
    };

    const result = this.rewards.computeRewards(event, config, ancestors);
    if (!result.eligible) {
      this.metrics.skipped++;
      return;
    }

    const scheduled = await this.scheduler.scheduleRewards({
      event,
      rewards: result.rewards,
      postAt: result.postAt,
    });
    this.metrics.scheduled += scheduled.scheduled;
    this.metrics.skipped += scheduled.skipped;
  }

  private async loadRewardConfig(tenantId: string) {
    const cfg = await prisma.tenantConfig.findUnique({ where: { tenantId } });
    if (!cfg || !cfg.rewardConfig) return null;
    try {
      const parsed = parseRewardConfig(cfg.rewardConfig);
      return parsed.enabled ? parsed : null;
    } catch (error: unknown) {
      console.error(`[rewards] invalid config for tenant ${tenantId}:`, error);
      return null;
    }
  }

  private parseMoneyToMinor(s: string): bigint {
    const [whole, frac = ''] = s.split('.');
    const cents = (frac + '00').slice(0, 2);
    return BigInt(whole ?? '0') * 100n + BigInt(cents || '0');
  }
}

function parseEventPayload(payload: unknown): RewardEventPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('missing required event fields');
  }
  const record = payload as Record<string, unknown>;
  if (
    typeof record.eventId !== 'string' ||
    !record.eventId ||
    typeof record.tenantId !== 'string' ||
    !record.tenantId ||
    typeof record.eventType !== 'string' ||
    !record.eventType
  ) {
    throw new Error('missing required event fields');
  }
  return {
    eventId: record.eventId,
    tenantId: record.tenantId,
    eventType: record.eventType,
    externalUserId:
      typeof record.externalUserId === 'string'
        ? record.externalUserId
        : undefined,
    amount:
      typeof record.amount === 'string' || typeof record.amount === 'number'
        ? record.amount
        : undefined,
    currency: typeof record.currency === 'string' ? record.currency : undefined,
    occurredAt:
      typeof record.occurredAt === 'string' ||
      typeof record.occurredAt === 'number'
        ? record.occurredAt
        : undefined,
  };
}
