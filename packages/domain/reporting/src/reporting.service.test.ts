import { describe, expect, it } from 'vitest';
import { ReportingService } from './reporting.service';

class FakeDb {
  tenantUser = {
    rows: [] as any[],
    findMany: async ({ where }: any = {}) => {
      let rows = [...this.tenantUser.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.joinedAt?.gte) rows = rows.filter((row) => row.joinedAt >= where.joinedAt.gte);
      if (where?.joinedAt?.lte) rows = rows.filter((row) => row.joinedAt <= where.joinedAt.lte);
      return rows;
    },
  };

  ingestedEvent = {
    rows: [] as any[],
    findMany: async ({ where }: any = {}) => {
      let rows = [...this.ingestedEvent.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.occurredAt?.gte)
        rows = rows.filter((row) => row.occurredAt >= where.occurredAt.gte);
      if (where?.occurredAt?.lte)
        rows = rows.filter((row) => row.occurredAt <= where.occurredAt.lte);
      if (where?.eventType?.in)
        rows = rows.filter((row) => where.eventType.in.includes(row.eventType));
      return rows;
    },
  };

  ledgerEntry = {
    rows: [] as any[],
    findMany: async ({ where }: any = {}) => {
      let rows = [...this.ledgerEntry.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.createdAt?.gte) rows = rows.filter((row) => row.createdAt >= where.createdAt.gte);
      if (where?.createdAt?.lte) rows = rows.filter((row) => row.createdAt <= where.createdAt.lte);
      return rows;
    },
  };

  scheduledPosting = {
    rows: [] as any[],
    findMany: async ({ where }: any = {}) => {
      let rows = [...this.scheduledPosting.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.status) rows = rows.filter((row) => row.status === where.status);
      if (where?.updatedAt?.gte) rows = rows.filter((row) => row.updatedAt >= where.updatedAt.gte);
      if (where?.updatedAt?.lte) rows = rows.filter((row) => row.updatedAt <= where.updatedAt.lte);
      return rows;
    },
  };

  ledgerAccount = {
    rows: [] as any[],
    findMany: async ({ where }: any = {}) => {
      let rows = [...this.ledgerAccount.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.accountType) rows = rows.filter((row) => row.accountType === where.accountType);
      return rows;
    },
  };

  ledgerPosting = {
    rows: [] as any[],
    findMany: async ({ where }: any = {}) => {
      let rows = [...this.ledgerPosting.rows];
      if (where?.accountId?.in)
        rows = rows.filter((row) => where.accountId.in.includes(row.accountId));
      if (where?.entryId?.in) rows = rows.filter((row) => where.entryId.in.includes(row.entryId));
      if (where?.createdAt?.lte) rows = rows.filter((row) => row.createdAt <= where.createdAt.lte);
      return rows;
    },
  };

