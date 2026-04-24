import { prisma, PrismaClient } from '@uprm/db';
import { parseFraudConfig } from './config';
import type {
  FraudActor,
  FraudCaseDetail,
  FraudCaseSummary,
  FraudConfig,
  FraudSeverity,
  FraudSignalInput,
  RecordSignalResult,
} from './types';

const ACTIVE_CASE_STATUSES = ['open', 'escalated'] as const;

type DbClient = PrismaClient;

export class FraudService {
  constructor(private readonly db: DbClient = prisma) {}

  async recordSignal(input: FraudSignalInput): Promise<RecordSignalResult | null> {
    const config = await this.loadConfig(input.tenantId);
    if (!config.enabled) {
      return null;
    }

    if (input.dedupeKey) {
      const existing = await this.db.riskSignal.findFirst({
        where: { tenantId: input.tenantId, dedupeKey: input.dedupeKey },
      });
      if (existing) {
        return {
          signal: toSignalResult(existing),
          caseOpened: null,
          rollingScore: await this.computeRollingScore(
            input.tenantId,
            existing.tenantUserId,
            config,
            existing.createdAt,
          ),
        };
      }
    }

    const score = input.score ?? config.signalWeights[input.signalType];
    const createdAt = input.createdAt ?? new Date();
    const signal = await this.db.riskSignal.create({
      data: {
        tenantId: input.tenantId,
        tenantUserId: input.tenantUserId ?? null,
        signalType: input.signalType,
        score,
        severity: scoreToSeverity(score),
        dedupeKey: input.dedupeKey ?? null,
        sourceEventId: input.sourceEventId ?? null,
        metadata: sanitizeJson(input.metadata ?? {}) as any,
        createdAt,
      },
    });

    const rollingScore = await this.computeRollingScore(
      input.tenantId,
      signal.tenantUserId,
      config,
      createdAt,
    );
    let caseOpened: FraudCaseSummary | null = null;

    if (signal.tenantUserId && rollingScore >= config.caseThreshold) {
      caseOpened = await this.ensureOpenCase({
        tenantId: signal.tenantId,
        tenantUserId: signal.tenantUserId,
        scoreTotal: rollingScore,
        config,
        signalId: signal.id,
        actor: { actorType: 'system' },
      });
    }

    return {
      signal: toSignalResult(signal),
      caseOpened,
      rollingScore,
    };
  }

  async listCases(
    filters: {
      tenantId?: string;
      status?: string;
      severity?: string;
      limit?: number;
    } = {},
  ): Promise<FraudCaseSummary[]> {
    const rows = await this.db.riskCase.findMany({
      where: {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
      },
      include: {
        rewardHolds: true,
      },
      orderBy: [{ openedAt: 'desc' }],
      take: filters.limit ?? 100,
    });

    return rows.map(toCaseSummary);
  }

  async getCase(id: string): Promise<FraudCaseDetail | null> {
    const row = await this.db.riskCase.findUnique({
      where: { id },
      include: {
        openedBySignal: true,
        events: { orderBy: [{ createdAt: 'desc' }] },
        rewardHolds: { orderBy: [{ createdAt: 'desc' }] },
      },
    });
    if (!row) {
      return null;
    }

    const relatedSignals = row.tenantUserId
      ? await this.db.riskSignal.findMany({
          where: {
            tenantId: row.tenantId,
            tenantUserId: row.tenantUserId,
          },
          orderBy: [{ createdAt: 'desc' }],
          take: 20,
        })
      : [];

    return {
      ...toCaseSummary(row),
      openedBySignal: row.openedBySignal
        ? {
            id: row.openedBySignal.id,
            signalType: row.openedBySignal.signalType,
            score: row.openedBySignal.score,
            severity: row.openedBySignal.severity,
            metadata: asRecord(row.openedBySignal.metadata),
            createdAt: row.openedBySignal.createdAt,
          }
        : null,
      events: row.events.map((event) => ({
        id: event.id,
        actorType: event.actorType,
        actorId: event.actorId,
        action: event.action,
        beforeJson: asNullableRecord(event.beforeJson),
        afterJson: asNullableRecord(event.afterJson),
        createdAt: event.createdAt,
      })),
      rewardHolds: row.rewardHolds.map((hold) => ({
        id: hold.id,
        scheduledPostingId: hold.scheduledPostingId,
        status: hold.status as 'active' | 'released' | 'rejected',
        reasonCode: hold.reasonCode,
        createdAt: hold.createdAt,
        releasedAt: hold.releasedAt,
        rejectedAt: hold.rejectedAt,
      })),
      relatedSignals: relatedSignals.map((signal) => ({
        id: signal.id,
        signalType: signal.signalType,
        score: signal.score,
        severity: signal.severity,
        metadata: asRecord(signal.metadata),
        createdAt: signal.createdAt,
      })),
    };
  }

