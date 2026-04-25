import type { PrismaClient } from '@uprm/db';

export class PromoterError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'PromoterError';
  }
}

export interface SubmitPromoterApplicationInput {
  tenantId: string;
  tenantUserId: string;
  notes?: string;
  links?: Array<{
    linkType: string;
    url: string;
    proofJson?: Record<string, unknown>;
  }>;
}

export interface ReviewPromoterApplicationInput {
  applicationId: string;
  adminUserId: string;
  note?: string;
}

export interface GetPromoterStatusInput {
  tenantId: string;
  tenantUserId: string;
}

export interface RollupPromoterMetricsInput {
  tenantId: string;
  date: Date;
}

export interface EvaluateAutoQualificationsInput {
  asOf: Date;
}

export class PromoterService {
  private readonly db: PrismaClient;

  constructor(db?: PrismaClient) {
    if (db) {
      this.db = db;
      return;
    }

    this.db = require('@uprm/db').prisma as PrismaClient;
  }

  async submitApplication(input: SubmitPromoterApplicationInput): Promise<any> {
    const tenantUser = await this.db.tenantUser.findFirst({
      where: { id: input.tenantUserId, tenantId: input.tenantId },
    });
    if (!tenantUser) {
      throw new PromoterError('tenant user not found', 'TENANT_USER_NOT_FOUND');
    }

    const existing = await this.db.promoterApplication.findFirst({
      where: {
        tenantId: input.tenantId,
        tenantUserId: input.tenantUserId,
        status: { in: ['submitted', 'under_review'] },
      },
      orderBy: { submittedAt: 'desc' },
    } as any);
    if (existing) {
      throw new PromoterError('promoter application already open', 'APPLICATION_ALREADY_OPEN');
    }

    return this.db.$transaction(async (tx: any) => {
      const application = await tx.promoterApplication.create({
        data: {
          tenantId: input.tenantId,
          tenantUserId: input.tenantUserId,
          status: 'submitted',
          notes: input.notes ?? null,
        },
      });

      if (input.links?.length) {
        await tx.promoterApplicationLink.createMany({
          data: input.links.map((link) => ({
            applicationId: application.id,
            linkType: link.linkType,
            url: link.url,
            verificationStatus: 'unverified',
            proofJson: link.proofJson ?? null,
          })),
        });
      }

      return application;
    });
  }

