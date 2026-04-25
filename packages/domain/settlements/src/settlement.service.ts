import type { PrismaClient } from '@uprm/db';

export interface OpenSettlementCycleInput {
  tenantId: string;
  adminUserId?: string;
  note?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface CloseSettlementCycleInput {
  id: string;
  adminUserId?: string;
  note?: string;
}

export class SettlementService {
  private readonly db: PrismaClient;

  constructor(db?: PrismaClient) {
    this.db = db ?? (require('@uprm/db').prisma as PrismaClient);
  }

  async listCycles(filters?: { tenantId?: string; status?: string }): Promise<any[]> {
    return this.db.settlementCycle.findMany({
      where: {
        ...(filters?.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ openedAt: 'desc' }],
    } as any);
  }

  async getCycle(id: string): Promise<any | null> {
    return this.db.settlementCycle.findUnique({ where: { id } } as any);
  }

  async openCycle(input: OpenSettlementCycleInput): Promise<any> {
    const tenant = await this.db.tenant.findUnique({ where: { id: input.tenantId } } as any);
    if (!tenant) {
      throw new Error('tenant not found');
    }

    const existing = await this.db.settlementCycle.findFirst({
      where: {
        tenantId: input.tenantId,
        currency: tenant.baseCurrency,
        status: 'open',
      },
      orderBy: { openedAt: 'desc' },
    } as any);
    if (existing) {
      throw new Error('settlement cycle already open');
    }

    const snapshot = await this.computeSnapshot(input.tenantId, tenant.baseCurrency);
    const now = input.periodEnd ?? new Date();

    return this.db.settlementCycle.create({
      data: {
        tenantId: input.tenantId,
        currency: tenant.baseCurrency,
        periodStart: input.periodStart ?? startOfMonth(now),
        periodEnd: now,
        status: 'open',
        ledgerLiabilityMinor: snapshot.ledgerLiabilityMinor,
        pendingLiabilityMinor: snapshot.pendingLiabilityMinor,
        totalLiabilityMinor: snapshot.totalLiabilityMinor,
        note: input.note ?? null,
        openedByAdminId: input.adminUserId ?? null,
      },
    } as any);
  }

  async closeCycle(input: CloseSettlementCycleInput): Promise<any> {
    const current = await this.db.settlementCycle.findUnique({ where: { id: input.id } } as any);
    if (!current) {
      throw new Error('settlement cycle not found');
    }
    if (current.status !== 'open') {
      throw new Error('settlement cycle is not open');
    }

    const snapshot = await this.computeSnapshot(current.tenantId, current.currency);
    const closedAt = new Date();

    return this.db.settlementCycle.update({
      where: { id: input.id },
      data: {
        status: 'closed',
        periodEnd: closedAt,
        ledgerLiabilityMinor: snapshot.ledgerLiabilityMinor,
        pendingLiabilityMinor: snapshot.pendingLiabilityMinor,
        totalLiabilityMinor: snapshot.totalLiabilityMinor,
        note: input.note ?? current.note ?? null,
        closedByAdminId: input.adminUserId ?? null,
        closedAt,
      },
    } as any);
  }

  async computeSnapshot(tenantId: string, currency: string): Promise<{
    ledgerLiabilityMinor: bigint;
    pendingLiabilityMinor: bigint;
    totalLiabilityMinor: bigint;
  }> {
    const accounts = await this.db.ledgerAccount.findMany({
      where: { tenantId, accountType: 'user_balance', currency },
      select: { id: true },
    } as any);

    let ledgerLiabilityMinor = 0n;
    for (const account of accounts) {
      const aggregate = await this.db.ledgerPosting.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      } as any);
      const balance = BigInt(String(aggregate?._sum?.amount ?? 0));
      if (balance < 0n) {
        ledgerLiabilityMinor += -balance;
      }
    }

    const pendingRows = await this.db.scheduledPosting.findMany({
      where: {
        tenantId,
        status: { in: ['pending', 'processing'] },
      },
      select: { payload: true },
    } as any);

    let pendingLiabilityMinor = 0n;
    const userBalanceAccountIds = new Set(accounts.map((account) => account.id));
    for (const row of pendingRows) {
      const payload = row.payload as any;
      const postings = Array.isArray(payload?.postings) ? payload.postings : [];
      const payloadCurrency = typeof payload?.currency === 'string' ? payload.currency : null;
      if (payloadCurrency && payloadCurrency !== currency) {
        continue;
      }
      for (const posting of postings) {
        if (!userBalanceAccountIds.has(posting.accountId)) {
          continue;
        }
        const amount = BigInt(String(posting.amount ?? 0));
        if (amount < 0n) {
          pendingLiabilityMinor += -amount;
        }
      }
    }

    return {
      ledgerLiabilityMinor,
      pendingLiabilityMinor,
      totalLiabilityMinor: ledgerLiabilityMinor + pendingLiabilityMinor,
    };
  }
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}