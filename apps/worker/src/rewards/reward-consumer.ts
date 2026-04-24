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

const QUEUE = 'uprm.worker.rewards';
const EXCHANGE = 'uprm.events';

export class RewardConsumer {
  private conn: ChannelModel | null = null;
  private channel: Channel | null = null;
  private running = false;

  private readonly rewards = new RewardService();
  private readonly scheduler = new ScheduledPostingService(prisma);

  public metrics = {
    consumed: 0,
    scheduled: 0,
    skipped: 0,
    errored: 0,
  };

  constructor(private readonly amqpUrl: string) {}

  async start(): Promise<void> {
    this.conn = await amqplib.connect(this.amqpUrl);
    this.channel = await this.conn.createChannel();
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await this.channel.assertQueue(QUEUE, { durable: true });
    await this.channel.bindQueue(QUEUE, EXCHANGE, 'uprm.events.*');
    await this.channel.prefetch(10);

    this.running = true;
    this.channel.consume(QUEUE, (msg) => this.handle(msg), { noAck: false });
    console.log(`[rewards] consumer started, queue=${QUEUE}`);
  }

  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.channel?.close();
    } catch {}
    try {
      await this.conn?.close();
    } catch {}
    this.channel = null;
    this.conn = null;
  }

  private async handle(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel || !this.running) return;
    let payload: any;
    try {
      payload = JSON.parse(msg.content.toString('utf8'));
    } catch (e) {
      console.error('[rewards] bad payload, dropping', e);
      this.channel.nack(msg, false, false);
      this.metrics.errored++;
      return;
    }

    try {
      await this.processEvent(payload);
      this.channel.ack(msg);
      this.metrics.consumed++;
    } catch (e: any) {
      console.error('[rewards] processing failed:', e?.message ?? e);
      this.channel.nack(msg, false, true);
      this.metrics.errored++;
    }
  }

  private async processEvent(payload: any): Promise<void> {
    const {
      eventId,
      tenantId,
      eventType,
      externalUserId,
      amount,
      currency,
      occurredAt,
    } = payload;

    if (!eventId || !tenantId || !eventType) {
      throw new Error('missing required event fields');
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

    const ancestryRows = await prisma.referralAncestry.findMany({
      where: {
        tenantId,
        descendantTenantUserId: tenantUser.id,
        depth: { gt: 0 },
      },
      orderBy: { depth: 'asc' },
    });
    const ancestors: Ancestor[] = ancestryRows.map((r) => ({
      tenantUserId: r.ancestorTenantUserId,
      depth: r.depth,
    }));

    const amountMinor = this.parseMoneyToMinor(String(amount));
    const event: TriggerEvent = {
      tenantId,
      eventId,
      eventType,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
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
    } catch (e) {
      console.error(`[rewards] invalid config for tenant ${tenantId}:`, e);
      return null;
    }
  }

  private parseMoneyToMinor(s: string): bigint {
    const [whole, frac = ''] = s.split('.');
    const cents = (frac + '00').slice(0, 2);
    return BigInt(whole ?? '0') * 100n + BigInt(cents || '0');
  }
}
