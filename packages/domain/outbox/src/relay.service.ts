import { prisma, PrismaClient } from '@uprm/db';
import type { Publisher } from './publisher';

export interface RelayMetrics {
  dispatched: number;
  failed: number;
  batchesProcessed: number;
  lastBatchAt?: Date;
}

export interface RelayOptions {
  batchSize?: number;
  maxAttempts?: number;
}

export class OutboxRelayService {
  public readonly metrics: RelayMetrics = {
    dispatched: 0,
    failed: 0,
    batchesProcessed: 0,
  };

  constructor(
    private readonly publisher: Publisher,
    private readonly db: PrismaClient = prisma,
  ) {}

  /**
   * Claim and dispatch one batch of pending messages.
   * Returns the number of messages successfully dispatched.
   *
   * Uses FOR UPDATE SKIP LOCKED so multiple workers can run in parallel safely.
   */
  async dispatchBatch(opts: RelayOptions = {}): Promise<number> {
    const batchSize = opts.batchSize ?? 50;
    const maxAttempts = opts.maxAttempts ?? 10;

    // Claim a batch in a short transaction — locks rows for this worker
    // and marks them 'in_progress' so a sibling poll won't pick them up.
    const claimed = await this.db.$transaction(async (tx) => {
      const rows: Array<{ id: string; topic: string; payload: any; attempts: number }> =
        await tx.$queryRawUnsafe(
          `SELECT id, topic, payload, attempts
             FROM outbox_messages
             WHERE status = 'pending' AND attempts < $1
             ORDER BY "createdAt" ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED`,
          maxAttempts,
          batchSize,
        );

      if (rows.length === 0) return rows;

      await tx.outboxMessage.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'in_progress' },
      });
      return rows;
    });

    let dispatched = 0;
    for (const msg of claimed) {
      try {
        await this.publisher.publish(msg.topic, msg.payload);
        await this.db.outboxMessage.update({
          where: { id: msg.id },
          data: { status: 'dispatched', dispatchedAt: new Date() },
        });
        this.metrics.dispatched++;
        dispatched++;
      } catch (e: any) {
        // Put the message back in 'pending' with an incremented attempt counter.
        await this.db.outboxMessage.update({
          where: { id: msg.id },
          data: {
            status: 'pending',
            attempts: { increment: 1 },
            lastError: (e?.message ?? 'publish failed').slice(0, 256),
          },
        });
        this.metrics.failed++;
      }
    }

    this.metrics.batchesProcessed++;
    this.metrics.lastBatchAt = new Date();
    return dispatched;
  }

  /**
   * Run the poll loop forever until `stop()` is called.
   */
  async startLoop(opts: RelayOptions & { intervalMs?: number } = {}): Promise<void> {
    const intervalMs = opts.intervalMs ?? 1000;
    this.running = true;
    while (this.running) {
      try {
        const n = await this.dispatchBatch(opts);
        // If we dispatched a full batch, loop again immediately; else sleep.
        if (n === 0) {
          await sleep(intervalMs);
        }
      } catch (e: any) {
        // Never crash the loop on transient errors — log + backoff.
        // eslint-disable-next-line no-console
        console.error('[outbox] loop error:', e?.message ?? e);
        await sleep(intervalMs * 3);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private running = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