  conversionDaily = {
    rows: [] as any[],
    deleteMany: async ({ where }: any = {}) => {
      this.conversionDaily.rows = this.conversionDaily.rows.filter((row) => {
        if (where?.tenantId && row.tenantId !== where.tenantId) return true;
        if (where?.day?.gte && row.day < where.day.gte) return true;
        if (where?.day?.lte && row.day > where.day.lte) return true;
        return false;
      });
      return { count: 1 };
    },
    createMany: async ({ data }: any) => {
      this.conversionDaily.rows.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where, orderBy }: any = {}) => {
      let rows = [...this.conversionDaily.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.day?.gte) rows = rows.filter((row) => row.day >= where.day.gte);
      if (where?.day?.lte) rows = rows.filter((row) => row.day <= where.day.lte);
      if (orderBy)
        rows.sort(
          (a, b) => a.day.getTime() - b.day.getTime() || a.eventType.localeCompare(b.eventType),
        );
      return rows;
    },
  };

  rewardPerformanceDaily = {
    rows: [] as any[],
    deleteMany: async ({ where }: any = {}) => {
      this.rewardPerformanceDaily.rows = this.rewardPerformanceDaily.rows.filter((row) => {
        if (where?.tenantId && row.tenantId !== where.tenantId) return true;
        if (where?.day?.gte && row.day < where.day.gte) return true;
        if (where?.day?.lte && row.day > where.day.lte) return true;
        return false;
      });
      return { count: 1 };
    },
    createMany: async ({ data }: any) => {
      this.rewardPerformanceDaily.rows.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where, orderBy }: any = {}) => {
      let rows = [...this.rewardPerformanceDaily.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.day?.gte) rows = rows.filter((row) => row.day >= where.day.gte);
      if (where?.day?.lte) rows = rows.filter((row) => row.day <= where.day.lte);
      if (orderBy) rows.sort((a, b) => a.day.getTime() - b.day.getTime());
      return rows;
    },
  };

  tenantLiabilityDaily = {
    rows: [] as any[],
    deleteMany: async ({ where }: any = {}) => {
      this.tenantLiabilityDaily.rows = this.tenantLiabilityDaily.rows.filter((row) => {
        if (where?.tenantId && row.tenantId !== where.tenantId) return true;
        if (where?.day?.gte && row.day < where.day.gte) return true;
        if (where?.day?.lte && row.day > where.day.lte) return true;
        return false;
      });
      return { count: 1 };
    },
    createMany: async ({ data }: any) => {
      this.tenantLiabilityDaily.rows.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where, orderBy }: any = {}) => {
      let rows = [...this.tenantLiabilityDaily.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.day?.gte) rows = rows.filter((row) => row.day >= where.day.gte);
      if (where?.day?.lte) rows = rows.filter((row) => row.day <= where.day.lte);
      if (orderBy) rows.sort((a, b) => a.day.getTime() - b.day.getTime());
      return rows;
    },
  };

  cohortRetentionDaily = {
    rows: [] as any[],
    deleteMany: async ({ where }: any = {}) => {
      this.cohortRetentionDaily.rows = this.cohortRetentionDaily.rows.filter((row) => {
        if (where?.tenantId && row.tenantId !== where.tenantId) return true;
        if (where?.cohortDay?.gte && row.cohortDay < where.cohortDay.gte) return true;
        if (where?.cohortDay?.lte && row.cohortDay > where.cohortDay.lte) return true;
        return false;
      });
      return { count: 1 };
    },
    createMany: async ({ data }: any) => {
      this.cohortRetentionDaily.rows.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where, orderBy }: any = {}) => {
      let rows = [...this.cohortRetentionDaily.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (orderBy)
        rows.sort(
          (a, b) =>
            a.cohortDay.getTime() - b.cohortDay.getTime() ||
            a.activityDay.getTime() - b.activityDay.getTime(),
        );
      return rows;
    },
  };

  async $transaction(fn: any) {
    return fn(this);
  }
}

