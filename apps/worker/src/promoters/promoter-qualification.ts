import { prisma } from '@uprm/db';
import { PromoterService } from '@uprm/promoter';

interface TenantLookup {
  tenant: {
    findMany(input: { select: { id: true } }): Promise<Array<{ id: string }>>;
  };
}

type PromoterQualificationService = Pick<
  PromoterService,
  'rollupDailyMetrics' | 'evaluateAutoQualifications'
>;

export class PromoterQualificationRunner {
  private running = false;
  private readonly intervalMs: number;
  private readonly db: TenantLookup;
  private readonly promoter: PromoterQualificationService;

  public metrics = {
    rollups: 0,
    transitions: 0,
    failures: 0,
    lastSuccessUnix: 0,
  };

  constructor(
    input?: { intervalMs?: number },
    dependencies: {
      db?: TenantLookup;
      promoter?: PromoterQualificationService;
    } = {},
  ) {
    this.intervalMs = input?.intervalMs ?? 15 * 60_000;
    this.db = dependencies.db ?? prisma;
    this.promoter = dependencies.promoter ?? new PromoterService(prisma);
  }

  async runOnce(asOf = new Date()): Promise<void> {
    const tenants = await this.db.tenant.findMany({ select: { id: true } });

    for (const tenant of tenants) {
      try {
        const rolled = await this.promoter.rollupDailyMetrics({
          tenantId: tenant.id,
          date: asOf,
        });
        const evaluated = await this.promoter.evaluateAutoQualifications({
          asOf,
        });
        this.metrics.rollups += rolled.rows;
        this.metrics.transitions += evaluated.transitions;
        this.metrics.lastSuccessUnix = Math.floor(Date.now() / 1000);
      } catch (error: unknown) {
        this.metrics.failures += 1;
        console.error(
          '[promoter-qualification] error:',
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