  async listApplications(filters?: { status?: string }): Promise<any[]> {
    return this.db.promoterApplication.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: { links: true },
      orderBy: { submittedAt: 'desc' },
    } as any);
  }

  async getApplication(applicationId: string): Promise<any | null> {
    return this.db.promoterApplication.findUnique({
      where: { id: applicationId },
      include: { links: true },
    } as any);
  }

  async approveApplication(input: ReviewPromoterApplicationInput): Promise<any> {
    const application = await this.requireSubmittedApplication(input.applicationId);

    return this.db.$transaction(async (tx: any) => {
      await tx.promoterProfile.updateMany({
        where: {
          tenantId: application.tenantId,
          tenantUserId: application.tenantUserId,
          effectiveTo: null,
        },
        data: {
          effectiveTo: new Date(),
        },
      });

      const reviewedAt = new Date();
      const updatedApplication = await tx.promoterApplication.update({
        where: { id: input.applicationId },
        data: {
          status: 'approved',
          reviewedByAdminId: input.adminUserId,
          reviewedAt,
          notes: input.note ?? application.notes ?? null,
        },
      });

      const profile = await tx.promoterProfile.create({
        data: {
          tenantId: application.tenantId,
          tenantUserId: application.tenantUserId,
          promoterStatus: 'promoter',
          qualificationSource: 'manual',
          manualOverride: true,
          effectiveFrom: reviewedAt,
          effectiveTo: null,
        },
      });

      return { application: updatedApplication, profile };
    });
  }

  async rejectApplication(input: ReviewPromoterApplicationInput): Promise<any> {
    const application = await this.requireSubmittedApplication(input.applicationId);

    return this.db.promoterApplication.update({
      where: { id: input.applicationId },
      data: {
        status: 'rejected',
        reviewedByAdminId: input.adminUserId,
        reviewedAt: new Date(),
        notes: input.note ?? application.notes ?? null,
      },
    });
  }

  async getPromoterStatus(input: GetPromoterStatusInput): Promise<any> {
    const profile = await this.db.promoterProfile.findFirst({
      where: {
        tenantId: input.tenantId,
        tenantUserId: input.tenantUserId,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: 'desc' },
    } as any);

    if (profile) {
      return {
        promoterStatus: profile.promoterStatus,
        qualificationSource: profile.qualificationSource,
        manualOverride: Boolean(profile.manualOverride),
        effectiveFrom: profile.effectiveFrom,
        effectiveTo: profile.effectiveTo,
        source: 'profile',
      };
    }

    const application = await this.db.promoterApplication.findFirst({
      where: {
        tenantId: input.tenantId,
        tenantUserId: input.tenantUserId,
        status: { in: ['submitted', 'under_review'] },
      },
      orderBy: { submittedAt: 'desc' },
    } as any);

    if (application) {
      return {
        promoterStatus: 'pending_review',
        qualificationSource: 'manual',
        manualOverride: false,
        effectiveFrom: application.submittedAt,
        effectiveTo: null,
        source: 'application',
      };
    }

    return {
      promoterStatus: 'user',
      qualificationSource: 'none',
      manualOverride: false,
      effectiveFrom: null,
      effectiveTo: null,
      source: 'default',
    };
  }

  async rollupDailyMetrics(input: RollupPromoterMetricsInput): Promise<{ rows: number }> {
    const start = startOfDay(input.date);
    const end = endOfDay(input.date);
    const edges = await this.db.referralEdge.findMany({
      where: {
        tenantId: input.tenantId,
        lockedAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        tenantId: true,
        referrerTenantUserId: true,
        lockedAt: true,
      },
    } as any);

    const counts = new Map<string, number>();
    for (const edge of edges) {
      const key = `${edge.tenantId}:${edge.referrerTenantUserId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const edge of edges) {
      const key = `${edge.tenantId}:${edge.referrerTenantUserId}`;
      const count = counts.get(key);
      if (!count) continue;
      await this.db.promoterMetricsDaily.upsert({
        where: {
          tenantId_tenantUserId_date: {
            tenantId: edge.tenantId,
            tenantUserId: edge.referrerTenantUserId,
            date: start,
          },
        },
        update: {
          newPaidReferralsCount: count,
        },
        create: {
          tenantId: edge.tenantId,
          tenantUserId: edge.referrerTenantUserId,
          date: start,
          newPaidReferralsCount: count,
          grossRevenueReferred: 0n,
          netRewardGenerated: 0n,
          refundCount: 0,
        },
      } as any);
      counts.delete(key);
    }

    return { rows: new Set(edges.map((edge) => edge.referrerTenantUserId)).size };
  }

  async evaluateAutoQualifications(
    input: EvaluateAutoQualificationsInput,
  ): Promise<{ transitions: number }> {
    const tenantConfigs = await this.db.tenantConfig.findMany({
      where: {
        promoterConfig: { not: undefined },
      },
    } as any);

    let transitions = 0;
    for (const tenantConfig of tenantConfigs) {
      const config = parsePromoterConfig(tenantConfig.promoterConfig);
      if (!config?.autoPromoterRule) {
        continue;
      }

      const windowStart = startOfDay(
        new Date(input.asOf.getTime() - (config.autoPromoterRule.windowDays - 1) * 86_400_000),
      );
      const metrics = await this.db.promoterMetricsDaily.findMany({
        where: {
          tenantId: tenantConfig.tenantId,
          date: {
            gte: windowStart,
            lte: startOfDay(input.asOf),
          },
        },
      } as any);

      const totals = new Map<string, number>();
      for (const metric of metrics) {
        totals.set(
          metric.tenantUserId,
          (totals.get(metric.tenantUserId) ?? 0) + Number(metric.newPaidReferralsCount ?? 0),
        );
      }

      const activeProfiles = await this.db.promoterProfile.findMany({
        where: {
          tenantId: tenantConfig.tenantId,
          effectiveTo: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      } as any);
      const activeByUser = new Map<string, any>();
      for (const profile of activeProfiles) {
        if (!activeByUser.has(profile.tenantUserId)) {
          activeByUser.set(profile.tenantUserId, profile);
        }
      }

      for (const [tenantUserId, count] of totals.entries()) {
        const current = activeByUser.get(tenantUserId) ?? null;
        if (current?.manualOverride) {
          continue;
        }
        if (count < config.autoPromoterRule.requiredPaidReferrals) {
          continue;
        }
        if (current?.promoterStatus === 'promoter' && current?.qualificationSource === 'auto') {
          continue;
        }

        await this.db.$transaction(async (tx: any) => {
          if (current) {
            await tx.promoterProfile.updateMany({
              where: {
                tenantId: tenantConfig.tenantId,
                tenantUserId,
                effectiveTo: null,
              },
              data: { effectiveTo: input.asOf },
            });
          }
          await tx.promoterProfile.create({
            data: {
              tenantId: tenantConfig.tenantId,
              tenantUserId,
              promoterStatus: 'promoter',
              qualificationSource: 'auto',
              manualOverride: false,
              effectiveFrom: input.asOf,
              effectiveTo: null,
            },
          });
        });
        transitions += 1;
      }
    }

    return { transitions };
  }

  private async requireSubmittedApplication(applicationId: string): Promise<any> {
    const application = await this.db.promoterApplication.findUnique({
      where: { id: applicationId },
      include: { links: true },
    } as any);
    if (!application) {
      throw new PromoterError('promoter application not found', 'APPLICATION_NOT_FOUND');
    }
    if (!['submitted', 'under_review'].includes(application.status)) {
      throw new PromoterError('application is not reviewable', 'BAD_STATUS');
    }
    return application;
  }
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date: Date): Date {
  return new Date(startOfDay(date).getTime() + 86_400_000);
}

function parsePromoterConfig(raw: any): {
  autoPromoterRule?: {
    requiredPaidReferrals: number;
    windowDays: number;
  };
  retentionRules?: Array<{ windowDays: number; minimumPaidReferrals: number }>;
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const auto = raw.autoPromoterRule;
  const retentionRules = Array.isArray(raw.retentionRules)
    ? raw.retentionRules
        .filter(
          (rule: any) => Number.isFinite(rule?.windowDays) && Number.isFinite(rule?.minimumPaidReferrals),
        )
        .map((rule: any) => ({
          windowDays: Number(rule.windowDays),
          minimumPaidReferrals: Number(rule.minimumPaidReferrals),
        }))
    : [];

  return {
    ...(auto && Number.isFinite(auto.requiredPaidReferrals) && Number.isFinite(auto.windowDays)
      ? {
          autoPromoterRule: {
            requiredPaidReferrals: Number(auto.requiredPaidReferrals),
            windowDays: Number(auto.windowDays),
          },
        }
      : {}),
    retentionRules,
  };
}
