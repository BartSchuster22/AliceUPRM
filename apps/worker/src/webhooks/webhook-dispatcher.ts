import { createWebhookSignature, WebhookDeliveryService } from '@uprm/webhooks';

export interface DispatcherMetrics {
  delivered: number;
  failed: number;
  deadLetter: number;
  replayed: number;
  batches: number;
}

export interface FetchLike {
  (
    input: string,
    init?: RequestInit,
  ): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
  }>;
}

export class WebhookDispatcher {
  private running = false;
  private readonly service: WebhookDeliveryService;

  public metrics: DispatcherMetrics = {
    delivered: 0,
    failed: 0,
    deadLetter: 0,
    replayed: 0,
    batches: 0,
  };

  constructor(
    private readonly fetchImpl: FetchLike = fetch as FetchLike,
    service = new WebhookDeliveryService(),
  ) {
    this.service = service;
  }

  async dispatchBatch(now = new Date(), limit = 25): Promise<number> {
    const claimed = await this.service.claimDueBatch(now, limit);
    if (!claimed.length) {
      return 0;
    }

    let delivered = 0;
    for (const row of claimed) {
      try {
        const payload = row.payload as Record<string, unknown>;
        const signature = createWebhookSignature(row.signingSecret, payload);
        const response = await this.fetchImpl(row.endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'UPRM-Signature': signature.header,
          },
          body: signature.payloadJson,
        });

        if (response.ok) {
          await this.service.markDelivered(row.id, response.status);
          this.metrics.delivered += 1;
          delivered += 1;
          continue;
        }

        const body = await response.text();
        const deadLetter = this.shouldDeadLetter(
          row.attemptCount + 1,
          row.createdAt,
          now,
        );
        await this.service.markFailure(row.id, {
          statusCode: response.status,
          error: body || `HTTP ${response.status}`,
          retryAt: this.computeRetryAt(now, row.attemptCount + 1),
          deadLetter,
        });
        if (deadLetter) this.metrics.deadLetter += 1;
        else this.metrics.failed += 1;
      } catch (error: any) {
        const deadLetter = this.shouldDeadLetter(
          row.attemptCount + 1,
          row.createdAt,
          now,
        );
        await this.service.markFailure(row.id, {
          error: error?.message ?? 'network error',
          retryAt: this.computeRetryAt(now, row.attemptCount + 1),
          deadLetter,
        });
        if (deadLetter) this.metrics.deadLetter += 1;
        else this.metrics.failed += 1;
      }
    }

    this.metrics.batches += 1;
    return delivered;
  }

  async replay(id: string): Promise<unknown> {
    this.metrics.replayed += 1;
    return this.service.replayDelivery(id);
  }

  async startLoop(intervalMs = 5000): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        const n = await this.dispatchBatch();
        if (n === 0) {
          await sleep(intervalMs);
        }
      } catch (error) {
        console.error('[webhooks] dispatcher loop error', error);
        await sleep(intervalMs * 2);
      }
    }
  }

  stop() {
    this.running = false;
  }

  private computeRetryAt(now: Date, attemptNumber: number) {
    const seconds = Math.min(
      60 * 60 * 24,
      2 ** Math.min(attemptNumber, 10) * 30,
    );
    return new Date(now.getTime() + seconds * 1000);
  }

  private shouldDeadLetter(attemptNumber: number, createdAt: Date, now: Date) {
    const ageMs = now.getTime() - createdAt.getTime();
    return attemptNumber >= 6 || ageMs >= 24 * 60 * 60 * 1000;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
