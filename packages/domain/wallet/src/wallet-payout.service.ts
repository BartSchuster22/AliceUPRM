import { prisma, PrismaClient } from '@uprm/db';
import { WalletAllocationService } from './wallet-allocation.service';
import { WalletGrantService } from './wallet-grant.service';
import type { ReserveWalletPayoutInput } from './types';

export class WalletPayoutService {
  private readonly allocations = new WalletAllocationService();
  private readonly grants: WalletGrantService;

  constructor(private readonly db: PrismaClient = prisma) {
    this.grants = new WalletGrantService(db);
  }

  async reservePayout(input: ReserveWalletPayoutInput) {
    const grants = await this.grants.listAvailableGrants(input.walletAccountId);
    const allocations = this.allocations.allocateFifo(grants as any, input.amountCredits);

    const issuerTenantId = allocations[0]?.issuerTenantId ?? null;
    const reservation = await this.db.walletPayoutReservation.create({
      data: {
        walletAccountId: input.walletAccountId,
        payoutRequestId: input.payoutRequestId,
        issuerTenantId,
        amountCredits: input.amountCredits,
        status: 'reserved',
      },
    } as any);

    for (const allocation of allocations) {
      await this.db.walletPayoutAllocation.create({
        data: {
          walletPayoutReservationId: reservation.id,
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

    return { reservation, allocations };
  }

  async markSent(reservationId: string) {
    return this.db.walletPayoutReservation.update({
      where: { id: reservationId },
      data: { status: 'sent' },
    } as any);
  }

  async releaseReservation(reservationId: string) {
    const allocations = await this.db.walletPayoutAllocation.findMany({
      where: { walletPayoutReservationId: reservationId },
    } as any);

    for (const allocation of allocations as any[]) {
      await this.db.walletGrant.update({
        where: { id: allocation.walletGrantId },
        data: {
          amountRemaining: { increment: allocation.amountCredits },
        },
      } as any);
    }

    return this.db.walletPayoutReservation.update({
      where: { id: reservationId },
      data: { status: 'released' },
    } as any);
  }
}
