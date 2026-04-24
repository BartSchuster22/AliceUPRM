import { describe, expect, it } from 'vitest';
import { FraudService } from './fraud.service';
import { parseFraudConfig } from './config';

class FakeDb {
  tenantConfig = {
    rows: [] as any[],
    findUnique: async ({ where: { tenantId } }: any) =>
      this.tenantConfig.rows.find((row) => row.tenantId === tenantId) ?? null,
  };

  riskSignal = {
    rows: [] as any[],
    findFirst: async ({ where }: any) =>
      this.riskSignal.rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      ) ?? null,
    findMany: async ({ where, select, orderBy, take }: any) => {
      let rows = this.riskSignal.rows.filter((row) => {
        if (where.tenantId && row.tenantId !== where.tenantId) return false;
        if (where.tenantUserId !== undefined && row.tenantUserId !== where.tenantUserId)
          return false;
        if (where.status && row.status !== where.status) return false;
        if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
        return true;
      });
      rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (typeof take === 'number') rows = rows.slice(0, take);
      if (select?.score) return rows.map((row) => ({ score: row.score }));
      return rows;
    },
    create: async ({ data }: any) => {
      const row = { id: `sig-${this.riskSignal.rows.length + 1}`, status: 'active', ...data };
      this.riskSignal.rows.push(row);
      return row;
    },
  };

  riskCase = {
    rows: [] as any[],
    findFirst: async ({ where, include }: any) => {
      const row =
        this.riskCase.rows.find((item) => {
          if (where.tenantId && item.tenantId !== where.tenantId) return false;
          if (where.tenantUserId && item.tenantUserId !== where.tenantUserId) return false;
          if (where.status?.in && !where.status.in.includes(item.status)) return false;
          return true;
        }) ?? null;
      if (!row) return null;
      if (include?.rewardHolds) {
        return {
          ...row,
          rewardHolds: this.rewardHold.rows.filter((hold) => hold.riskCaseId === row.id),
        };
      }
      return row;
    },
    findMany: async ({ where }: any) => {
      let rows = [...this.riskCase.rows];
      if (where?.tenantId) rows = rows.filter((row) => row.tenantId === where.tenantId);
      if (where?.status) rows = rows.filter((row) => row.status === where.status);
      if (where?.severity) rows = rows.filter((row) => row.severity === where.severity);
      return rows.map((row) => ({
        ...row,
        rewardHolds: this.rewardHold.rows.filter((hold) => hold.riskCaseId === row.id),
      }));
    },
    findUnique: async ({ where: { id }, include }: any) => {
      const row = this.riskCase.rows.find((item) => item.id === id) ?? null;
      if (!row) return null;
      if (!include) return row;
      return {
        ...row,
        openedBySignal: row.openedBySignalId
          ? (this.riskSignal.rows.find((signal) => signal.id === row.openedBySignalId) ?? null)
          : null,
        events: this.riskCaseEvent.rows.filter((event) => event.riskCaseId === id),
        rewardHolds: this.rewardHold.rows.filter((hold) => hold.riskCaseId === id),
      };
    },
    create: async ({ data }: any) => {
      const row = {
        id: `case-${this.riskCase.rows.length + 1}`,
        resolution: null,
        resolutionNote: null,
        resolvedAt: null,
        ...data,
        openedAt: new Date(),
      };
      this.riskCase.rows.push(row);
      return row;
    },
    update: async ({ where: { id }, data }: any) => {
      const row = this.riskCase.rows.find((item) => item.id === id);
      Object.assign(row, data);
      return row;
    },
  };

  riskCaseEvent = {
    rows: [] as any[],
    create: async ({ data }: any) => {
      const row = {
        id: `event-${this.riskCaseEvent.rows.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      this.riskCaseEvent.rows.push(row);
      return row;
    },
  };

  rewardHold = {
    rows: [] as any[],
    findFirst: async ({ where }: any) =>
      this.rewardHold.rows.find(
        (row) => row.scheduledPostingId === where.scheduledPostingId && row.status === where.status,
      ) ?? null,
    findMany: async ({ where }: any) =>
      this.rewardHold.rows.filter((row) => {
        if (where.riskCaseId && row.riskCaseId !== where.riskCaseId) return false;
        if (where.status && row.status !== where.status) return false;
        return true;
      }),
    createMany: async ({ data }: any) => {
      for (const entry of data) {
        if (
          !this.rewardHold.rows.some((row) => row.scheduledPostingId === entry.scheduledPostingId)
        ) {
          this.rewardHold.rows.push({
            id: `hold-${this.rewardHold.rows.length + 1}`,
            status: 'active',
            createdAt: new Date(),
            releasedAt: null,
            rejectedAt: null,
            ...entry,
          });
        }
      }
      return { count: data.length };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of this.rewardHold.rows) {
        if (where.riskCaseId && row.riskCaseId !== where.riskCaseId) continue;
        if (where.status && row.status !== where.status) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };

  scheduledPosting = {
    rows: [] as any[],
    findMany: async ({ where }: any) =>
      this.scheduledPosting.rows.filter((row) => {
        if (where.tenantId && row.tenantId !== where.tenantId) return false;
        if (
          where.beneficiaryTenantUserId &&
          row.beneficiaryTenantUserId !== where.beneficiaryTenantUserId
        )
          return false;
        if (where.status && row.status !== where.status) return false;
        return true;
      }),
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of this.scheduledPosting.rows) {
        if (where.id?.in && !where.id.in.includes(row.id)) continue;
        if (where.status && row.status !== where.status) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };

  async $transaction(fn: any) {
    return fn(this);
  }
}

describe('parseFraudConfig', () => {
  it('applies safe defaults', () => {
    const config = parseFraudConfig({});
    expect(config.enabled).toBe(true);
    expect(config.caseThreshold).toBe(100);
    expect(config.signalWeights.self_referral_attempt).toBe(100);
  });
});

describe('FraudService', () => {
  it('opens one case and creates holds when threshold is crossed', async () => {
    const db = new FakeDb();
    db.tenantConfig.rows.push({ tenantId: 'tenant-1', fraudConfig: { caseThreshold: 100 } });
    db.scheduledPosting.rows.push({
      id: 'sp-1',
      tenantId: 'tenant-1',
      beneficiaryTenantUserId: 'user-1',
      status: 'pending',
    });

    const service = new FraudService(db as any);
    const result = await service.recordSignal({
      tenantId: 'tenant-1',
      tenantUserId: 'user-1',
      signalType: 'self_referral_attempt',
      score: 100,
      metadata: { reason: 'self' },
    });

    expect(result?.rollingScore).toBe(100);
    expect(result?.caseOpened?.status).toBe('open');
    expect(db.riskCase.rows).toHaveLength(1);
    expect(db.rewardHold.rows).toHaveLength(1);
    expect(db.rewardHold.rows[0].scheduledPostingId).toBe('sp-1');
  });

  it('does not open duplicate active cases after repeated threshold crossings', async () => {
    const db = new FakeDb();
    db.tenantConfig.rows.push({ tenantId: 'tenant-1', fraudConfig: { caseThreshold: 100 } });
    const service = new FraudService(db as any);

    await service.recordSignal({
      tenantId: 'tenant-1',
      tenantUserId: 'user-1',
      signalType: 'same_payment_fingerprint',
      score: 60,
    });
    await service.recordSignal({
      tenantId: 'tenant-1',
      tenantUserId: 'user-1',
      signalType: 'same_ip_multiple_signups',
      score: 50,
    });
    await service.recordSignal({
      tenantId: 'tenant-1',
      tenantUserId: 'user-1',
      signalType: 'referral_velocity',
      score: 30,
    });

    expect(db.riskCase.rows).toHaveLength(1);
  });

  it('allow releases all holds atomically', async () => {
    const db = new FakeDb();
    db.tenantConfig.rows.push({ tenantId: 'tenant-1', fraudConfig: { caseThreshold: 100 } });
    db.scheduledPosting.rows.push({
      id: 'sp-1',
      tenantId: 'tenant-1',
      beneficiaryTenantUserId: 'user-1',
      status: 'pending',
    });
    db.scheduledPosting.rows.push({
      id: 'sp-2',
      tenantId: 'tenant-1',
      beneficiaryTenantUserId: 'user-1',
      status: 'pending',
    });
    const service = new FraudService(db as any);
    const opened = await service.recordSignal({
      tenantId: 'tenant-1',
      tenantUserId: 'user-1',
      signalType: 'self_referral_attempt',
      score: 100,
    });

    const detail = await service.allowCase(
      opened!.caseOpened!.id,
      { actorType: 'admin', actorId: 'admin-1' },
      'allow',
    );

    expect(detail.status).toBe('allowed');
    expect(db.rewardHold.rows.every((row) => row.status === 'released')).toBe(true);
  });

  it('reject cancels pending scheduled postings and marks holds rejected', async () => {
    const db = new FakeDb();
    db.tenantConfig.rows.push({ tenantId: 'tenant-1', fraudConfig: { caseThreshold: 100 } });
    db.scheduledPosting.rows.push({
      id: 'sp-1',
      tenantId: 'tenant-1',
      beneficiaryTenantUserId: 'user-1',
      status: 'pending',
    });
    const service = new FraudService(db as any);
    const opened = await service.recordSignal({
      tenantId: 'tenant-1',
      tenantUserId: 'user-1',
      signalType: 'self_referral_attempt',
      score: 100,
    });

    const detail = await service.rejectCase(
      opened!.caseOpened!.id,
      { actorType: 'admin', actorId: 'admin-1' },
      'reject',
    );

    expect(detail.status).toBe('rejected');
    expect(db.scheduledPosting.rows[0].status).toBe('cancelled');
    expect(db.rewardHold.rows[0].status).toBe('rejected');
  });
});
