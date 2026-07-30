import { prisma } from '@uprm/db';
import { ReportingService, type ReportingRangeInput } from '@uprm/reporting';

interface TenantLookup {
  tenant: {
    findMany(input: { select: { id: true } }): Promise<Array<{ id: string }>>;
  };
}

type ReportingRollupService = Pick<ReportingService, 'rebuildAll'>;

export class ReportingRollupRunner {
  private running = false;
  private readonly intervalMs: number;
  private readonly lookbackDays: number;
  private readonly db: TenantLookup;
  private readonly reporting: ReportingRollupService;

  public metrics = {
    rollups: 0,
    failures: 0,
    lastSuccessUnix: 0,
  };

  constructor(
    input?: { intervalMs?: number; lookbackDays?: number },
    dependencies: {
      db?: TenantLookup;
      reporting?: ReportingRollupService;
    } = {},
  ) {
    this.intervalMs = input?.intervalMs ?? 15 * 60_000;
    this.lookbackDays = input?.lookbackDays ?? 90;
    this.db = dependencies.db ?? prisma;
    this.reporting = dependencies.reporting ?? new ReportingService(prisma);
  }

  async runOnce(): Promise<void> {
    const tenants = await this.db.tenant.findMany({ select: { id: true } });
    const now = new Date();
    const from = new Date(now.getTime() - (this.lookbackDays - 1) * 86_400_000);

    for (const tenant of tenants) {
      try {
        const input: ReportingRangeInput & { asOf: Date } = {
          tenantId: tenant.id,
          from,
          to: now,
          asOf: now,
        };
        await this.reporting.rebuildAll(input);
        this.metrics.rollups += 1;
        this.metrics.lastSuccessUnix = Math.floor(Date.now() / 1000);
      } catch (error: unknown) {
        this.metrics.failures += 1;
        console.error(
          '[reporting-rollup] error:',
          tenant.id,
          error instanceof Error ? error.message : error,
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

  stop(): void {
    this.running = false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