describe('ReportingService', () => {
  it('rebuilds conversion daily counts by tenant day and event type', async () => {
    const db = new FakeDb();
    db.tenantUser.rows.push(
      {
        id: 'tu1',
        tenantId: 'tenant-1',
        externalUserId: 'u1',
        joinedAt: new Date('2026-04-20T10:00:00.000Z'),
      },
      {
        id: 'tu2',
        tenantId: 'tenant-1',
        externalUserId: 'u2',
        joinedAt: new Date('2026-04-20T12:00:00.000Z'),
      },
      {
        id: 'tu3',
        tenantId: 'tenant-1',
        externalUserId: 'u3',
        joinedAt: new Date('2026-04-21T09:00:00.000Z'),
      },
    );
    db.ingestedEvent.rows.push(
      {
        tenantId: 'tenant-1',
        eventType: 'invoice_paid',
        externalUserId: 'u1',
        tenantUserId: null,
        occurredAt: new Date('2026-04-24T10:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        eventType: 'invoice_paid',
        externalUserId: 'u2',
        tenantUserId: 'tu2',
        occurredAt: new Date('2026-04-24T14:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        eventType: 'user_registered',
        externalUserId: 'u3',
        tenantUserId: null,
        occurredAt: new Date('2026-04-24T15:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        eventType: 'invoice_paid',
        externalUserId: 'u1',
        tenantUserId: null,
        occurredAt: new Date('2026-04-25T10:00:00.000Z'),
      },
    );

    const svc = new ReportingService(db as any);
    await svc.rebuildConversionDaily({ tenantId: 'tenant-1' });

    expect(db.conversionDaily.rows).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-1',
        eventType: 'invoice_paid',
        eventCount: 2,
        distinctExternalUsers: 2,
        distinctTenantUsers: 2,
        day: new Date('2026-04-24T00:00:00.000Z'),
      }),
      expect.objectContaining({
        tenantId: 'tenant-1',
        eventType: 'user_registered',
        eventCount: 1,
        distinctExternalUsers: 1,
        distinctTenantUsers: 1,
        day: new Date('2026-04-24T00:00:00.000Z'),
      }),
      expect.objectContaining({
        tenantId: 'tenant-1',
        eventType: 'invoice_paid',
        eventCount: 1,
        distinctExternalUsers: 1,
        distinctTenantUsers: 1,
        day: new Date('2026-04-25T00:00:00.000Z'),
      }),
    ]);
  });

  it('rebuilds reward performance daily from reward ledger entries and posted scheduled rows', async () => {
    const db = new FakeDb();
    db.ledgerEntry.rows.push(
      {
        id: 'entry-1',
        tenantId: 'tenant-1',
        currency: 'EUR',
        description: 'L1 referral reward for event evt-1',
        createdAt: new Date('2026-04-24T10:00:00.000Z'),
      },
      {
        id: 'entry-2',
        tenantId: 'tenant-1',
        currency: 'EUR',
        description: 'L2 referral reward for event evt-2',
        createdAt: new Date('2026-04-24T11:00:00.000Z'),
      },
      {
        id: 'entry-3',
        tenantId: 'tenant-1',
        currency: 'EUR',
        description: 'manual_adjustment:ops',
        createdAt: new Date('2026-04-24T12:00:00.000Z'),
      },
    );
    db.ledgerAccount.rows.push(
      {
        id: 'expense',
        tenantId: 'tenant-1',
        accountType: 'tenant_reward_expense',
        currency: 'EUR',
      },
      {
        id: 'balance-1',
        tenantId: 'tenant-1',
        accountType: 'user_balance',
        tenantUserId: 'user-1',
        currency: 'EUR',
      },
      {
        id: 'balance-2',
        tenantId: 'tenant-1',
        accountType: 'user_balance',
        tenantUserId: 'user-2',
        currency: 'EUR',
      },
    );
    db.ledgerPosting.rows.push(
      {
        entryId: 'entry-1',
        accountId: 'expense',
        amount: 100n,
        createdAt: new Date('2026-04-24T10:00:00.000Z'),
      },
      {
        entryId: 'entry-1',
        accountId: 'balance-1',
        amount: -100n,
        createdAt: new Date('2026-04-24T10:00:00.000Z'),
      },
      {
        entryId: 'entry-2',
        accountId: 'expense',
        amount: 200n,
        createdAt: new Date('2026-04-24T11:00:00.000Z'),
      },
      {
        entryId: 'entry-2',
        accountId: 'balance-2',
        amount: -200n,
        createdAt: new Date('2026-04-24T11:00:00.000Z'),
      },
      {
        entryId: 'entry-3',
        accountId: 'expense',
        amount: 50n,
        createdAt: new Date('2026-04-24T12:00:00.000Z'),
      },
    );
    db.scheduledPosting.rows.push(
      { tenantId: 'tenant-1', status: 'posted', updatedAt: new Date('2026-04-24T10:05:00.000Z') },
      { tenantId: 'tenant-1', status: 'posted', updatedAt: new Date('2026-04-24T11:05:00.000Z') },
      { tenantId: 'tenant-1', status: 'pending', updatedAt: new Date('2026-04-24T11:10:00.000Z') },
    );

    const svc = new ReportingService(db as any);
    await svc.rebuildRewardPerformanceDaily({ tenantId: 'tenant-1' });

    expect(db.rewardPerformanceDaily.rows).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-1',
        currency: 'EUR',
        rewardEntryCount: 2,
        rewardExpenseMinor: 300n,
        distinctBeneficiaryUsers: 2,
        postedScheduledCount: 2,
        day: new Date('2026-04-24T00:00:00.000Z'),
      }),
    ]);
  });

  it('rebuilds tenant liability daily with raw and display balances', async () => {
    const db = new FakeDb();
    db.ledgerAccount.rows.push(
      {
        id: 'balance-1',
        tenantId: 'tenant-1',
        accountType: 'user_balance',
        tenantUserId: 'user-1',
        currency: 'EUR',
      },
      {
        id: 'balance-2',
        tenantId: 'tenant-1',
        accountType: 'user_balance',
        tenantUserId: 'user-2',
        currency: 'EUR',
      },
    );
    db.ledgerPosting.rows.push(
      { accountId: 'balance-1', amount: -299n, createdAt: new Date('2026-04-24T10:00:00.000Z') },
      { accountId: 'balance-2', amount: -100n, createdAt: new Date('2026-04-24T10:00:00.000Z') },
    );

    const svc = new ReportingService(db as any);
    await svc.rebuildTenantLiabilityDaily({
      tenantId: 'tenant-1',
      asOf: new Date('2026-04-24T23:59:59.999Z'),
    });

    expect(db.tenantLiabilityDaily.rows).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-1',
        currency: 'EUR',
        rawLiabilityMinor: -399n,
        displayLiabilityMinor: 399n,
        accountCount: 2,
        day: new Date('2026-04-24T00:00:00.000Z'),
      }),
    ]);
  });

  it('rebuilds cohort retention daily from signup cohorts and paid activity', async () => {
    const db = new FakeDb();
    db.tenantUser.rows.push(
      {
        id: 'tu1',
        tenantId: 'tenant-1',
        externalUserId: 'u1',
        joinedAt: new Date('2026-04-20T10:00:00.000Z'),
      },
      {
        id: 'tu2',
        tenantId: 'tenant-1',
        externalUserId: 'u2',
        joinedAt: new Date('2026-04-20T12:00:00.000Z'),
      },
      {
        id: 'tu3',
        tenantId: 'tenant-1',
        externalUserId: 'u3',
        joinedAt: new Date('2026-04-21T12:00:00.000Z'),
      },
    );
    db.ingestedEvent.rows.push(
      {
        tenantId: 'tenant-1',
        eventType: 'invoice_paid',
        tenantUserId: null,
        externalUserId: 'u1',
        occurredAt: new Date('2026-04-20T18:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        eventType: 'invoice_paid',
        tenantUserId: null,
        externalUserId: 'u2',
        occurredAt: new Date('2026-04-21T18:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        eventType: 'purchase_completed',
        tenantUserId: null,
        externalUserId: 'u3',
        occurredAt: new Date('2026-04-22T18:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        eventType: 'user_registered',
        tenantUserId: null,
        externalUserId: 'u3',
        occurredAt: new Date('2026-04-21T09:00:00.000Z'),
      },
    );

    const svc = new ReportingService(db as any);
    await svc.rebuildCohortRetentionDaily({ tenantId: 'tenant-1' });

    expect(db.cohortRetentionDaily.rows).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-1',
        cohortDay: new Date('2026-04-20T00:00:00.000Z'),
        activityDay: new Date('2026-04-20T00:00:00.000Z'),
        cohortSize: 2,
        retainedUsers: 1,
      }),
      expect.objectContaining({
        tenantId: 'tenant-1',
        cohortDay: new Date('2026-04-20T00:00:00.000Z'),
        activityDay: new Date('2026-04-21T00:00:00.000Z'),
        cohortSize: 2,
        retainedUsers: 1,
      }),
      expect.objectContaining({
        tenantId: 'tenant-1',
        cohortDay: new Date('2026-04-21T00:00:00.000Z'),
        activityDay: new Date('2026-04-22T00:00:00.000Z'),
        cohortSize: 1,
        retainedUsers: 1,
      }),
    ]);
  });

  it('returns bounded dashboard series with stringified bigints for API callers', async () => {
    const db = new FakeDb();
    db.conversionDaily.rows.push({
      tenantId: 'tenant-1',
      day: new Date('2026-04-24T00:00:00.000Z'),
      eventType: 'invoice_paid',
      eventCount: 2,
      distinctExternalUsers: 2,
      distinctTenantUsers: 2,
    });
    db.rewardPerformanceDaily.rows.push({
      tenantId: 'tenant-1',
      day: new Date('2026-04-24T00:00:00.000Z'),
      currency: 'EUR',
      rewardEntryCount: 2,
      rewardExpenseMinor: 300n,
      distinctBeneficiaryUsers: 2,
      postedScheduledCount: 2,
    });
    db.tenantLiabilityDaily.rows.push({
      tenantId: 'tenant-1',
      day: new Date('2026-04-24T00:00:00.000Z'),
      currency: 'EUR',
      rawLiabilityMinor: -399n,
      displayLiabilityMinor: 399n,
      accountCount: 2,
    });
    db.cohortRetentionDaily.rows.push({
      tenantId: 'tenant-1',
      cohortDay: new Date('2026-04-20T00:00:00.000Z'),
      activityDay: new Date('2026-04-24T00:00:00.000Z'),
      cohortSize: 2,
      retainedUsers: 1,
    });

    const svc = new ReportingService(db as any, () => new Date('2026-04-24T12:00:00.000Z'));
    const result = await svc.getDashboardSeries({ tenantId: 'tenant-1', days: 30 });

    expect(result.tenantId).toBe('tenant-1');
    expect(result.rangeDays).toBe(30);
    expect(result.rewardPerformanceDaily[0].rewardExpenseMinor).toBe('300');
    expect(result.tenantLiabilityDaily[0].displayLiabilityMinor).toBe('399');
    expect(result.conversionDaily[0].eventType).toBe('invoice_paid');
    expect(result.cohortRetentionDaily[0].retainedUsers).toBe(1);
  });
});
