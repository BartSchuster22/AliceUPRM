import { prisma } from '@uprm/db';
import { ReportingService } from '@uprm/reporting';

export class ReportingRollupRunner {
  private running = false;
  private readonly intervalMs: number;
  private readonly lookbackDays: number;
  private db: any = prisma;
  private reporting: ReportingService = new ReportingService(prisma as any);

  public metrics = {
    rollups: 0,
    failures: 0,
    lastSuccessUnix: 0,
  };

  constructor(input?: { intervalMs?: number; lookbackDays?: number }) {
    this.intervalMs = input?.intervalMs ?? 15 * 60_000;
    this.lookbackDays = input?.lookbackDays ?? 90;
  }

  async runOnce(): Promise<void> {
    const tenants = await this.db.tenant.findMany({ select: { id: true } });
    const now = new Date();
    const from = new Date(now.getTime() - (this.lookbackDays - 1) * 86_400_000);

    for (const tenant of tenants) {
      try {
        await this.reporting.rebuildAll({
          tenantId: tenant.id,
          from,
          to: now,
          asOf: now,
        } as any);
        this.metrics.rollups += 1;
        this.metrics.lastSuccessUnix = Math.floor(Date.now() / 1000);
      } catch (error: any) {
        this.metrics.failures += 1;
        console.error(
          '[reporting-rollup] error:',
          tenant.id,
          error?.message ?? error,
        );
      }
    }
  }

  async startLoop(): Promise<void> {
    this.running = true;
    while (this.running) {
      await this.runOnce();
      await sleep(this.intervalMs);
    }
  }

  stop() {
    this.running = false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
