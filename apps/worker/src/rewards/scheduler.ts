import { prisma } from '@uprm/db';
import { ScheduledPostingService } from '@uprm/rewards';

export class RewardScheduler {
  private running = false;
  private readonly svc = new ScheduledPostingService(prisma);

  public metrics = {
    posted: 0,
    batches: 0,
  };

  async startLoop(intervalMs = 10_000): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        const result = await this.svc.postDueRewards();
        this.metrics.posted += result.posted;
        this.metrics.batches++;
      } catch (error: unknown) {
        console.error(
          '[rewards-scheduler] error:',
          error instanceof Error ? error.message : error,
        );
      }
      await sleep(intervalMs);
    }
  }

  stop(): void {
    this.running = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