  async allowCase(id: string, actor: FraudActor, note?: string): Promise<FraudCaseDetail> {
    await this.db.$transaction(async (tx) => {
      const current = await tx.riskCase.findUnique({ where: { id } });
      if (!current) throw new Error('risk case not found');
      if (!isActiveCaseStatus(current.status)) {
        throw new Error('risk case is not open');
      }

      await tx.rewardHold.updateMany({
        where: { riskCaseId: id, status: 'active' },
        data: { status: 'released', releasedAt: new Date() },
      });

      await tx.riskCase.update({
        where: { id },
        data: {
          status: 'allowed',
          resolution: 'allow',
          resolutionNote: note ?? null,
          resolvedAt: new Date(),
        },
      });

      await tx.riskCaseEvent.create({
        data: {
          riskCaseId: id,
          actorType: actor.actorType,
          actorId: actor.actorId ?? null,
          action: 'allow',
          beforeJson: { status: current.status },
          afterJson: { status: 'allowed', resolution: 'allow', note: note ?? null },
        },
      });
    });

    const detail = await this.getCase(id);
    if (!detail) throw new Error('risk case not found after allow');
    return detail;
  }

  async rejectCase(id: string, actor: FraudActor, note?: string): Promise<FraudCaseDetail> {
    await this.db.$transaction(async (tx) => {
      const current = await tx.riskCase.findUnique({ where: { id } });
      if (!current) throw new Error('risk case not found');
      if (!isActiveCaseStatus(current.status)) {
        throw new Error('risk case is not open');
      }

      const holds = await tx.rewardHold.findMany({
        where: { riskCaseId: id, status: 'active' },
      });
      const scheduledPostingIds = holds.map((hold) => hold.scheduledPostingId);

      if (scheduledPostingIds.length > 0) {
        await tx.scheduledPosting.updateMany({
          where: {
            id: { in: scheduledPostingIds },
            status: 'pending',
          },
          data: {
            status: 'cancelled',
            cancelReason: note?.slice(0, 256) ?? 'fraud_case_rejected',
          },
        });
      }

      await tx.rewardHold.updateMany({
        where: { riskCaseId: id, status: 'active' },
        data: { status: 'rejected', rejectedAt: new Date() },
      });

      await tx.riskCase.update({
        where: { id },
        data: {
          status: 'rejected',
          resolution: 'reject',
          resolutionNote: note ?? null,
          resolvedAt: new Date(),
        },
      });

      await tx.riskCaseEvent.create({
        data: {
          riskCaseId: id,
          actorType: actor.actorType,
          actorId: actor.actorId ?? null,
          action: 'reject',
          beforeJson: { status: current.status },
          afterJson: { status: 'rejected', resolution: 'reject', note: note ?? null },
        },
      });
    });

    const detail = await this.getCase(id);
    if (!detail) throw new Error('risk case not found after reject');
    return detail;
  }

  async escalateCase(id: string, actor: FraudActor, note?: string): Promise<FraudCaseDetail> {
    await this.db.$transaction(async (tx) => {
      const current = await tx.riskCase.findUnique({ where: { id } });
      if (!current) throw new Error('risk case not found');
      if (!isActiveCaseStatus(current.status)) {
        throw new Error('risk case is not open');
      }

      const nextSeverity = raiseSeverity(current.severity as FraudSeverity);
      await tx.riskCase.update({
        where: { id },
        data: {
          status: 'escalated',
          severity: nextSeverity,
          resolution: 'escalate',
          resolutionNote: note ?? null,
        },
      });

      await tx.riskCaseEvent.create({
        data: {
          riskCaseId: id,
          actorType: actor.actorType,
          actorId: actor.actorId ?? null,
          action: 'escalate',
          beforeJson: { status: current.status, severity: current.severity },
          afterJson: { status: 'escalated', severity: nextSeverity, note: note ?? null },
        },
      });
    });

    const detail = await this.getCase(id);
    if (!detail) throw new Error('risk case not found after escalate');
    return detail;
  }

  async getActiveHoldForScheduledPosting(scheduledPostingId: string) {
    return this.db.rewardHold.findFirst({
      where: {
        scheduledPostingId,
        status: 'active',
      },
    });
  }

