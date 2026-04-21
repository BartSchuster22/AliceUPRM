import { describe, it, expect, vi } from 'vitest';
import { OutboxRelayService } from './relay.service';
import type { Publisher } from './publisher';

class FakePublisher implements Publisher {
  published: Array<{ topic: string; payload: unknown }> = [];
  failNext = 0;
  async publish(topic: string, payload: unknown): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('simulated publish failure');
    }
    this.published.push({ topic, payload });
  }
  async close(): Promise<void> {}
}

function makeFakeDb(seed: Array<{ id: string; topic: string; payload: any; attempts?: number }>) {
  const rows = seed.map((s) => ({
    id: s.id,
    topic: s.topic,
    payload: s.payload,
    status: 'pending',
    attempts: s.attempts ?? 0,
    dispatchedAt: null as Date | null,
    lastError: null as string | null,
  }));

  const db: any = {
    $transaction: vi.fn(async (fn: any) => fn(db)),
    $queryRawUnsafe: vi.fn(async (_sql: string, maxAttempts: number, limit: number) =>
      rows
        .filter((r) => r.status === 'pending' && r.attempts < maxAttempts)
        .slice(0, limit)
        .map((r) => ({ id: r.id, topic: r.topic, payload: r.payload, attempts: r.attempts })),
    ),
    outboxMessage: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const ids: string[] = where.id.in;
        let count = 0;
        for (const r of rows) {
          if (ids.includes(r.id)) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id);
        if (!r) throw new Error(`no row ${where.id}`);
        if (data.attempts?.increment) {
          r.attempts += data.attempts.increment;
          const copy = { ...data };
          delete copy.attempts;
          Object.assign(r, copy);
        } else {
          Object.assign(r, data);
        }
        return r;
      }),
    },
  };
  return { db, rows };
}

describe('OutboxRelayService.dispatchBatch', () => {
  it('dispatches pending messages and marks them dispatched', async () => {
    const { db, rows } = makeFakeDb([
      { id: 'm1', topic: 'uprm.events.user_registered', payload: { hi: 1 } },
      { id: 'm2', topic: 'uprm.events.user_registered', payload: { hi: 2 } },
    ]);
    const pub = new FakePublisher();
    const svc = new OutboxRelayService(pub, db);

    const count = await svc.dispatchBatch();

    expect(count).toBe(2);
    expect(pub.published).toHaveLength(2);
    expect(rows.every((r) => r.status === 'dispatched')).toBe(true);
    expect(rows.every((r) => r.dispatchedAt !== null)).toBe(true);
    expect(svc.metrics.dispatched).toBe(2);
    expect(svc.metrics.failed).toBe(0);
  });

  it('increments attempts on failure and leaves status pending', async () => {
    const { db, rows } = makeFakeDb([{ id: 'm1', topic: 'uprm.events.x', payload: {} }]);
    const pub = new FakePublisher();
    pub.failNext = 1;
    const svc = new OutboxRelayService(pub, db);

    const count = await svc.dispatchBatch();

    expect(count).toBe(0);
    expect(rows[0]!.status).toBe('pending');
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.lastError).toContain('simulated');
    expect(svc.metrics.failed).toBe(1);
  });

  it('skips messages that have exceeded maxAttempts', async () => {
    const { db, rows } = makeFakeDb([
      { id: 'm1', topic: 'uprm.events.dead', payload: {}, attempts: 10 },
      { id: 'm2', topic: 'uprm.events.live', payload: {}, attempts: 0 },
    ]);
    const pub = new FakePublisher();
    const svc = new OutboxRelayService(pub, db);

    await svc.dispatchBatch({ maxAttempts: 10 });

    expect(pub.published.map((p) => p.topic)).toEqual(['uprm.events.live']);
    expect(rows[0]!.status).toBe('pending'); // untouched
    expect(rows[1]!.status).toBe('dispatched');
  });

  it('returns 0 and does not fail when outbox is empty', async () => {
    const { db } = makeFakeDb([]);
    const pub = new FakePublisher();
    const svc = new OutboxRelayService(pub, db);

    const count = await svc.dispatchBatch();
    expect(count).toBe(0);
    expect(pub.published).toHaveLength(0);
  });
});
