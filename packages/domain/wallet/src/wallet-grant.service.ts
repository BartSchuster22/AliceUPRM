import { prisma, PrismaClient } from '@uprm/db';
import type { CreateWalletGrantInput } from './types';

export class WalletGrantService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createGrant(input: CreateWalletGrantInput) {
    if (input.amountIssued <= 0n) {
      throw new Error('amountIssued must be positive');
    }

    return this.db.walletGrant.create({
      data: {
        walletAccountId: input.walletAccountId,
        issuerTenantId: input.issuerTenantId ?? null,
        sourceTenantUserId: input.sourceTenantUserId ?? null,
        originType: input.originType,
        sourceEventId: input.sourceEventId ?? null,
        sourceReferenceType: input.sourceReferenceType ?? null,
        sourceReferenceId: input.sourceReferenceId ?? null,
        amountIssued: input.amountIssued,
        amountRemaining: input.amountIssued,
        fxQuoteId: input.fxQuoteId ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    } as any);
  }

  async recordDelta(input: Omit<CreateWalletGrantInput, 'amountIssued'> & { amountDelta: bigint }) {
    if (input.amountDelta === 0n) {
      throw new Error('amountDelta must be non-zero');
    }

    return this.db.walletGrant.create({
      data: {
        walletAccountId: input.walletAccountId,
        issuerTenantId: input.issuerTenantId ?? null,
        sourceTenantUserId: input.sourceTenantUserId ?? null,
        originType: input.originType,
        sourceEventId: input.sourceEventId ?? null,
        sourceReferenceType: input.sourceReferenceType ?? null,
        sourceReferenceId: input.sourceReferenceId ?? null,
        amountIssued: input.amountDelta,
        amountRemaining: input.amountDelta,
        fxQuoteId: input.fxQuoteId ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    } as any);
  }

  async listAvailableGrants(walletAccountId: string) {
    return this.db.walletGrant.findMany({
      where: {
        walletAccountId,
        amountRemaining: { gt: 0 },
      },
      orderBy: [{ createdAt: 'asc' }],
    } as any);
  }
}