  async createCaseForUser(input: {
    tenantId: string;
    tenantUserId: string;
    scoreTotal: number;
    signalId?: string | null;
    actor?: FraudActor;
    note?: string;
  }): Promise<FraudCaseSummary> {
    const config = await this.loadConfig(input.tenantId);
    const caseSummary = await this.ensureOpenCase({
      tenantId: input.tenantId,
      tenantUserId: input.tenantUserId,
      scoreTotal: input.scoreTotal,
      signalId: input.signalId ?? null,
      config,
      actor: input.actor ?? { actorType: 'system' },
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    if (!caseSummary) {
      throw new Error('active risk case already exists');
    }
    return caseSummary;
  }

  private async ensureOpenCase(input: {
    tenantId: string;
    tenantUserId: string;
    scoreTotal: number;
    config: FraudConfig;
    signalId?: string | null;
    actor: FraudActor;
    note?: string;
  }): Promise<FraudCaseSummary | null> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.riskCase.findFirst({
        where: {
          tenantId: input.tenantId,
          tenantUserId: input.tenantUserId,
          status: { in: [...ACTIVE_CASE_STATUSES] },
        },
        include: { rewardHolds: true },
      });
      if (existing) {
        return toCaseSummary(existing);
      }

      const fraudCase = await tx.riskCase.create({
        data: {
          tenantId: input.tenantId,
          tenantUserId: input.tenantUserId,
          status: 'open',
          severity: scoreToSeverity(input.scoreTotal),
          scoreTotal: input.scoreTotal,
          thresholdSnapshot: sanitizeJson({
            caseThreshold: input.config.caseThreshold,
            scoreWindowHours: input.config.scoreWindowHours,
            signalWeights: input.config.signalWeights,
          }) as any,
          openedBySignalId: input.signalId ?? null,
        },
      });

      const pendingRewards = await tx.scheduledPosting.findMany({
        where: {
          tenantId: input.tenantId,
          beneficiaryTenantUserId: input.tenantUserId,
          status: 'pending',
        },
      });

      if (pendingRewards.length > 0) {
        await tx.rewardHold.createMany({
          data: pendingRewards.map((row) => ({
            tenantId: row.tenantId,
            tenantUserId: input.tenantUserId,
            scheduledPostingId: row.id,
            riskCaseId: fraudCase.id,
            reasonCode: 'fraud_case_opened',
          })),
          skipDuplicates: true,
        });
      }

      await tx.riskCaseEvent.create({
        data: {
          riskCaseId: fraudCase.id,
          actorType: input.actor.actorType,
          actorId: input.actor.actorId ?? null,
          action: 'open',
          beforeJson: null as any,
          afterJson: sanitizeJson({
            status: 'open',
            severity: fraudCase.severity,
            scoreTotal: fraudCase.scoreTotal,
            holdCount: pendingRewards.length,
            note: input.note ?? null,
          }) as any,
        },
      });

      return {
        ...toCaseSummary({
          ...fraudCase,
          rewardHolds: pendingRewards.map((row) => ({ id: row.id })),
        }),
        holdCount: pendingRewards.length,
      };
    });
  }

  private async loadConfig(tenantId: string): Promise<FraudConfig> {
    const config = await this.db.tenantConfig.findUnique({ where: { tenantId } });
    return parseFraudConfig(config?.fraudConfig);
  }

  private async computeRollingScore(
    tenantId: string,
    tenantUserId: string | null,
    config: FraudConfig,
    now: Date,
  ): Promise<number> {
    if (!tenantUserId) {
      return 0;
    }

    const since = new Date(now.getTime() - config.scoreWindowHours * 60 * 60 * 1000);
    const rows = await this.db.riskSignal.findMany({
      where: {
        tenantId,
        tenantUserId,
        status: 'active',
        createdAt: { gte: since },
      },
      select: { score: true },
    });

    return rows.reduce((total, row) => total + row.score, 0);
  }
}

function toSignalResult(row: {
  id: string;
  tenantId: string;
  tenantUserId: string | null;
  signalType: string;
  score: number;
  severity: string;
  status: string;
  dedupeKey: string | null;
  sourceEventId: string | null;
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantUserId: row.tenantUserId,
    signalType: row.signalType,
    score: row.score,
    severity: row.severity,
    status: row.status,
    dedupeKey: row.dedupeKey,
    sourceEventId: row.sourceEventId,
    metadata: asRecord(row.metadata),
    createdAt: row.createdAt,
  };
}

function toCaseSummary(row: {
  id: string;
  tenantId: string;
  tenantUserId: string | null;
  status: string;
  severity: string;
  scoreTotal: number;
  thresholdSnapshot: unknown;
  resolution: string | null;
  resolutionNote: string | null;
  openedBySignalId: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  rewardHolds?: Array<unknown>;
}): FraudCaseSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantUserId: row.tenantUserId,
    status: row.status as FraudCaseSummary['status'],
    severity: row.severity as FraudCaseSummary['severity'],
    scoreTotal: row.scoreTotal,
    thresholdSnapshot: asRecord(row.thresholdSnapshot),
    resolution: row.resolution,
    resolutionNote: row.resolutionNote,
    openedBySignalId: row.openedBySignalId,
    openedAt: row.openedAt,
    resolvedAt: row.resolvedAt,
    holdCount: row.rewardHolds?.length ?? 0,
  };
}

function sanitizeJson(value: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value ?? {}, (_key, nestedValue) =>
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
    ),
  ) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asRecord(value);
}

function scoreToSeverity(score: number): FraudSeverity {
  if (score >= 150) return 'critical';
  if (score >= 100) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function raiseSeverity(severity: FraudSeverity): FraudSeverity {
  switch (severity) {
    case 'low':
      return 'medium';
    case 'medium':
      return 'high';
    case 'high':
      return 'critical';
    case 'critical':
      return 'critical';
  }
}

function isActiveCaseStatus(status: string): boolean {
  return status === 'open' || status === 'escalated';
}
