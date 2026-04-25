import { prisma } from '@uprm/db';

const PAID_EVENT_TYPES = new Set(['invoice_paid', 'purchase_completed', 'subscription_paid']);

export interface ReportingRangeInput {
  tenantId: string;
  from?: Date;
  to?: Date;
}

export interface TenantLiabilityRangeInput extends ReportingRangeInput {
  asOf?: Date;
}

export interface DashboardSeriesInput {
  tenantId: string;
  days: number;
}

export class ReportingService {
  constructor(private readonly db: any = prisma as any) {}

  async rebuildConversionDaily(input: ReportingRangeInput) {
    const { tenantId, from, to } = normalizeRange(input);
    const [events, tenantUsers] = await Promise.all([
      this.db.ingestedEvent.findMany({
        where: {
          tenantId,
          ...(from || to
            ? {
                occurredAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
      }),
      this.db.tenantUser.findMany({ where: { tenantId } }),
    ]);
    const tenantUserIdByExternalUserId = new Map(
      tenantUsers
        .filter((row: any) => typeof row.externalUserId === 'string' && row.externalUserId)
        .map((row: any) => [row.externalUserId, row.id]),
    );

    const buckets = new Map<string, any>();
    for (const event of events) {
      const resolvedTenantUserId =
        event.tenantUserId ??
        (event.externalUserId ? tenantUserIdByExternalUserId.get(event.externalUserId) : undefined);
      const day = toUtcDay(event.occurredAt);
      const key = `${tenantId}|${day.toISOString()}|${event.eventType}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          tenantId,
          day,
          eventType: event.eventType,
          eventCount: 0,
          externalUsers: new Set<string>(),
          tenantUsers: new Set<string>(),
        });
      }
      const bucket = buckets.get(key)!;
      bucket.eventCount += 1;
      if (event.externalUserId) bucket.externalUsers.add(event.externalUserId);
      if (resolvedTenantUserId) bucket.tenantUsers.add(resolvedTenantUserId);
    }

    const rows = [...buckets.values()]
      .map((bucket) => ({
        tenantId: bucket.tenantId,
        day: bucket.day,
        eventType: bucket.eventType,
        eventCount: bucket.eventCount,
        distinctExternalUsers: bucket.externalUsers.size,
        distinctTenantUsers: bucket.tenantUsers.size,
      }))
      .sort((a, b) => a.day.getTime() - b.day.getTime() || a.eventType.localeCompare(b.eventType));

    await this.db.$transaction(async (tx: any) => {
      await tx.conversionDaily.deleteMany({
        where: {
          tenantId,
          ...(from || to
            ? {
                day: {
                  ...(from ? { gte: toUtcDay(from) } : {}),
                  ...(to ? { lte: toUtcDay(to) } : {}),
                },
              }
            : {}),
        },
      });
      if (rows.length) {
        await tx.conversionDaily.createMany({ data: rows });
      }
    });

    return rows;
  }

  async rebuildRewardPerformanceDaily(input: ReportingRangeInput) {
    const { tenantId, from, to } = normalizeRange(input);
    const [entries, expenseAccounts, balanceAccounts, postedScheduled] = await Promise.all([
      this.db.ledgerEntry.findMany({
        where: {
          tenantId,
          ...(from || to
            ? {
                createdAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
      }),
      this.db.ledgerAccount.findMany({
        where: { tenantId, accountType: 'tenant_reward_expense' },
      }),
      this.db.ledgerAccount.findMany({
        where: { tenantId, accountType: 'user_balance' },
      }),
      this.db.scheduledPosting.findMany({
        where: {
          tenantId,
          status: 'posted',
          ...(from || to
            ? {
                updatedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
      }),
    ]);

    const rewardEntries = entries.filter((entry: any) => isRewardDescription(entry.description));
    const rewardEntryIds = rewardEntries.map((entry: any) => entry.id).filter(Boolean);
    const expenseAccountIds = expenseAccounts.map((account: any) => account.id);
    const balanceAccountIds = balanceAccounts.map((account: any) => account.id);
    const balanceAccountToUserId = new Map(
      balanceAccounts.map((account: any) => [account.id, account.tenantUserId ?? null]),
    );

    const [expensePostings, balancePostings] = await Promise.all([
      rewardEntryIds.length && expenseAccountIds.length
        ? this.db.ledgerPosting.findMany({
            where: { entryId: { in: rewardEntryIds }, accountId: { in: expenseAccountIds } },
          })
        : [],
      rewardEntryIds.length && balanceAccountIds.length
        ? this.db.ledgerPosting.findMany({
            where: { entryId: { in: rewardEntryIds }, accountId: { in: balanceAccountIds } },
          })
        : [],
    ]);

    const expenseByEntryId = new Map<string, bigint>();
    for (const posting of expensePostings) {
      expenseByEntryId.set(
        posting.entryId,
        (expenseByEntryId.get(posting.entryId) ?? 0n) + BigInt(posting.amount),
      );
    }

    const beneficiaryUsersByEntryId = new Map<string, Set<string>>();
    for (const posting of balancePostings) {
      if (BigInt(posting.amount) >= 0n) continue;
      const userId = balanceAccountToUserId.get(posting.accountId);
      if (typeof userId !== 'string' || !userId) continue;
      if (!beneficiaryUsersByEntryId.has(posting.entryId)) {
        beneficiaryUsersByEntryId.set(posting.entryId, new Set<string>());
      }
      beneficiaryUsersByEntryId.get(posting.entryId)!.add(userId);
    }

    const buckets = new Map<string, any>();
    for (const entry of rewardEntries) {
      const day = toUtcDay(entry.createdAt);
      const key = `${tenantId}|${day.toISOString()}|${entry.currency}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          tenantId,
          day,
          currency: entry.currency,
          rewardEntryCount: 0,
          rewardExpenseMinor: 0n,
          beneficiaryUsers: new Set<string>(),
          postedScheduledCount: 0,
        });
      }
      const bucket = buckets.get(key)!;
      bucket.rewardEntryCount += 1;
      bucket.rewardExpenseMinor += expenseByEntryId.get(entry.id) ?? 0n;
      for (const userId of beneficiaryUsersByEntryId.get(entry.id) ?? []) {
        bucket.beneficiaryUsers.add(userId);
      }
    }

    for (const row of postedScheduled) {
      const day = toUtcDay(row.updatedAt ?? row.createdAt ?? new Date());
      const currency =
        inferCurrencyFromPayload(row.payload) ?? inferSingleCurrencyFromEntries(rewardEntries);
      const key = `${tenantId}|${day.toISOString()}|${currency}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          tenantId,
          day,
          currency,
          rewardEntryCount: 0,
          rewardExpenseMinor: 0n,
          beneficiaryUsers: new Set<string>(),
          postedScheduledCount: 0,
        });
      }
      buckets.get(key)!.postedScheduledCount += 1;
    }

    const rows = [...buckets.values()]
      .map((bucket) => ({
        tenantId: bucket.tenantId,
        day: bucket.day,
        currency: bucket.currency,
        rewardEntryCount: bucket.rewardEntryCount,
        rewardExpenseMinor: bucket.rewardExpenseMinor,
        distinctBeneficiaryUsers: bucket.beneficiaryUsers.size,
        postedScheduledCount: bucket.postedScheduledCount,
      }))
      .sort((a, b) => a.day.getTime() - b.day.getTime());

    await this.db.$transaction(async (tx: any) => {
      await tx.rewardPerformanceDaily.deleteMany({
        where: {
          tenantId,
          ...(from || to
            ? {
                day: {
                  ...(from ? { gte: toUtcDay(from) } : {}),
                  ...(to ? { lte: toUtcDay(to) } : {}),
                },
              }
            : {}),
        },
      });
      if (rows.length) {
        await tx.rewardPerformanceDaily.createMany({ data: rows });
      }
    });

    return rows;
  }

  async rebuildTenantLiabilityDaily(input: TenantLiabilityRangeInput) {
    const asOf = input.asOf ?? input.to ?? new Date();
    const tenantId = input.tenantId;
    const day = toUtcDay(asOf);
    const accounts = await this.db.ledgerAccount.findMany({
      where: { tenantId, accountType: 'user_balance' },
    });

    const buckets = new Map<string, any>();
    for (const account of accounts) {
      const postings = await this.db.ledgerPosting.findMany({
        where: {
          accountId: { in: [account.id] },
          createdAt: { lte: asOf },
        },
      });
      const rawSum = postings.reduce(
        (sum: bigint, posting: any) => sum + BigInt(posting.amount),
        0n,
      );
      const key = `${tenantId}|${day.toISOString()}|${account.currency}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          tenantId,
          day,
          currency: account.currency,
          rawLiabilityMinor: 0n,
          displayLiabilityMinor: 0n,
          accountCount: 0,
        });
      }
      const bucket = buckets.get(key)!;
      bucket.rawLiabilityMinor += rawSum;
      bucket.displayLiabilityMinor = -bucket.rawLiabilityMinor;
      bucket.accountCount += 1;
    }

    const rows = [...buckets.values()].sort((a, b) => a.day.getTime() - b.day.getTime());

    await this.db.$transaction(async (tx: any) => {
      await tx.tenantLiabilityDaily.deleteMany({
        where: { tenantId, day: { gte: day, lte: day } },
      });
      if (rows.length) {
        await tx.tenantLiabilityDaily.createMany({ data: rows });
      }
    });

    return rows;
  }

  async rebuildCohortRetentionDaily(input: ReportingRangeInput) {
    const { tenantId, from, to } = normalizeRange(input);
    const [users, events] = await Promise.all([
      this.db.tenantUser.findMany({
        where: {
          tenantId,
          ...(from || to
            ? {
                joinedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
      }),
      this.db.ingestedEvent.findMany({
        where: {
          tenantId,
          eventType: { in: [...PAID_EVENT_TYPES] },
          ...(from || to
            ? {
                occurredAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
      }),
    ]);
    const tenantUserIdByExternalUserId = new Map(
      users
        .filter((row: any) => typeof row.externalUserId === 'string' && row.externalUserId)
        .map((row: any) => [row.externalUserId, row.id]),
    );

    const cohortMembers = new Map<string, Set<string>>();
    for (const user of users) {
      const cohortDay = toUtcDay(user.joinedAt);
      const key = cohortDay.toISOString();
      if (!cohortMembers.has(key)) cohortMembers.set(key, new Set<string>());
      cohortMembers.get(key)!.add(user.id);
    }

    const activeUsersByDay = new Map<string, Set<string>>();
    for (const event of events) {
      const resolvedTenantUserId =
        event.tenantUserId ??
        (event.externalUserId ? tenantUserIdByExternalUserId.get(event.externalUserId) : undefined);
      if (!resolvedTenantUserId) continue;
      const activityDay = toUtcDay(event.occurredAt).toISOString();
      if (!activeUsersByDay.has(activityDay)) activeUsersByDay.set(activityDay, new Set<string>());
      activeUsersByDay.get(activityDay)!.add(resolvedTenantUserId);
    }

    const rows: any[] = [];
    for (const [cohortIso, members] of cohortMembers.entries()) {
      const cohortDay = new Date(cohortIso);
      for (const [activityIso, activeUsers] of activeUsersByDay.entries()) {
        const activityDay = new Date(activityIso);
        if (activityDay < cohortDay) continue;
        let retainedUsers = 0;
        for (const userId of members) {
          if (activeUsers.has(userId)) retainedUsers += 1;
        }
        if (!retainedUsers) continue;
        rows.push({
          tenantId,
          cohortDay,
          activityDay,
          cohortSize: members.size,
          retainedUsers,
        });
      }
    }

    rows.sort(
      (a, b) =>
        a.cohortDay.getTime() - b.cohortDay.getTime() ||
        a.activityDay.getTime() - b.activityDay.getTime(),
    );

    await this.db.$transaction(async (tx: any) => {
      await tx.cohortRetentionDaily.deleteMany({
        where: {
          tenantId,
          ...(from || to
            ? {
                cohortDay: {
                  ...(from ? { gte: toUtcDay(from) } : {}),
                  ...(to ? { lte: toUtcDay(to) } : {}),
                },
              }
            : {}),
        },
      });
      if (rows.length) {
        await tx.cohortRetentionDaily.createMany({ data: rows });
      }
    });

    return rows;
  }

  async rebuildAll(input: ReportingRangeInput & { asOf?: Date }) {
    const liabilityInput = input.asOf
      ? { ...input, asOf: input.asOf }
      : {
          tenantId: input.tenantId,
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
        };
    const [conversionDaily, rewardPerformanceDaily, tenantLiabilityDaily, cohortRetentionDaily] =
      await Promise.all([
        this.rebuildConversionDaily(input),
        this.rebuildRewardPerformanceDaily(input),
        this.rebuildTenantLiabilityDaily(liabilityInput),
        this.rebuildCohortRetentionDaily(input),
      ]);

    return {
      conversionDaily,
      rewardPerformanceDaily,
      tenantLiabilityDaily,
      cohortRetentionDaily,
    };
  }

  async getDashboardSeries(input: DashboardSeriesInput) {
    const rangeDays = Math.max(1, Math.min(input.days, 365));
    const now = new Date();
    const from = toUtcDay(new Date(now.getTime() - (rangeDays - 1) * 86_400_000));
    const to = endOfUtcDay(now);

    const [conversionDaily, rewardPerformanceDaily, tenantLiabilityDaily, cohortRetentionDaily] =
      await Promise.all([
        this.db.conversionDaily.findMany({
          where: { tenantId: input.tenantId, day: { gte: from, lte: to } },
          orderBy: [{ day: 'asc' }, { eventType: 'asc' }],
        }),
        this.db.rewardPerformanceDaily.findMany({
          where: { tenantId: input.tenantId, day: { gte: from, lte: to } },
          orderBy: [{ day: 'asc' }],
        }),
        this.db.tenantLiabilityDaily.findMany({
          where: { tenantId: input.tenantId, day: { gte: from, lte: to } },
          orderBy: [{ day: 'asc' }],
        }),
        this.db.cohortRetentionDaily.findMany({
          where: { tenantId: input.tenantId },
          orderBy: [{ cohortDay: 'asc' }, { activityDay: 'asc' }],
        }),
      ]);

    return {
      tenantId: input.tenantId,
      rangeDays,
      conversionDaily: conversionDaily.map((row: any) => ({
        day: toUtcDay(row.day).toISOString(),
        eventType: row.eventType,
        eventCount: row.eventCount,
        distinctExternalUsers: row.distinctExternalUsers,
        distinctTenantUsers: row.distinctTenantUsers,
      })),
      rewardPerformanceDaily: rewardPerformanceDaily.map((row: any) => ({
        day: toUtcDay(row.day).toISOString(),
        currency: row.currency,
        rewardEntryCount: row.rewardEntryCount,
        rewardExpenseMinor: BigInt(row.rewardExpenseMinor).toString(),
        distinctBeneficiaryUsers: row.distinctBeneficiaryUsers,
        postedScheduledCount: row.postedScheduledCount,
      })),
      tenantLiabilityDaily: tenantLiabilityDaily.map((row: any) => ({
        day: toUtcDay(row.day).toISOString(),
        currency: row.currency,
        rawLiabilityMinor: BigInt(row.rawLiabilityMinor).toString(),
        displayLiabilityMinor: BigInt(row.displayLiabilityMinor).toString(),
        accountCount: row.accountCount,
      })),
      cohortRetentionDaily: cohortRetentionDaily.map((row: any) => ({
        cohortDay: toUtcDay(row.cohortDay).toISOString(),
        activityDay: toUtcDay(row.activityDay).toISOString(),
        cohortSize: row.cohortSize,
        retainedUsers: row.retainedUsers,
      })),
    };
  }
}

function normalizeRange(input: ReportingRangeInput) {
  return {
    tenantId: input.tenantId,
    from: input.from,
    to: input.to,
  };
}

function toUtcDay(value: Date | string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(value: Date | string) {
  const day = toUtcDay(value);
  return new Date(day.getTime() + 86_399_999);
}

function inferCurrencyFromPayload(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.currency === 'string') return payload.currency;
  if (Array.isArray(payload.postings)) {
    const first = payload.postings.find((posting: any) => typeof posting?.currency === 'string');
    if (first?.currency) return first.currency;
  }
  return null;
}

function inferSingleCurrencyFromEntries(entries: any[]): string {
  return entries[0]?.currency ?? 'EUR';
}

function isRewardDescription(description: string) {
  const normalized = description.toLowerCase();
  return normalized.includes('referral reward') && normalized.startsWith('l');
}
