import { prisma, PrismaClient } from '@uprm/db';
import { WalletAllocationService } from './wallet-allocation.service';
import { WalletGrantService } from './wallet-grant.service';
import type { ReserveWalletRedemptionInput } from './types';

export class WalletRedemptionService {
  private readonly allocations = new WalletAllocationService();
  private readonly grants: WalletGrantService;

  constructor(private readonly db: PrismaClient = prisma) {
    this.grants = new WalletGrantService(db);
  }

  async reserveRedemption(input: ReserveWalletRedemptionInput) {
    const grants = await this.grants.listAvailableGrants(input.walletAccountId);
    const allocations = this.allocations.allocateFifo(grants as any, input.amountCredits);

    const redemption = await this.db.walletRedemption.create({
      data: {
        walletAccountId: input.walletAccountId,
        spendingTenantId: input.spendingTenantId,
        spendingTenantUserId: input.spendingTenantUserId ?? null,
        purchaseRef: input.purchaseRef ?? null,
        orderRef: input.orderRef ?? null,
        amountCredits: input.amountCredits,
        status: 'reserved',
      },
    } as any);

    for (const allocation of allocations) {
      await this.db.walletRedemptionAllocation.create({
        data: {
          redemptionId: redemption.id,
          walletGrantId: allocation.walletGrantId,
          issuerTenantId: allocation.issuerTenantId ?? null,
          amountCredits: allocation.amountCredits,
        },
      } as any);
      await this.db.walletGrant.update({
        where: { id: allocation.walletGrantId },
        data: {
          amountRemaining: { decrement: allocation.amountCredits },
        },
      } as any);
    }

    return { redemption, allocations };
  }

  async markPosted(redemptionId: string) {
    const redemption = await this.db.walletRedemption.findUnique({
      where: { id: redemptionId },
    } as any);

    if (!redemption || redemption.status !== 'reserved') {
      return redemption;
    }

    return this.db.walletRedemption.update({
      where: { id: redemptionId },
      data: { status: 'posted', postedAt: new Date() },
    } as any);
  }

  async releaseRedemption(redemptionId: string) {
    const redemption = await this.db.walletRedemption.findUnique({
      where: { id: redemptionId },
    } as any);

    if (!redemption || redemption.status !== 'reserved') {
      return redemption;
    }

    const allocations = await this.db.walletRedemptionAllocation.findMany({
      where: { redemptionId },
    } as any);

    for (const allocation of allocations as any[]) {
      await this.db.walletGrant.update({
        where: { id: allocation.walletGrantId },
        data: {
          amountRemaining: { increment: allocation.amountCredits },
        },
      } as any);
    }

    return this.db.walletRedemption.update({
      where: { id: redemptionId },
      data: { status: 'released' },
    } as any);
  }
}
